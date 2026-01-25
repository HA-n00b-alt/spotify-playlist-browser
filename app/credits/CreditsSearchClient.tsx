'use client'

import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDuration } from '@/lib/musicbrainz'

type RoleOption = 'producer' | 'songwriter' | 'mixer' | 'engineer' | 'artist'

interface MusoProfileSummary {
  id?: string
  name?: string
  avatarUrl?: string | null
  creditCount?: number
  collaboratorsCount?: number
}

interface SearchResult {
  id: string
  title: string
  artist: string
  album: string
  year: string
  length: number
  isrc?: string
  spotifyTrackId?: string
  isrcDetails?: Array<{
    value: string
    hasDeezer: boolean
    selected?: boolean
    reason?: string
  }>
  releaseId: string
  coverArtUrl?: string | null
  previewUrl?: string | null
  source?: 'muso' | 'musicbrainz'
}

const ROLE_OPTIONS: Array<{ value: RoleOption; label: string }> = [
  { value: 'producer', label: 'Producer' },
  { value: 'songwriter', label: 'Songwriter' },
  { value: 'mixer', label: 'Mixer' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'artist', label: 'Artist' },
]

const cacheKeyFor = (searchName: string, searchRole: string, startDate: string, endDate: string) =>
  `credits_cache_${searchRole}_${searchName.toLowerCase()}_${startDate || 'any'}_${endDate || 'any'}`

