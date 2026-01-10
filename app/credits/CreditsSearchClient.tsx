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
  isrcDetails?: Array<{ value: string; hasDeezer: boolean; selected?: boolean; reason?: string }>
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

  const limit = 25
  const historyKey = 'creditsSearchHistory'

  useEffect(() => {
    if (typeof window === 'undefined') return
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
        if (payload.type === 'result' && payload.track) {
          setResults((prev) => [...prev, payload.track])
          setTrackCount((prev) => prev + 1)
          batchCount += 1
          const totalLoaded = offset + batchCount
          setStatusMessage(`Loaded ${batchCount} of ${limit} (total ${totalLoaded})…`)
          return
        }
        if (payload.type === 'done') {
          const streamedCount = typeof payload.count === 'number' ? payload.count : 0
          setLastBatchCount(streamedCount)
          setLoading(false)
          setStatusMessage(streamedCount > 0 ? `Loaded ${streamedCount} results.` : 'No results found yet.')
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

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-4 sm:p-6">
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
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
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
        <p className="mt-3 text-xs text-gray-500">
          Searches MusicBrainz recordings by credit type and name.
        </p>
        {loading && statusMessage && (
          <div className="mt-4 text-xs text-gray-500">
            {statusMessage}
          </div>
        )}
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Results</h2>
          <span className="text-sm text-gray-500">
            {trackCount > 0 ? `${trackCount} tracks` : 'No results yet'}
          </span>
        </div>

        {results.length === 0 ? (
          <div className="text-sm text-gray-500">Search to see matching songs.</div>
        ) : (
          <>
            <div className="sm:hidden space-y-3">
              {results.map((track) => (
                <div
                  key={`${track.id}-${track.releaseId}`}
                  className="border border-gray-200 rounded-lg p-3 shadow-sm bg-white"
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
                        >
                          {track.title}
                        </a>
                        {track.previewUrl ? (
                          <button
                            type="button"
                            onClick={() => handleTogglePreview(track)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:text-gray-900"
                            aria-label={playingId === track.id ? 'Pause preview' : 'Play preview'}
                          >
                            {playingId === track.id ? (
                              <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
                                <rect x="3.5" y="3" width="3" height="10" rx="0.5" fill="currentColor" />
                                <rect x="9.5" y="3" width="3" height="10" rx="0.5" fill="currentColor" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
                                <path d="M5 3.5 12 8l-7 4.5z" fill="currentColor" />
                              </svg>
                            )}
                          </button>
                        ) : null}
                      </div>
                      <div className="text-xs text-gray-600 truncate">{track.artist}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {track.album} {track.year ? `• ${track.year}` : ''}
                      </div>
                      <div className="text-xs text-gray-500">
                        {track.length ? formatDuration(track.length) : '-'} {track.isrc ? `• ${track.isrc}` : ''}
                      </div>
                      {track.isrcDetails && track.isrcDetails.length > 0 && (
                        <div className="mt-1 text-[11px] text-gray-400">
                          {track.isrcDetails.map((entry) => {
                            const label = entry.selected ? `${entry.value}*` : entry.value
                            const suffix = entry.hasDeezer ? ' (D)' : ''
                            return `${label}${suffix}`
                          }).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden sm:block bg-white rounded-lg overflow-hidden border border-gray-200 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 w-12">
                        #
                      </th>
                      <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 w-12 lg:w-16">
                        Cover
                      </th>
                      <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">
                        Track
                      </th>
                      <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 hidden md:table-cell max-w-[140px]">
                        Artist
                      </th>
                      <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 hidden lg:table-cell max-w-[160px]">
                        Release
                      </th>
                      <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 hidden md:table-cell">
                        Duration
                      </th>
                      <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">
                        Year
                      </th>
                      <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 w-16">
                        Preview
                      </th>
                      <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 hidden lg:table-cell">
                        ISRC
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {results.map((track, index) => (
                      <tr key={`${track.id}-${track.releaseId}`} className="hover:bg-gray-50">
                        <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-500 text-xs sm:text-sm">
                          {index + 1}
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
                        <td className="px-3 lg:px-4 py-2 lg:py-3">
                          {track.previewUrl ? (
                            <button
                              type="button"
                              onClick={() => handleTogglePreview(track)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:text-gray-900"
                              aria-label={playingId === track.id ? 'Pause preview' : 'Play preview'}
                            >
                              {playingId === track.id ? (
                                <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
                                  <rect x="3.5" y="3" width="3" height="10" rx="0.5" fill="currentColor" />
                                  <rect x="9.5" y="3" width="3" height="10" rx="0.5" fill="currentColor" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
                                  <path d="M5 3.5 12 8l-7 4.5z" fill="currentColor" />
                                </svg>
                              )}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-600 text-xs sm:text-sm hidden lg:table-cell">
                          {track.isrcDetails && track.isrcDetails.length > 0 ? (
                            <div className="space-y-1">
                              {track.isrcDetails.map((entry) => (
                                <div
                                  key={entry.value}
                                  className={`inline-flex items-center gap-1 ${entry.selected ? 'text-gray-900' : ''}`}
                                  title={entry.reason}
                                >
                                  <span>{entry.value}</span>
                                  {entry.hasDeezer ? (
                                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                                      Deezer
                                    </span>
                                  ) : null}
                                  {entry.selected ? (
                                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700">
                                      Selected
                                    </span>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            track.isrc || '-'
                          )}
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
