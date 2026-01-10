'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { formatDuration } from '@/lib/musicbrainz'

type RoleOption = 'producer' | 'songwriter' | 'mixer' | 'engineer' | 'artist'

interface SearchResult {
  id: string
  title: string
  artist: string
  album: string
  year: string
  length: number
  isrc?: string
  isrcDetails?: Array<{
    value: string
    hasDeezer: boolean
    selected?: boolean
    reason?: string
  }>
  releaseId: string
  coverArtUrl?: string | null
  previewUrl?: string | null
}

const ROLE_OPTIONS: Array<{ value: RoleOption; label: string }> = [
  { value: 'producer', label: 'Producer' },
  { value: 'songwriter', label: 'Songwriter' },
  { value: 'mixer', label: 'Mixer' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'artist', label: 'Artist' },
]

export default function CreditsSearchClient() {
  const [name, setName] = useState('')
  const [role, setRole] = useState<RoleOption>('producer')
  const [results, setResults] = useState<SearchResult[]>([])
  const [trackCount, setTrackCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const blurTimeoutRef = useRef<number | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const streamRef = useRef<EventSource | null>(null)
  const requestIdRef = useRef(0)
  const [lastBatchCount, setLastBatchCount] = useState(0)
  const [totalWorks, setTotalWorks] = useState<number | null>(null)
  const [pageSize, setPageSize] = useState<number>(25)
  const [currentPage, setCurrentPage] = useState(1)
  const totalWorksRef = useRef<number | null>(null)

  const limit = 25
  const historyKey = 'creditsSearchHistory'
  const pageSizeKey = 'credits_rows_per_page'

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedPageSize = window.localStorage.getItem(pageSizeKey)
    if (storedPageSize && !Number.isNaN(Number(storedPageSize))) {
      setPageSize(Number(storedPageSize))
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

  const fetchResultsStream = async (searchName: string, offset = 0, append = false) => {
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
    }
    setStatusMessage(`Loading ${limit} results…`)
    const url = `/api/musicbrainz/search?name=${encodeURIComponent(trimmed)}&role=${encodeURIComponent(role)}&limit=${limit}&offset=${offset}&stream=true`

    const source = new EventSource(url)
    streamRef.current = source

    let batchCount = 0
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
        if (payload.type === 'result' && payload.track) {
          setResults((prev) => [...prev, payload.track])
          setTrackCount((prev) => prev + 1)
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
    await fetchResultsStream(trimmed)
  }

  const handleLoadMore = async () => {
    const nextOffset = results.length
    await fetchResultsStream(name, nextOffset, true)
  }

  const handleHistorySelect = async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    setName(trimmed)
    setShowHistory(false)
    saveHistory(trimmed)
    await fetchResultsStream(trimmed)
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

  const hasMore = lastBatchCount === limit
  const totalPages = Math.max(1, Math.ceil(results.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const startIndex = (safePage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const visibleResults = results.slice(startIndex, endIndex)

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
              className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 placeholder-gray-500 border-b border-gray-300 focus:outline-none focus:border-gray-500"
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
              className="w-full px-3 py-2 border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
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
            className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-5 rounded transition-colors disabled:opacity-60"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Searches MusicBrainz recordings by credit type and name.
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

      <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] border-t border-gray-100 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Results</h2>
          <span className="text-sm text-gray-500">
            {trackCount > 0 ? `${trackCount} tracks` : 'No results yet'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="text-xs sm:text-sm text-gray-600">Per page</label>
          <select
            value={pageSize}
            onChange={(event) => {
              const value = Number(event.target.value)
              setPageSize(value)
              setCurrentPage(1)
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(pageSizeKey, String(value))
              }
            }}
            className="px-2 py-1 border border-gray-300 rounded text-gray-900 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
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
                        className="w-14 h-14 rounded object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-400">
                        No image
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <a
                          href={`https://musicbrainz.org/recording/${encodeURIComponent(track.id)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-gray-900 text-sm hover:text-green-700 hover:underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {track.title}
                        </a>
                      </div>
                      <div className="text-xs text-gray-600 truncate">{track.artist}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {track.album} {track.year ? `• ${track.year}` : ''}
                      </div>
                      <div className="text-xs text-gray-500">
                        {track.length ? formatDuration(track.length) : '-'} {track.isrc ? `• ${track.isrc}` : ''}
                      </div>
                      {track.isrc ? (
                        <div className="mt-1 text-[11px] text-gray-400">
                          {track.isrc}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden sm:block overflow-hidden rounded-2xl bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06)] border-t border-gray-100">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/70 border-b border-gray-100">
                    <tr>
                      <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] w-12">
                        #
                      </th>
                      <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] w-12 lg:w-16">
                        Cover
                      </th>
                      <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0]">
                        Track
                      </th>
                      <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] hidden md:table-cell max-w-[140px]">
                        Artist
                      </th>
                      <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] hidden lg:table-cell max-w-[160px]">
                        Release
                      </th>
                      <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] hidden md:table-cell">
                        Duration
                      </th>
                      <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0]">
                        Year
                      </th>
                      <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] hidden lg:table-cell">
                        ISRC
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {visibleResults.map((track, index) => (
                      <tr
                        key={`${track.id}-${track.releaseId}`}
                        className="hover:bg-[#F9FAFB] cursor-pointer"
                        onClick={() => handleTogglePreview(track)}
                      >
                        <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-500 text-xs sm:text-sm">
                          {startIndex + index + 1}
                        </td>
                        <td className="px-3 lg:px-4 py-2 lg:py-3">
                          {track.coverArtUrl ? (
                            <Image
                              src={track.coverArtUrl}
                              alt={track.album}
                              width={40}
                              height={40}
                              className="w-8 h-8 sm:w-10 sm:h-10 object-cover rounded"
                            />
                          ) : (
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 rounded flex items-center justify-center">
                              <span className="text-gray-400 text-xs">No image</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 lg:px-4 py-2 lg:py-3">
                          <a
                            href={`https://musicbrainz.org/recording/${encodeURIComponent(track.id)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-gray-900 text-xs sm:text-sm hover:text-green-600 hover:underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {track.title}
                          </a>
                        </td>
                        <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-700 text-xs sm:text-sm hidden md:table-cell max-w-[140px] truncate">
                          {track.artist}
                        </td>
                        <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-700 text-xs sm:text-sm hidden lg:table-cell max-w-[160px] truncate">
                          {track.album}
                        </td>
                        <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-600 text-xs sm:text-sm hidden md:table-cell">
                          {track.length ? formatDuration(track.length) : '-'}
                        </td>
                        <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-600 text-xs sm:text-sm">
                          {track.year || '-'}
                        </td>
                        <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-600 text-xs sm:text-sm hidden lg:table-cell">
                          {track.isrc || '-'}
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
