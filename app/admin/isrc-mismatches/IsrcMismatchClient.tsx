'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type PreviewUrlEntry = {
  url: string
  successful?: boolean
  isrc?: string
  title?: string
  artist?: string
  provider?: 'deezer_isrc' | 'muso_spotify' | 'itunes_search' | 'deezer_search'
  itunesRequestUrl?: string
  itunesResponse?: string
}

type SongSearchPreview = {
  url: string
  provider: 'spotify_preview' | 'muso_spotify' | 'deezer_isrc' | 'deezer_search' | 'itunes_search'
  isrc?: string
  title?: string
  artist?: string
}

type SpotifyTrackSummary = {
  id: string
  title: string
  artist: string
  isrc?: string | null
  previewUrl?: string | null
  album?: string | null
}

type SongSearchResult = {
  spotifyTrack?: SpotifyTrackSummary | null
  spotifyTracks?: SpotifyTrackSummary[]
  previewUrls?: SongSearchPreview[]
  query?: {
    isrc?: string | null
    title?: string | null
    artist?: string | null
  }
}

type BpmInfo = {
  bpm: number | null
  key?: string | null
  scale?: string | null
  source?: string
  bpmSelected?: string
  keySelected?: string
  bpmManual?: number | null
  keyManual?: string | null
  scaleManual?: string | null
  error?: string
}

type ApiLogEntry = {
  id: string
  timestamp: string
  level: 'info' | 'success' | 'error'
  message: string
}

type IsrcMismatchItem = {
  spotify_track_id: string
  isrc: string | null
  artist: string | null
  title: string | null
  updated_at: string
  error: string | null
  urls?: PreviewUrlEntry[] | null
  isrc_mismatch: boolean
  isrc_mismatch_review_status: 'match' | 'mismatch' | null
  isrc_mismatch_reviewed_by: string | null
  isrc_mismatch_reviewed_at: string | null
  preview_url?: string | null
}

function getPreviewEntry(item: IsrcMismatchItem): PreviewUrlEntry | null {
  const urls = item.urls || []
  const successful = urls.find((entry) => entry.successful)
  if (successful) return successful
  return urls[0] || null
}

function getPreviewUrl(item: IsrcMismatchItem): string | null {
  if (item.preview_url) return item.preview_url
  return getPreviewEntry(item)?.url || null
}

function getItunesEntry(item: IsrcMismatchItem): PreviewUrlEntry | null {
  const urls = item.urls || []
  const byProvider = urls.find((entry) => entry.provider === 'itunes_search')
  if (byProvider) return byProvider
  return urls.find((entry) => entry.itunesRequestUrl || entry.url.includes('itunes.apple.com') || entry.url.includes('mzstatic')) || null
}