export default function CreditsSearchClient() {
  const [name, setName] = useState('')
  const [role, setRole] = useState<RoleOption>('producer')
  const [profileInfo, setProfileInfo] = useState<MusoProfileSummary | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])
  const [trackCount, setTrackCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const blurTimeoutRef = useRef<number | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [debugMode, setDebugMode] = useState(false)
  const [debugPayload, setDebugPayload] = useState<any | null>(null)
  const [showingCached, setShowingCached] = useState(false)
  const resultsRef = useRef<SearchResult[]>([])
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const streamRef = useRef<EventSource | null>(null)
  const requestIdRef = useRef(0)
  const [lastBatchCount, setLastBatchCount] = useState(0)
  const [totalWorks, setTotalWorks] = useState<number | null>(null)
  const [pageSize, setPageSize] = useState<number>(20)
  const [currentPage, setCurrentPage] = useState(1)
  const totalWorksRef = useRef<number | null>(null)
  const autoLoadRef = useRef(true)
  const replaceOnFirstResultRef = useRef(false)
  const [sortField, setSortField] = useState<'title' | 'artist' | 'album' | 'duration' | 'bpm' | 'key' | 'year' | null>('year')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [releaseDateStart, setReleaseDateStart] = useState('')
  const [releaseDateEnd, setReleaseDateEnd] = useState('')
  const [bpmByIsrc, setBpmByIsrc] = useState<Record<string, number | null>>({})
  const [keyByIsrc, setKeyByIsrc] = useState<Record<string, string | null>>({})
  const [scaleByIsrc, setScaleByIsrc] = useState<Record<string, string | null>>({})
  const [bpmErrorByIsrc, setBpmErrorByIsrc] = useState<Record<string, string | null>>({})
  const [bpmLoadingIsrcs, setBpmLoadingIsrcs] = useState<Set<string>>(new Set())
  const [bpmBatchLoading, setBpmBatchLoading] = useState(false)
  const [bpmBulkLoading, setBpmBulkLoading] = useState(false)
  const bpmFetchedIsrcsRef = useRef<Set<string>>(new Set())
  const bpmFetchTimeoutRef = useRef<number | null>(null)
  const searchParams = useSearchParams()
  const autoSearchRef = useRef(false)

  const limit = Math.min(pageSize, 50)
  const historyKey = 'creditsSearchHistory'
  const pageSizeKey = 'credits_rows_per_page'
  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedPageSize = window.localStorage.getItem(pageSizeKey)
    if (storedPageSize && !Number.isNaN(Number(storedPageSize))) {
      setPageSize(Math.min(Number(storedPageSize), 50))
    }
    try {
      const stored = window.localStorage.getItem(historyKey)
      if (!stored) return
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        setHistory(parsed.filter((item) => typeof item === 'string'))
      }
    } catch {
      // Ignore invalid localStorage
    }
  }, [])


  useEffect(() => {
    resultsRef.current = results
  }, [results])

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.close()
        streamRef.current = null
      }
    }
  }, [])

  const fetchBpmCacheForIsrcs = async (isrcs: string[]) => {
    if (isrcs.length === 0) return
    setBpmBatchLoading(true)
    try {
      const res = await fetch('/api/bpm/by-isrc/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isrcs }),
      })
      const payload = await res.json().catch(() => ({}))
      const results = payload?.results || {}
      setBpmByIsrc((prev) => {
        const next = { ...prev }
        for (const isrc of isrcs) {
          if (results[isrc]?.bpm !== undefined) {
            next[isrc] = results[isrc].bpm
          }
        }
        return next
      })
      setKeyByIsrc((prev) => {
        const next = { ...prev }
        for (const isrc of isrcs) {
          if (results[isrc]?.key !== undefined) {
            next[isrc] = results[isrc].key ?? null
          }
        }
        return next
      })
      setScaleByIsrc((prev) => {
        const next = { ...prev }
        for (const isrc of isrcs) {
          if (results[isrc]?.scale !== undefined) {
            next[isrc] = results[isrc].scale ?? null
          }
        }
        return next
      })
      setBpmErrorByIsrc((prev) => {
        const next = { ...prev }
        for (const isrc of isrcs) {
          if (results[isrc]?.error !== undefined) {
            next[isrc] = results[isrc].error || null
          }
        }
        return next
      })
    } catch {
      // Ignore cache failures
    } finally {
      setBpmBatchLoading(false)
      setBpmLoadingIsrcs((prev) => {
        const next = new Set(prev)
        isrcs.forEach((isrc) => next.delete(isrc))
        return next
      })
    }
  }

  useEffect(() => {
    const pendingIsrcs = Array.from(new Set(results.map((item) => item.isrc).filter(Boolean))) as string[]
    const unseenIsrcs = pendingIsrcs.filter((isrc) => !bpmFetchedIsrcsRef.current.has(isrc))
    if (unseenIsrcs.length === 0) return

    if (bpmFetchTimeoutRef.current) {
      window.clearTimeout(bpmFetchTimeoutRef.current)
    }
    bpmFetchTimeoutRef.current = window.setTimeout(() => {
      unseenIsrcs.forEach((isrc) => bpmFetchedIsrcsRef.current.add(isrc))
      setBpmLoadingIsrcs((prev) => {
        const next = new Set(prev)
        unseenIsrcs.forEach((isrc) => next.add(isrc))
        return next
      })
      fetchBpmCacheForIsrcs(unseenIsrcs)
    }, 300)
  }, [results])

  const handleTogglePreview = (track: SearchResult) => {
    if (!track.previewUrl) return
    if (!audioRef.current) {
      audioRef.current = new Audio()
    }

    const audio = audioRef.current
    const isSameTrack = playingId === track.id
    if (isSameTrack) {
      audio.pause()
      audio.currentTime = 0
      setPlayingId(null)
      return
    }

    audio.pause()
    audio.src = track.previewUrl
    audio.currentTime = 0
    audio.play().then(() => {
      setPlayingId(track.id)
    }).catch(() => {
      setPlayingId(null)
    })
    audio.onended = () => {
      setPlayingId(null)
    }
  }

  const fetchResultsStream = useCallback(async (
    searchName: string,
    offset = 0,
    append = false,
    refresh = false,
    replaceOnFirstResult = false
  ) => {
    const trimmed = searchName.trim()
    if (!trimmed) {
      setError('Enter a name to search')
      return
    }
    if (streamRef.current) {
      streamRef.current.close()
      streamRef.current = null
    }
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setLoading(true)
    setError(null)
    if (!append) {
      setResults([])
      setTrackCount(0)
      setLastBatchCount(0)
      setTotalWorks(null)
      totalWorksRef.current = null
      setCurrentPage(1)
      autoLoadRef.current = true
      setShowingCached(false)
      setProfileInfo(null)
      setBpmByIsrc({})
      setKeyByIsrc({})
      setScaleByIsrc({})
      setBpmErrorByIsrc({})
      setBpmLoadingIsrcs(new Set())
      setBpmBatchLoading(false)
      bpmFetchedIsrcsRef.current = new Set()
      if (bpmFetchTimeoutRef.current) {
        window.clearTimeout(bpmFetchTimeoutRef.current)
        bpmFetchTimeoutRef.current = null
      }
    }
    replaceOnFirstResultRef.current = replaceOnFirstResult
    setStatusMessage(`Loading ${limit} results…`)
    const refreshParam = refresh ? '&refresh=true' : ''
    const params = new URLSearchParams()
    params.set('name', trimmed)
    params.set('role', role)
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    params.set('stream', 'true')
    if (releaseDateStart) {
      params.set('releaseDateStart', releaseDateStart)
    }
    if (releaseDateEnd) {
      params.set('releaseDateEnd', releaseDateEnd)
    }
    const url = `/api/creditsearch?${params.toString()}${refreshParam}`

    const source = new EventSource(url)
    streamRef.current = source

    let batchCount = 0
    let replaced = false
    source.onmessage = (event) => {
      if (requestIdRef.current !== requestId) {
        source.close()
        return
      }
      try {
        const payload = JSON.parse(event.data)
        if (payload.type === 'meta') {
          if (typeof payload.totalWorks === 'number') {
            setTotalWorks(payload.totalWorks)
            totalWorksRef.current = payload.totalWorks
          }
          return
        }
        if (payload.type === 'profile') {
          setProfileInfo(payload.profile || null)
          return
        }
        if (payload.type === 'cached' && Array.isArray(payload.results)) {
          setResults(payload.results)
          setTrackCount(payload.results.length)
          setLastBatchCount(payload.results.length)
          setShowingCached(true)
          setLoading(false)
          setStatusMessage('Showing cached results. Refresh to update.')
          return
        }
        if (payload.type === 'result' && payload.track) {
          if (replaceOnFirstResultRef.current && !replaced) {
            setResults([payload.track])
            setTrackCount(1)
            setShowingCached(false)
            replaced = true
          } else {
            setResults((prev) => [...prev, payload.track])
            setTrackCount((prev) => prev + 1)
          }
          batchCount += 1
          const totalLoaded = offset + batchCount
          if (typeof totalWorksRef.current === 'number') {
            setStatusMessage(`Loaded ${totalLoaded} of ${totalWorksRef.current} works…`)
          } else {
            setStatusMessage(`Loaded ${batchCount} of ${limit} (total ${totalLoaded})…`)
          }
          return
        }
        if (payload.type === 'done') {
          const streamedCount = typeof payload.count === 'number' ? payload.count : 0
          setLastBatchCount(streamedCount)
          setLoading(false)
          if (typeof totalWorksRef.current === 'number') {
            const totalLoaded = offset + streamedCount
            setStatusMessage(totalLoaded > 0 ? `Loaded ${totalLoaded} of ${totalWorksRef.current} works.` : 'No results found yet.')
          } else {
            setStatusMessage(streamedCount > 0 ? `Loaded ${streamedCount} results.` : 'No results found yet.')
          }
          source.close()
          streamRef.current = null
          if (resultsRef.current.length > 0 && typeof window !== 'undefined') {
            window.localStorage.setItem(
              cacheKeyFor(trimmed, role, releaseDateStart, releaseDateEnd),
              JSON.stringify(resultsRef.current)
            )
          }
          if (autoLoadRef.current && streamedCount === limit) {
            window.setTimeout(() => {
              if (requestIdRef.current === requestId) {
                fetchResultsStream(trimmed, offset + streamedCount, true, false)
              }
            }, 0)
          }
          return
        }
        if (payload.type === 'error') {
          setError(payload.message || 'MusicBrainz search failed')
          setLoading(false)
          setStatusMessage(null)
          source.close()
          streamRef.current = null
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'MusicBrainz search failed')
        setLoading(false)
        setStatusMessage(null)
        source.close()
        streamRef.current = null
      }
    }

    source.onerror = () => {
      if (requestIdRef.current !== requestId) {
        source.close()
        return
      }
      setError('MusicBrainz search failed')
      setLoading(false)
      setStatusMessage(null)
      source.close()
      streamRef.current = null
    }
  }, [limit, releaseDateEnd, releaseDateStart, role])

  useEffect(() => {
    if (autoSearchRef.current) return
    const rawName = searchParams?.get('name') || ''
    const rawRole = searchParams?.get('role') || ''
    const trimmed = rawName.trim()
    if (!trimmed) return
    const normalizedRole = ROLE_OPTIONS.find((option) => option.value === rawRole)?.value || 'producer'
    autoSearchRef.current = true
    setName(trimmed)
    setRole(normalizedRole)
    fetchResultsStream(trimmed, 0, false, true)
  }, [searchParams, fetchResultsStream])

  const fetchResultsDebug = async (searchName: string) => {
    const trimmed = searchName.trim()
    if (!trimmed) {
      setError('Enter a name to search')
      return
    }
    if (streamRef.current) {
      streamRef.current.close()
      streamRef.current = null
    }
    setLoading(true)
    setError(null)
    setShowingCached(false)
    setStatusMessage('Loading debug results...')
    setResults([])
    setTrackCount(0)
    setLastBatchCount(0)
    setTotalWorks(null)
    totalWorksRef.current = null
    setDebugPayload(null)
    setProfileInfo(null)
    setBpmByIsrc({})
    setKeyByIsrc({})
    setScaleByIsrc({})
    setBpmErrorByIsrc({})
    setBpmLoadingIsrcs(new Set())
    setBpmBatchLoading(false)
    setBpmBulkLoading(false)
    bpmFetchedIsrcsRef.current = new Set()
    if (bpmFetchTimeoutRef.current) {
      window.clearTimeout(bpmFetchTimeoutRef.current)
      bpmFetchTimeoutRef.current = null
    }
    try {
      const params = new URLSearchParams()
      params.set('name', trimmed)
      params.set('role', role)
      params.set('limit', String(limit))
      params.set('offset', '0')
      params.set('debug', 'true')
      if (releaseDateStart) {
        params.set('releaseDateStart', releaseDateStart)
      }
      if (releaseDateEnd) {
        params.set('releaseDateEnd', releaseDateEnd)
      }
      const url = `/api/creditsearch?${params.toString()}`
      const res = await fetch(url)
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload?.error || 'Credits search failed')
      }
      const incoming = Array.isArray(payload?.results) ? payload.results : []
      setResults(incoming)
      setTrackCount(incoming.length)
      setDebugPayload(payload?.debug || null)
      setProfileInfo(payload?.profile || null)
      setStatusMessage(`Loaded ${incoming.length} results (debug mode).`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credits search failed')
      setStatusMessage(null)
    } finally {
      setLoading(false)
    }
  }

  const saveHistory = (value: string) => {
    if (typeof window === 'undefined') return
    const trimmed = value.trim()
    if (!trimmed) return
    setHistory((prev) => {
      const next = [trimmed, ...prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 100)
      window.localStorage.setItem(historyKey, JSON.stringify(next))
      return next
    })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a name to search')
      return
    }
    saveHistory(trimmed)
    if (debugMode) {
      await fetchResultsDebug(trimmed)
      return
    }
    if (typeof window !== 'undefined') {
      const cached = window.localStorage.getItem(cacheKeyFor(trimmed, role, releaseDateStart, releaseDateEnd))
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          if (Array.isArray(parsed)) {
            setResults(parsed)
            setTrackCount(parsed.length)
            setShowingCached(true)
            setStatusMessage('Showing cached results. Refreshing…')
            await fetchResultsStream(trimmed, 0, false, true, true)
            return
          }
        } catch {
          // ignore cache parse errors
        }
      }
    }
    await fetchResultsStream(trimmed, 0, false, true)
  }

  const handleLoadMore = async () => {
    const nextOffset = results.length
    await fetchResultsStream(name, nextOffset, true, false)
  }

  const handleHistorySelect = async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    setName(trimmed)
    setShowHistory(false)
    saveHistory(trimmed)
    if (typeof window !== 'undefined') {
      const cached = window.localStorage.getItem(cacheKeyFor(trimmed, role, releaseDateStart, releaseDateEnd))
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          if (Array.isArray(parsed)) {
            setResults(parsed)
            setTrackCount(parsed.length)
            setShowingCached(true)
            setStatusMessage('Showing cached results. Refreshing…')
            await fetchResultsStream(trimmed, 0, false, true, true)
            return
          }
        } catch {
          // ignore cache parse errors
        }
      }
    }
    await fetchResultsStream(trimmed, 0, false, true)
  }

  const handleNameFocus = () => {
    if (blurTimeoutRef.current) {
      window.clearTimeout(blurTimeoutRef.current)
    }
    setShowHistory(true)
  }

  const handleNameBlur = () => {
    blurTimeoutRef.current = window.setTimeout(() => {
      setShowHistory(false)
    }, 150)
  }

  const handleBpmRequest = async (track: SearchResult) => {
    if (!track.isrc) return
    if (bpmLoadingIsrcs.has(track.isrc)) return
    setBpmLoadingIsrcs((prev) => new Set(prev).add(track.isrc as string))
    try {
      const res = await fetch('/api/bpm/by-isrc/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isrc: track.isrc,
          title: track.title,
          artist: track.artist,
          spotifyTrackId: track.spotifyTrackId,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload?.error || 'BPM calculation failed')
      }
      setBpmByIsrc((prev) => ({ ...prev, [track.isrc as string]: payload.bpm ?? null }))
      setKeyByIsrc((prev) => ({ ...prev, [track.isrc as string]: payload.key ?? null }))
      setScaleByIsrc((prev) => ({ ...prev, [track.isrc as string]: payload.scale ?? null }))
      setBpmErrorByIsrc((prev) => ({ ...prev, [track.isrc as string]: payload.error || null }))
    } catch (err) {
      setBpmErrorByIsrc((prev) => ({
        ...prev,
        [track.isrc as string]: err instanceof Error ? err.message : 'BPM calculation failed',
      }))
    } finally {
      setBpmLoadingIsrcs((prev) => {
        const next = new Set(prev)
        next.delete(track.isrc as string)
        return next
      })
    }
  }

  const handleCalculateAllBpms = async () => {
    if (bpmBulkLoading) return
    const targets = results.filter((track) => {
      const isrc = track.isrc
      if (!isrc) return false
      if (bpmLoadingIsrcs.has(isrc)) return false
      return bpmByIsrc[isrc] == null
    })
    if (targets.length === 0) return
    setBpmBulkLoading(true)
    try {
      for (const track of targets) {
        await handleBpmRequest(track)
      }
    } finally {
      setBpmBulkLoading(false)
    }
  }

  const renderBpmBadge = (track: SearchResult, compact = false) => {
    const sizeClass = compact ? 'px-2.5 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
    if (!track.isrc) {
      return (
        <span className={`inline-flex ${compact ? 'w-14' : 'w-16'} items-center justify-center rounded-full border border-gray-200 bg-transparent ${sizeClass} font-medium text-gray-500 dark:border-slate-600 dark:text-slate-400`}>
          -
        </span>
      )
    }
    if (bpmLoadingIsrcs.has(track.isrc)) {
      return (
        <span className={`inline-flex ${compact ? 'w-14' : 'w-16'} items-center justify-center text-gray-400`}>
          <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </span>
      )
    }
    const bpm = bpmByIsrc[track.isrc]
    if (bpm != null) {
      return (
        <button
          onClick={(event) => {
            event.stopPropagation()
          }}
          className={`inline-flex ${compact ? 'w-14' : 'w-16'} items-center justify-center rounded-full border border-blue-200 bg-transparent ${sizeClass} font-medium text-blue-700 dark:border-emerald-500/40 dark:text-emerald-300`}
          title="BPM from cache"
        >
          {Math.round(bpm)}
        </button>
      )
    }
    return (
      <button
        onClick={(event) => {
          event.stopPropagation()
          handleBpmRequest(track)
        }}
        className={`inline-flex ${compact ? 'w-14' : 'w-16'} items-center justify-center rounded-full border border-amber-200 bg-transparent ${sizeClass} font-medium text-amber-700 dark:border-amber-500/40 dark:text-amber-300`}
        title={bpmErrorByIsrc[track.isrc] || 'Click to calculate BPM'}
      >
        N/A
      </button>
    )
  }

  const renderKeyBadge = (track: SearchResult, compact = false) => {
    const sizeClass = compact ? 'px-2.5 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
    if (!track.isrc) {
      return (
        <span className={`inline-flex ${compact ? 'w-20' : 'w-24'} items-center justify-center rounded-full border border-gray-200 bg-transparent ${sizeClass} font-medium text-gray-500 dark:border-slate-600 dark:text-slate-400`}>
          -
        </span>
      )
    }
    const key = keyByIsrc[track.isrc]
    const scale = scaleByIsrc[track.isrc]
    if (key || scale) {
      return (
        <span className={`inline-flex ${compact ? 'w-20' : 'w-24'} items-center justify-center rounded-full border border-slate-200 bg-transparent ${sizeClass} font-medium text-slate-700 whitespace-nowrap dark:border-slate-600 dark:text-slate-200`}>
          {key && scale ? `${key} ${scale}` : key || scale}
        </span>
      )
    }
    return (
      <span className={`inline-flex ${compact ? 'w-20' : 'w-24'} items-center justify-center rounded-full border border-gray-200 bg-transparent ${sizeClass} font-medium text-gray-500 dark:border-slate-600 dark:text-slate-400`}>
        -
      </span>
    )
  }

  const hasMore = lastBatchCount === limit
  const totalPages = Math.max(1, Math.ceil(results.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const startIndex = (safePage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const bpmValueFor = (track: SearchResult) => (track.isrc ? bpmByIsrc[track.isrc] ?? null : null)
  const keyValueFor = (track: SearchResult) => {
    if (!track.isrc) return ''
    const key = keyByIsrc[track.isrc]
    const scale = scaleByIsrc[track.isrc]
    return `${key ?? ''} ${scale ?? ''}`.trim()
  }
  const sortedResults = [...results].sort((a, b) => {
    if (!sortField) return 0
    const aValue = (() => {
      switch (sortField) {
        case 'title':
          return a.title.toLowerCase()
        case 'artist':
          return a.artist.toLowerCase()
        case 'album':
          return a.album.toLowerCase()
        case 'duration':
          return a.length ?? 0
        case 'bpm':
          return bpmValueFor(a) ?? 0
        case 'key':
          return keyValueFor(a).toLowerCase()
        case 'year':
          return a.year ? Number(a.year) : 0
        default:
          return ''
      }
    })()
    const bValue = (() => {
      switch (sortField) {
        case 'title':
          return b.title.toLowerCase()
        case 'artist':
          return b.artist.toLowerCase()
        case 'album':
          return b.album.toLowerCase()
        case 'duration':
          return b.length ?? 0
        case 'bpm':
          return bpmValueFor(b) ?? 0
        case 'key':
          return keyValueFor(b).toLowerCase()
        case 'year':
          return b.year ? Number(b.year) : 0
        default:
          return ''
      }
    })()
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
    return 0
  })
  const visibleResults = sortedResults.slice(startIndex, endIndex)

  const handleSort = (field: typeof sortField) => {
    if (!field) return
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortField(field)
    setSortDirection('asc')
  }

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) {
      return <span className="ml-1 text-gray-300 text-[10px]">↕</span>
    }
    return <span className="ml-1 text-gray-600 text-[10px]">{sortDirection === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 relative">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onFocus={handleNameFocus}
              onBlur={handleNameBlur}
              list="credit-search-history"
              placeholder="e.g., Rick Rubin"
              className="w-full bg-transparent px-0 py-2 text-sm text-gray-900 placeholder-gray-500 border-b border-gray-300 focus:outline-none focus:border-gray-500"
            />
            <datalist id="credit-search-history">
              {history.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
            {showHistory && history.length > 0 && (
              <div className="absolute z-20 mt-2 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                <div className="px-3 py-2 text-[11px] uppercase tracking-[0.08em] text-gray-400">
                  Recent searches
                </div>
                <div className="max-h-48 overflow-auto">
                  {history.slice(0, 5).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onMouseDown={() => handleHistorySelect(item)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <span className="truncate">{item}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="sm:w-48">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Role
            </label>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as RoleOption)}
              className="w-full px-0 py-2 border-b border-gray-300 bg-transparent text-sm text-gray-900 focus:outline-none focus:border-gray-500"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center rounded-full border border-emerald-500 px-5 py-2 text-sm font-semibold text-emerald-600 transition hover:border-emerald-600 hover:text-emerald-700 disabled:opacity-60"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
          <button
            type="button"
            onClick={() => setDebugMode((prev) => !prev)}
            className="inline-flex items-center justify-center rounded-full border border-gray-200 px-5 py-2 text-xs font-semibold text-gray-600 transition hover:border-gray-300"
          >
            {debugMode ? 'Debug on' : 'Debug off'}
          </button>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Release date from
            </label>
            <input
              type="date"
              value={releaseDateStart}
              onChange={(event) => setReleaseDateStart(event.target.value)}
              className="w-full bg-transparent px-0 py-2 text-sm text-gray-900 border-b border-gray-300 focus:outline-none focus:border-gray-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Release date to
            </label>
            <input
              type="date"
              value={releaseDateEnd}
              onChange={(event) => setReleaseDateEnd(event.target.value)}
              className="w-full bg-transparent px-0 py-2 text-sm text-gray-900 border-b border-gray-300 focus:outline-none focus:border-gray-500"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Searches Muso credits by role and name, with MusicBrainz as fallback.
        </p>
        {loading && statusMessage && (
          <div className="text-xs text-gray-500">
            {statusMessage}
          </div>
        )}
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {profileInfo && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-3">
            {profileInfo.avatarUrl ? (
              <Image
                src={profileInfo.avatarUrl}
                alt={profileInfo.name || 'Profile'}
                width={48}
                height={48}
                unoptimized
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-gray-100 text-xs text-gray-400 flex items-center justify-center">
                Muso
              </div>
            )}
            <div>
              <div className="text-sm font-semibold text-gray-900">
                {profileInfo.name || 'Muso profile'}
              </div>
              <div className="text-xs text-gray-500">
                Credits: {profileInfo.creditCount ?? '—'} • Collaborators: {profileInfo.collaboratorsCount ?? '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {debugMode && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-600">
          <div className="font-semibold text-gray-900">Debug</div>
          <div className="mt-2">
            Source counts:{' '}
            {Object.entries(
              results.reduce((acc, item) => {
                const key = item.source || 'unknown'
                acc[key] = (acc[key] || 0) + 1
                return acc
              }, {} as Record<string, number>)
            )
              .map(([key, value]) => `${key}: ${value}`)
              .join(', ') || 'none'}
          </div>
          {debugPayload ? (
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-[11px] text-gray-700">
              {JSON.stringify(debugPayload, null, 2)}
            </pre>
          ) : (
            <div className="mt-3 text-gray-500">No debug payload loaded yet.</div>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] border-t border-gray-100 p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Results</h2>
          <span className="text-sm text-gray-500 dark:text-slate-400">
            {trackCount > 0 ? `${trackCount} tracks` : 'No results yet'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => fetchResultsStream(name, 0, false, true)}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
            disabled={loading || !name.trim()}
          >
            Refresh cache
          </button>
          <button
            type="button"
            onClick={handleCalculateAllBpms}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
            disabled={bpmBulkLoading || results.length === 0}
          >
            {bpmBulkLoading ? 'Calculating BPM…' : 'Calculate all BPM'}
          </button>
          {showingCached ? (
            <span className="text-xs text-gray-400 dark:text-slate-500">Cached results</span>
          ) : null}
          {bpmBatchLoading ? (
            <span className="text-xs text-gray-400 dark:text-slate-500">Loading BPM cache…</span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="text-xs sm:text-sm text-gray-600 dark:text-slate-300">Per page</label>
          <select
            value={pageSize}
            onChange={(event) => {
              const value = Math.min(Number(event.target.value), 50)
              setPageSize(value)
              setCurrentPage(1)
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(pageSizeKey, String(value))
              }
            }}
            className="px-2 py-1 border border-gray-300 rounded text-gray-900 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
          <div
            className={`flex items-center gap-2 ml-auto text-xs sm:text-sm text-gray-600 ${
              totalPages <= 1 ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={safePage <= 1}
              className="px-2 py-1 border border-gray-300 rounded disabled:text-gray-400 disabled:border-gray-200"
            >
              Prev
            </button>
            <span>
              Page {safePage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safePage >= totalPages}
              className="px-2 py-1 border border-gray-300 rounded disabled:text-gray-400 disabled:border-gray-200"
            >
              Next
            </button>
          </div>
        </div>

        {results.length === 0 ? (
          <div className="text-sm text-gray-500">Search to see matching songs.</div>
        ) : (
          <>
            <div className="sm:hidden space-y-3">
              {visibleResults.map((track) => (
                <div
                  key={`${track.id}-${track.releaseId}`}
                  className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white"
                  onClick={() => handleTogglePreview(track)}
                >
                  <div className="flex gap-3">
                      {track.coverArtUrl ? (
                        <Image
                          src={track.coverArtUrl}
                          alt={track.album}
                          width={56}
                          height={56}
                          className="w-14 h-14 rounded-md object-cover"
                        />
                      ) : (
                        <div className="w-14 h-14 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-400">
                          No image
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {track.source === 'musicbrainz' ? (
                          <a
                            href={`https://musicbrainz.org/recording/${encodeURIComponent(track.id)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-gray-900 text-sm hover:text-green-700 hover:underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {track.title}
                          </a>
                        ) : (
                          <span className="font-semibold text-gray-900 text-sm">{track.title}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 truncate">{track.artist}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {track.album} {track.year ? `• ${track.year}` : ''}
                      </div>
                      <div className="text-xs text-gray-500">
                        {track.length ? formatDuration(track.length) : '-'}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        {renderBpmBadge(track, true)}
                        {renderKeyBadge(track, true)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden sm:block overflow-hidden rounded-2xl bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06)] border-t border-gray-100 dark:border-slate-800 dark:bg-slate-900">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/70 dark:bg-slate-900/90">
                    <tr>
                      <th className="px-3 lg:px-4 py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 w-12">
                        #
                      </th>
                      <th className="px-3 lg:px-4 py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 w-12 lg:w-16" aria-label="Cover"></th>
                      <th
                        className="px-3 lg:px-4 py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 cursor-pointer hover:text-gray-700 dark:hover:text-slate-200 select-none"
                        onClick={() => handleSort('title')}
                      >
                        <div className="flex items-center">
                          Track
                          <SortIcon field="title" />
                        </div>
                      </th>
                      <th
                        className="px-3 lg:px-4 py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 cursor-pointer hover:text-gray-700 dark:hover:text-slate-200 select-none hidden md:table-cell max-w-[120px]"
                        onClick={() => handleSort('artist')}
                      >
                        <div className="flex items-center">
                          Artist
                          <SortIcon field="artist" />
                        </div>
                      </th>
                      <th
                        className="px-3 lg:px-4 py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 cursor-pointer hover:text-gray-700 dark:hover:text-slate-200 select-none hidden lg:table-cell max-w-[150px]"
                        onClick={() => handleSort('album')}
                      >
                        <div className="flex items-center">
                          Album
                          <SortIcon field="album" />
                        </div>
                      </th>
                      <th
                        className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 cursor-pointer hover:text-gray-700 dark:hover:text-slate-200 select-none hidden md:table-cell"
                        onClick={() => handleSort('duration')}
                      >
                        <div className="flex items-center justify-end">
                          Duration
                          <SortIcon field="duration" />
                        </div>
                      </th>
                      <th
                        className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 cursor-pointer hover:text-gray-700 dark:hover:text-slate-200 select-none hidden md:table-cell"
                        onClick={() => handleSort('bpm')}
                      >
                        <div className="flex items-center justify-end">
                          BPM
                          <SortIcon field="bpm" />
                        </div>
                      </th>
                      <th className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 hidden md:table-cell min-w-[96px]">
                        Key
                      </th>
                      <th
                        className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 cursor-pointer hover:text-gray-700 dark:hover:text-slate-200 select-none"
                        onClick={() => handleSort('year')}
                      >
                        <div className="flex items-center justify-end">
                          Year
                          <SortIcon field="year" />
                        </div>
                      </th>
                      <th className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 hidden lg:table-cell">
                        Popularity
                      </th>
                      <th className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 hidden lg:table-cell">
                        Added
                      </th>
                      <th className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500">
                        <span className="sr-only">Options</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleResults.map((track, index) => (
                      <tr
                        key={`${track.id}-${track.releaseId}`}
                        className={`group transition-colors cursor-pointer ${
                          playingId === track.id
                            ? 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20'
                            : 'hover:bg-[#F9FAFB] dark:hover:bg-slate-800/60'
                        }`}
                        onClick={() => handleTogglePreview(track)}
                      >
                        <td className="px-3 lg:px-4 py-4 text-gray-400 dark:text-slate-500 text-xs sm:text-sm">
                          <div className="flex items-center justify-center">
                            {playingId === track.id ? (
                              <svg className="w-4 h-4 text-green-600 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              startIndex + index + 1
                            )}
                          </div>
                        </td>
                        <td className="px-3 lg:px-4 py-4">
                          {track.coverArtUrl ? (
                            <Image
                              src={track.coverArtUrl}
                              alt={track.album}
                              width={40}
                              height={40}
                              className="w-8 h-8 sm:w-10 sm:h-10 object-cover rounded-xl flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 rounded-xl flex-shrink-0 flex items-center justify-center dark:bg-slate-800">
                              <span className="text-gray-400 dark:text-slate-500 text-xs">No image</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 lg:px-4 py-4">
                          <div className="flex items-center gap-2">
                            {track.source === 'musicbrainz' ? (
                              <a
                                href={`https://musicbrainz.org/recording/${encodeURIComponent(track.id)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-slate-900 dark:text-slate-100 text-xs sm:text-sm hover:text-emerald-600 hover:underline"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {track.title}
                              </a>
                            ) : (
                              <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">{track.title}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 lg:px-4 py-4 text-gray-500 dark:text-slate-400 text-xs sm:text-sm hidden md:table-cell max-w-[120px] truncate" title={track.artist}>
                          {track.artist}
                        </td>
                        <td className="px-3 lg:px-4 py-4 text-gray-500 dark:text-slate-400 text-xs sm:text-sm hidden lg:table-cell max-w-[150px] truncate" title={track.album}>
                          {track.releaseId ? (
                            <a
                              href={`https://musicbrainz.org/release/${encodeURIComponent(track.releaseId)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-600 hover:text-emerald-700 hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {track.album}
                            </a>
                          ) : (
                            <span>{track.album}</span>
                          )}
                        </td>
                        <td className="px-3 lg:px-4 py-4 text-gray-500 dark:text-slate-400 text-xs sm:text-sm hidden md:table-cell text-right">
                          {track.length ? formatDuration(track.length) : '-'}
                        </td>
                        <td className="px-3 lg:px-4 py-4 text-xs sm:text-sm hidden md:table-cell text-right" onClick={(event) => event.stopPropagation()}>
                          <div className="flex justify-end">
                            {renderBpmBadge(track)}
                          </div>
                        </td>
                        <td className="px-3 lg:px-4 py-4 text-xs sm:text-sm hidden md:table-cell whitespace-nowrap min-w-[96px] text-right">
                          <div className="flex justify-end">
                            {renderKeyBadge(track)}
                          </div>
                        </td>
                        <td className="px-3 lg:px-4 py-4 text-gray-500 dark:text-slate-400 text-xs sm:text-sm text-right">
                          {track.year || '-'}
                        </td>
                        <td className="px-3 lg:px-4 py-4 text-gray-500 dark:text-slate-400 text-xs sm:text-sm text-right hidden lg:table-cell">
                          <span className="text-gray-400 dark:text-slate-500">N/A</span>
                        </td>
                        <td className="px-3 lg:px-4 py-4 text-gray-500 dark:text-slate-400 text-xs sm:text-sm text-right hidden lg:table-cell">
                          <span className="text-gray-400 dark:text-slate-500">N/A</span>
                        </td>
                        <td className="px-3 lg:px-4 py-4 text-right">
                          <button
                            type="button"
                            className="opacity-0 transition-opacity text-gray-400 dark:text-slate-500 hover:text-gray-600 group-hover:opacity-100"
                            onClick={(event) => event.stopPropagation()}
                            aria-label="More options"
                          >
                            ...
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {hasMore && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded transition-colors disabled:opacity-60"
            >
              {loading ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