export default function IsrcMismatchClient() {
  const [items, setItems] = useState<IsrcMismatchItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMatched, setShowMatched] = useState(false)
  const [page, setPage] = useState(1)
  const [isHydratingPreview, setIsHydratingPreview] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [pageSize, setPageSize] = useState(20)
  const [itunesDebugOpen, setItunesDebugOpen] = useState<Record<string, boolean>>({})
  const [spotifyPreviewMap, setSpotifyPreviewMap] = useState<Record<string, { url?: string | null; loading?: boolean; error?: string }>>({})
  const [deezerPreviewMap, setDeezerPreviewMap] = useState<Record<string, { url?: string | null; loading?: boolean }>>({})
  const [resolveAllLoading, setResolveAllLoading] = useState(false)
  const [resolveAllSummary, setResolveAllSummary] = useState<{ processed: number; resolved: number; skipped: number } | null>(null)
  const [songSearchInput, setSongSearchInput] = useState({
    isrc: '',
    title: '',
    artist: '',
    spotifyTrackId: '',
  })
  const [songSearchResult, setSongSearchResult] = useState<SongSearchResult | null>(null)
  const [songSearchLoading, setSongSearchLoading] = useState(false)
  const [songSearchError, setSongSearchError] = useState<string | null>(null)
  const [bpmInfo, setBpmInfo] = useState<BpmInfo | null>(null)
  const [bpmLoading, setBpmLoading] = useState(false)
  const [manualBpm, setManualBpm] = useState('')
  const [manualKey, setManualKey] = useState('')
  const [manualScale, setManualScale] = useState('')
  const [apiLogs, setApiLogs] = useState<ApiLogEntry[]>([])

  const handlePlay = (event: React.SyntheticEvent<HTMLAudioElement>) => {
    if (audioRef.current && audioRef.current !== event.currentTarget) {
      audioRef.current.pause()
    }
    audioRef.current = event.currentTarget
  }

  const addLog = useCallback((level: ApiLogEntry['level'], message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setApiLogs((prev) => [
      { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, timestamp, level, message },
      ...prev,
    ])
  }, [])

  const needsPreviewMeta = useCallback((item: IsrcMismatchItem) => {
    const entry = getPreviewEntry(item)
    if (!entry) return true
    return !entry.artist || !entry.title || !entry.isrc
  }, [])

  const hydrateMissingPreviewMeta = useCallback(async (rows: IsrcMismatchItem[]) => {
    const targets = rows.filter(needsPreviewMeta)
    if (targets.length === 0) return
    setIsHydratingPreview(true)
    const concurrency = 4
    let index = 0
    const worker = async () => {
      while (index < targets.length) {
        const current = targets[index]
        index += 1
        try {
          const res = await fetch(`/api/bpm?spotifyTrackId=${encodeURIComponent(current.spotify_track_id)}`)
          if (!res.ok) {
            continue
          }
          const data = await res.json().catch(() => ({}))
          if (!Array.isArray(data?.urls)) {
            continue
          }
          setItems((prev) =>
            prev.map((item) =>
              item.spotify_track_id === current.spotify_track_id
                ? { ...item, urls: data.urls }
                : item
            )
          )
        } catch {
          // Ignore preview metadata fetch errors.
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker))
    setIsHydratingPreview(false)
  }, [needsPreviewMeta])

  const loadMismatches = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/isrc-mismatches')
      if (!res.ok) {
        throw new Error('Failed to load ISRC mismatches')
      }
      const data = await res.json()
      const nextItems = Array.isArray(data?.items) ? data.items : []
      setItems(nextItems)
      void hydrateMissingPreviewMeta(nextItems)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ISRC mismatches')
    } finally {
      setLoading(false)
    }
  }, [hydrateMissingPreviewMeta])

  useEffect(() => {
    loadMismatches()
  }, [loadMismatches])

  const handleReview = async (spotifyTrackId: string, action: 'confirm_match' | 'confirm_mismatch') => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/isrc-mismatches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotifyTrackId, action }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error || 'Failed to update review')
      }
      await loadMismatches()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update review')
    } finally {
      setLoading(false)
    }
  }

  const handleResolveWithMuso = async (spotifyTrackId: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/isrc-mismatches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotifyTrackId, action: 'resolve_with_muso' }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error || 'Failed to resolve with Muso preview')
      }
      await loadMismatches()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve with Muso preview')
    } finally {
      setLoading(false)
    }
  }

  const handleLoadSpotifyPreview = async (spotifyTrackId: string) => {
    setSpotifyPreviewMap((prev) => ({
      ...prev,
      [spotifyTrackId]: { url: prev[spotifyTrackId]?.url ?? null, loading: true, error: undefined },
    }))
    try {
      const res = await fetch('/api/muso/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotifyTrackId }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload?.error || 'Unable to fetch Spotify preview')
      }
      setSpotifyPreviewMap((prev) => ({
        ...prev,
        [spotifyTrackId]: { url: payload.previewUrl || null, loading: false, error: undefined },
      }))
    } catch (err) {
      setSpotifyPreviewMap((prev) => ({
        ...prev,
        [spotifyTrackId]: {
          url: prev[spotifyTrackId]?.url ?? null,
          loading: false,
          error: err instanceof Error ? err.message : 'Unable to fetch Spotify preview',
        },
      }))
    }
  }

  const handleLoadDeezerPreview = async (spotifyTrackId: string, apiUrl: string) => {
    setDeezerPreviewMap((prev) => ({
      ...prev,
      [spotifyTrackId]: { url: prev[spotifyTrackId]?.url ?? null, loading: true },
    }))
    try {
      const res = await fetch(`/api/deezer-preview?url=${encodeURIComponent(apiUrl)}`)
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || !payload?.previewUrl) {
        throw new Error('Unable to resolve Deezer preview')
      }
      setDeezerPreviewMap((prev) => ({
        ...prev,
        [spotifyTrackId]: { url: payload.previewUrl, loading: false },
      }))
    } catch {
      setDeezerPreviewMap((prev) => ({
        ...prev,
        [spotifyTrackId]: { url: prev[spotifyTrackId]?.url ?? null, loading: false },
      }))
    }
  }

  const handleResolveAllWithMuso = async () => {
    setResolveAllLoading(true)
    setError(null)
    addLog('info', 'Resolving outstanding mismatches with Muso preview URLs...')
    try {
      const res = await fetch('/api/admin/isrc-mismatches/resolve-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to resolve mismatches')
      }
      setResolveAllSummary({
        processed: Number(payload?.processed ?? 0),
        resolved: Number(payload?.resolved ?? 0),
        skipped: Number(payload?.skipped ?? 0),
      })
      addLog('success', `Resolved ${payload?.resolved ?? 0} mismatches via Muso.`)
      await loadMismatches()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resolve mismatches'
      setError(message)
      addLog('error', message)
    } finally {
      setResolveAllLoading(false)
    }
  }

  const fetchBpmInfo = useCallback(async (spotifyTrackId: string) => {
    setBpmLoading(true)
    addLog('info', `Fetching BPM/key for ${spotifyTrackId}...`)
    try {
      const res = await fetch(`/api/bpm?spotifyTrackId=${encodeURIComponent(spotifyTrackId)}`)
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to fetch BPM data')
      }
      setBpmInfo(payload)
      addLog('success', 'BPM/key data loaded.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch BPM data'
      setBpmInfo({ bpm: null, error: message })
      addLog('error', message)
    } finally {
      setBpmLoading(false)
    }
  }, [addLog])

  const handleSongSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSongSearchError(null)
    setSongSearchResult(null)
    setBpmInfo(null)
    const payload = {
      isrc: songSearchInput.isrc.trim() || undefined,
      title: songSearchInput.title.trim() || undefined,
      artist: songSearchInput.artist.trim() || undefined,
      spotifyTrackId: songSearchInput.spotifyTrackId.trim() || undefined,
    }
    if (!payload.isrc && !payload.title && !payload.artist && !payload.spotifyTrackId) {
      setSongSearchError('Enter an ISRC, title, artist, or Spotify track ID to search.')
      return
    }
    setSongSearchLoading(true)
    addLog('info', 'Searching song data sources...')
    try {
      const res = await fetch('/api/admin/song-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Song search failed')
      }
      setSongSearchResult(data)
      addLog('success', `Search completed with ${data?.previewUrls?.length ?? 0} preview options.`)
      const spotifyTrackId = data?.spotifyTrack?.id
      if (spotifyTrackId) {
        await fetchBpmInfo(spotifyTrackId)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Song search failed'
      setSongSearchError(message)
      addLog('error', message)
    } finally {
      setSongSearchLoading(false)
    }
  }

  const handleApplyPreview = async (preview: SongSearchPreview) => {
    const spotifyTrackId = songSearchResult?.spotifyTrack?.id
    if (!spotifyTrackId) {
      setSongSearchError('Select a Spotify track before applying a preview URL.')
      return
    }
    setSongSearchError(null)
    setBpmLoading(true)
    addLog('info', `Applying preview from ${preview.provider}...`)
    try {
      const res = await fetch('/api/admin/song-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spotifyTrackId,
          previewUrl: preview.url,
          source: preview.provider,
          previewIsrc: preview.isrc,
          previewTitle: preview.title,
          previewArtist: preview.artist,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to apply preview URL')
      }
      setBpmInfo(payload?.bpmResult || null)
      addLog('success', 'Preview applied and BPM recalculated.')
      await loadMismatches()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply preview URL'
      setSongSearchError(message)
      addLog('error', message)
    } finally {
      setBpmLoading(false)
    }
  }

  const handleRecomputeBpm = async () => {
    const spotifyTrackId = songSearchResult?.spotifyTrack?.id
    if (!spotifyTrackId) {
      setSongSearchError('Search for a song to recompute BPM.')
      return
    }
    setSongSearchError(null)
    setBpmLoading(true)
    addLog('info', 'Clearing cache and recomputing BPM/key...')
    try {
      const res = await fetch('/api/bpm/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds: [spotifyTrackId] }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to clear BPM cache')
      }
      addLog('success', 'Cache cleared, recalculating...')
      await fetchBpmInfo(spotifyTrackId)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to recompute BPM'
      setSongSearchError(message)
      addLog('error', message)
      setBpmLoading(false)
    }
  }

  const handleManualOverride = async () => {
    const spotifyTrackId = songSearchResult?.spotifyTrack?.id
    if (!spotifyTrackId) {
      setSongSearchError('Search for a song to apply a manual override.')
      return
    }

    const bpmManualRaw = manualBpm.trim()
    let bpmManualValue: number | undefined
    if (bpmManualRaw) {
      const parsed = Number(bpmManualRaw)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setSongSearchError('Manual BPM must be a positive number.')
        return
      }
      bpmManualValue = parsed
    }

    if ((manualKey.trim() && !manualScale.trim()) || (!manualKey.trim() && manualScale.trim())) {
      setSongSearchError('Provide both key and scale for a manual key override.')
      return
    }

    const payload: Record<string, any> = { spotifyTrackId }
    if (bpmManualValue !== undefined) {
      payload.bpmSelected = 'manual'
      payload.bpmManual = bpmManualValue
    }
    if (manualKey.trim() && manualScale.trim()) {
      payload.keySelected = 'manual'
      payload.keyManual = manualKey.trim()
      payload.scaleManual = manualScale.trim()
    }

    if (!payload.bpmSelected && !payload.keySelected) {
      setSongSearchError('Enter manual BPM and/or key/scale values before saving.')
      return
    }

    setSongSearchError(null)
    addLog('info', 'Applying manual override...')
    try {
      const res = await fetch('/api/bpm/update-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const responsePayload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(responsePayload?.error || 'Failed to apply manual override')
      }
      addLog('success', 'Manual override saved.')
      await fetchBpmInfo(spotifyTrackId)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply manual override'
      setSongSearchError(message)
      addLog('error', message)
    }
  }

  const [pendingItems, reviewedItems] = useMemo(() => {
    const pending = items.filter((item) => !item.isrc_mismatch_review_status)
    const reviewed = items.filter((item) => item.isrc_mismatch_review_status)
    return [pending, reviewed]
  }, [items])

  const visibleItems = useMemo(() => {
    if (showMatched) return items
    return items.filter((item) => item.isrc_mismatch_review_status !== 'match')
  }, [items, showMatched])

  useEffect(() => {
    setPage(1)
  }, [showMatched, items.length])

  const totalPages = Math.max(1, Math.ceil(visibleItems.length / pageSize))
  const paginatedItems = visibleItems.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Song data tools</h2>
              <p className="text-sm text-gray-500">
                Search by ISRC, title, artist, or Spotify track ID to compare preview sources and manage BPM/key data.
              </p>
            </div>
            <div className="text-xs text-gray-400">Updates apply to the selected Spotify track.</div>
          </div>
          <form onSubmit={handleSongSearch} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-gray-500">
              ISRC
              <input
                value={songSearchInput.isrc}
                onChange={(event) => setSongSearchInput((prev) => ({ ...prev, isrc: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700"
                placeholder="USUM71703861"
              />
            </label>
            <label className="text-xs font-semibold text-gray-500">
              Spotify track ID
              <input
                value={songSearchInput.spotifyTrackId}
                onChange={(event) => setSongSearchInput((prev) => ({ ...prev, spotifyTrackId: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700"
                placeholder="Spotify track ID"
              />
            </label>
            <label className="text-xs font-semibold text-gray-500">
              Title
              <input
                value={songSearchInput.title}
                onChange={(event) => setSongSearchInput((prev) => ({ ...prev, title: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700"
                placeholder="Song title"
              />
            </label>
            <label className="text-xs font-semibold text-gray-500">
              Artist
              <input
                value={songSearchInput.artist}
                onChange={(event) => setSongSearchInput((prev) => ({ ...prev, artist: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700"
                placeholder="Artist name"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button
                type="submit"
                className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                disabled={songSearchLoading}
              >
                {songSearchLoading ? 'Searching...' : 'Search song data'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSongSearchInput({ isrc: '', title: '', artist: '', spotifyTrackId: '' })
                  setSongSearchResult(null)
                  setSongSearchError(null)
                  setBpmInfo(null)
                }}
                className="rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
              >
                Clear
              </button>
            </div>
          </form>
          {songSearchError ? (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
              {songSearchError}
            </div>
          ) : null}
          {songSearchResult?.spotifyTrack ? (
            <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="text-sm font-semibold text-gray-900">
                {songSearchResult.spotifyTrack.artist} - {songSearchResult.spotifyTrack.title}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Spotify ID: {songSearchResult.spotifyTrack.id} | ISRC: {songSearchResult.spotifyTrack.isrc || 'Unknown'}
              </div>
              {songSearchResult.spotifyTrack.previewUrl ? (
                <audio controls preload="none" className="mt-2 w-full" onPlay={handlePlay}>
                  <source src={songSearchResult.spotifyTrack.previewUrl} />
                </audio>
              ) : null}
            </div>
          ) : null}
          <div className="mt-4">
            <div className="text-xs uppercase tracking-[0.2em] text-gray-400">Preview options</div>
            {songSearchResult?.previewUrls && songSearchResult.previewUrls.length > 0 ? (
              <div className="mt-2 grid gap-3">
                {songSearchResult.previewUrls.map((preview, index) => (
                  <div key={`${preview.url}-${index}`} className="rounded-xl border border-gray-100 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                          {preview.provider.replace(/_/g, ' ')}
                        </div>
                        <div className="text-sm font-semibold text-gray-900">
                          {(preview.artist || 'Unknown artist') + ' - ' + (preview.title || 'Unknown title')}
                        </div>
                        <div className="text-xs text-gray-500">ISRC: {preview.isrc || 'Unknown'}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleApplyPreview(preview)}
                        className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                        disabled={!songSearchResult?.spotifyTrack?.id || bpmLoading}
                      >
                        Use this preview
                      </button>
                    </div>
                    <audio controls preload="none" className="mt-2 w-full" onPlay={handlePlay}>
                      <source src={preview.url} />
                    </audio>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-xs text-gray-500">No preview URLs found yet.</div>
            )}
          </div>
          <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">BPM & key</div>
                <div className="text-xs text-gray-500">Refresh, recompute, or manually override BPM/key data.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const spotifyTrackId = songSearchResult?.spotifyTrack?.id
                    if (spotifyTrackId) {
                      void fetchBpmInfo(spotifyTrackId)
                    } else {
                      setSongSearchError('Search for a song to load BPM data.')
                    }
                  }}
                  className="rounded-full border border-gray-200 px-3 py-1 text-[11px] font-semibold text-gray-600 hover:text-gray-900"
                  disabled={bpmLoading}
                >
                  {bpmLoading ? 'Loading...' : 'Refresh BPM'}
                </button>
                <button
                  type="button"
                  onClick={handleRecomputeBpm}
                  className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
                  disabled={bpmLoading}
                >
                  Recompute BPM/key
                </button>
              </div>
            </div>
            {bpmInfo ? (
              <div className="mt-3 grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
                <div>
                  <strong>BPM:</strong> {bpmInfo.bpm ?? 'N/A'}
                </div>
                <div>
                  <strong>Key:</strong>{' '}
                  {bpmInfo.key && bpmInfo.scale ? `${bpmInfo.key} ${bpmInfo.scale}` : 'N/A'}
                </div>
                <div>
                  <strong>Source:</strong> {bpmInfo.source || 'N/A'}
                </div>
                <div>
                  <strong>Selected:</strong> BPM {bpmInfo.bpmSelected || 'N/A'} / Key {bpmInfo.keySelected || 'N/A'}
                </div>
                {bpmInfo.error ? <div className="text-rose-600">{bpmInfo.error}</div> : null}
              </div>
            ) : (
              <div className="mt-3 text-xs text-gray-500">No BPM data loaded yet.</div>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-semibold text-gray-500">
                Manual BPM
                <input
                  value={manualBpm}
                  onChange={(event) => setManualBpm(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700"
                  placeholder="128"
                />
              </label>
              <label className="text-xs font-semibold text-gray-500">
                Manual key
                <input
                  value={manualKey}
                  onChange={(event) => setManualKey(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700"
                  placeholder="C#"
                />
              </label>
              <label className="text-xs font-semibold text-gray-500">
                Manual scale
                <input
                  value={manualScale}
                  onChange={(event) => setManualScale(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700"
                  placeholder="minor"
                />
              </label>
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={handleManualOverride}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                disabled={bpmLoading}
              >
                Apply manual override
              </button>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Live API logs</h3>
              <p className="text-xs text-gray-500">Events from actions run in this panel.</p>
            </div>
            <button
              type="button"
              onClick={() => setApiLogs([])}
              className="rounded-full border border-gray-200 px-3 py-1 text-[11px] font-semibold text-gray-600 hover:text-gray-900"
            >
              Clear logs
            </button>
          </div>
          <div className="mt-4 max-h-[420px] space-y-2 overflow-auto text-xs">
            {apiLogs.length === 0 ? (
              <div className="text-gray-500">Run a search or action to populate logs.</div>
            ) : (
              apiLogs.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-gray-400">
                    <span>{entry.level}</span>
                    <span>{entry.timestamp}</span>
                  </div>
                  <div
                    className={
                      entry.level === 'error'
                        ? 'text-rose-600'
                        : entry.level === 'success'
                          ? 'text-emerald-600'
                          : 'text-gray-600'
                    }
                  >
                    {entry.message}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">ISRC mismatches</h2>
          <p className="text-sm text-gray-500">
            Review preview audio for ISRC mismatches and confirm the correct status.
          </p>
          {resolveAllSummary ? (
            <div className="mt-2 text-xs text-gray-500">
              Resolved {resolveAllSummary.resolved} of {resolveAllSummary.processed} (skipped {resolveAllSummary.skipped}).
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isHydratingPreview ? (
            <div className="text-xs text-gray-500">Refreshing preview metadata...</div>
          ) : null}
          <button
            type="button"
            onClick={() => setShowMatched((prev) => !prev)}
            className="rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
          >
            {showMatched ? 'Hide matched' : 'Show matched'}
          </button>
          <button
            type="button"
            onClick={handleResolveAllWithMuso}
            className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
            disabled={resolveAllLoading}
          >
            {resolveAllLoading ? 'Resolving...' : 'Resolve all with Muso'}
          </button>
          <button
            type="button"
            onClick={loadMismatches}
            className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-4">
        {loading && visibleItems.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-white px-4 py-6 text-sm text-gray-500">
            Loading mismatches...
          </div>
        ) : null}
        {!loading && visibleItems.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-white px-4 py-6 text-sm text-gray-500">
            No ISRC mismatches to review.
          </div>
        ) : null}
        {paginatedItems.map((item) => {
          const previewEntry = getPreviewEntry(item)
          const itunesEntry = getItunesEntry(item)
          const previewUrl = previewEntry?.url || item.preview_url
          const isDeezerApiUrl = Boolean(previewUrl && previewUrl.includes('api.deezer.com'))
          const resolvedDeezerUrl = isDeezerApiUrl ? deezerPreviewMap[item.spotify_track_id]?.url || null : null
          const audioUrl = isDeezerApiUrl ? resolvedDeezerUrl : previewUrl
          const reviewLabel = item.isrc_mismatch_review_status
            ? item.isrc_mismatch_review_status === 'match'
              ? 'Confirmed match'
              : 'Confirmed mismatch'
            : 'Pending review'
          return (
            <div
              key={item.spotify_track_id}
              className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.05)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    {item.artist || 'Unknown artist'} - {item.title || 'Unknown title'}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Spotify ISRC: {item.isrc || 'Missing'} | Spotify ID: {item.spotify_track_id}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    iTunes ISRC: {itunesEntry?.isrc || 'Unknown'}
                  </div>
                </div>
                <div className="text-xs font-semibold text-gray-500">{reviewLabel}</div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-400">Preview</div>
                  {audioUrl ? (
                    <audio controls preload="none" className="w-full" onPlay={handlePlay}>
                      <source src={audioUrl} />
                    </audio>
                  ) : isDeezerApiUrl ? (
                    <button
                      type="button"
                      onClick={() => handleLoadDeezerPreview(item.spotify_track_id, previewUrl as string)}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                      disabled={deezerPreviewMap[item.spotify_track_id]?.loading}
                    >
                      {deezerPreviewMap[item.spotify_track_id]?.loading ? 'Loading preview...' : 'Load Deezer preview'}
                    </button>
                  ) : (
                    <div className="text-xs text-gray-500">No preview URL available.</div>
                  )}
                  {previewEntry ? (
                    <div className="text-xs text-gray-500 mt-2 space-y-1">
                      <div>
                        <strong>Preview Artist:</strong> {previewEntry.artist || 'N/A'}
                      </div>
                      <div>
                        <strong>Preview Title:</strong> {previewEntry.title || 'N/A'}
                      </div>
                      <div>
                        <strong>Preview ISRC:</strong> {previewEntry.isrc || 'N/A'}
                      </div>
                    </div>
                  ) : null}
                  {itunesEntry?.itunesRequestUrl && (
                    <div className="text-xs text-gray-500">
                      <button
                        type="button"
                        onClick={() =>
                          setItunesDebugOpen((prev) => ({
                            ...prev,
                            [item.spotify_track_id]: !prev[item.spotify_track_id],
                          }))
                        }
                        className="mt-2 rounded-full border border-gray-200 px-3 py-1 text-[11px] font-semibold text-gray-600 hover:text-gray-900"
                      >
                        {itunesDebugOpen[item.spotify_track_id] ? 'Hide iTunes request/response' : 'Show iTunes request/response'}
                      </button>
                      {itunesDebugOpen[item.spotify_track_id] && (
                        <div className="mt-2 space-y-2">
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400">Request</div>
                            <div className="break-all text-[11px] text-gray-600">{itunesEntry.itunesRequestUrl}</div>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400">Response</div>
                            <pre className="max-h-56 overflow-auto rounded-md bg-gray-100 p-2 text-[11px] text-gray-600">
                              {itunesEntry.itunesResponse || 'No response captured.'}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {item.error ? <div className="text-xs text-rose-600">{item.error}</div> : null}
                  {item.isrc_mismatch_reviewed_at ? (
                    <div className="text-xs text-gray-400">
                      Reviewed {new Date(item.isrc_mismatch_reviewed_at).toLocaleString()} by{' '}
                      {item.isrc_mismatch_reviewed_by || 'unknown'}
                    </div>
                  ) : null}
                  <div className="pt-2 space-y-2">
                    <div className="text-xs uppercase tracking-[0.18em] text-gray-400">Spotify preview (Muso)</div>
                    {spotifyPreviewMap[item.spotify_track_id]?.url ? (
                      <audio controls preload="none" className="w-full" onPlay={handlePlay}>
                        <source src={spotifyPreviewMap[item.spotify_track_id]?.url || undefined} />
                      </audio>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleLoadSpotifyPreview(item.spotify_track_id)}
                        className="rounded-full border border-gray-200 px-3 py-1 text-[11px] font-semibold text-gray-600 hover:text-gray-900"
                        disabled={spotifyPreviewMap[item.spotify_track_id]?.loading}
                      >
                        {spotifyPreviewMap[item.spotify_track_id]?.loading ? 'Loading Spotify preview...' : 'Load Spotify preview'}
                      </button>
                    )}
                    {spotifyPreviewMap[item.spotify_track_id]?.error ? (
                      <div className="text-xs text-rose-600">{spotifyPreviewMap[item.spotify_track_id]?.error}</div>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleReview(item.spotify_track_id, 'confirm_match')}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    disabled={loading}
                  >
                    Confirm match
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReview(item.spotify_track_id, 'confirm_mismatch')}
                    className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    disabled={loading}
                  >
                    Confirm mismatch
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResolveWithMuso(item.spotify_track_id)}
                    className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                    disabled={loading}
                  >
                    Resolve with Muso preview
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {showMatched ? (
        <div className="text-xs text-gray-500">
          Showing {items.length} records, including {reviewedItems.length} reviewed records.
        </div>
      ) : (
        <div className="text-xs text-gray-500">
          Showing {visibleItems.length} records. Manually matched records are hidden.
        </div>
      )}
      {visibleItems.length > 0 && totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span>Rows</span>
            <select
              value={pageSize}
              onChange={(event) => {
                const value = Number(event.target.value)
                setPageSize(value)
                setPage(1)
              }}
              className="rounded-full border border-gray-200 px-2 py-1 text-xs text-gray-600"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={40}>40</option>
              <option value={80}>80</option>
            </select>
            <span>
              Page {page} of {totalPages}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1}
              className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page === totalPages}
              className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
