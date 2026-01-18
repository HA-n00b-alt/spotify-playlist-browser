'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type PreviewUrlEntry = {
  url: string
  successful?: boolean
  isrc?: string
  title?: string
  artist?: string
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

export default function IsrcMismatchClient() {
  const [items, setItems] = useState<IsrcMismatchItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMatched, setShowMatched] = useState(false)
  const [page, setPage] = useState(1)
  const [isHydratingPreview, setIsHydratingPreview] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [pageSize, setPageSize] = useState(20)

  const handlePlay = (event: React.SyntheticEvent<HTMLAudioElement>) => {
    if (audioRef.current && audioRef.current !== event.currentTarget) {
      audioRef.current.pause()
    }
    audioRef.current = event.currentTarget
  }

  const needsPreviewMeta = useCallback((item: IsrcMismatchItem) => {
    const entry = getPreviewEntry(item)
    if (!entry) return true
    return !entry.artist || !entry.title || !entry.isrc
  }, [])

  const hydrateMissingPreviewMeta = useCallback(async (rows: IsrcMismatchItem[]) => {
    const targets = rows.filter(needsPreviewMeta)
    if (targets.length === 0) return
    setIsHydratingPreview(true)
    for (const item of targets) {
      try {
        const res = await fetch(`/api/bpm?spotifyTrackId=${encodeURIComponent(item.spotify_track_id)}`)
        if (!res.ok) {
          continue
        }
        const data = await res.json().catch(() => ({}))
        if (!Array.isArray(data?.urls)) {
          continue
        }
        setItems((prev) =>
          prev.map((current) =>
            current.spotify_track_id === item.spotify_track_id
              ? { ...current, urls: data.urls }
              : current
          )
        )
      } catch {
        // Ignore preview metadata fetch errors.
      }
    }
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">ISRC Mismatch Review</h2>
          <p className="text-sm text-gray-500">
            Review preview audio for ISRC mismatches and confirm the correct status.
          </p>
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
          const previewUrl = previewEntry?.url || item.preview_url
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
                </div>
                <div className="text-xs font-semibold text-gray-500">{reviewLabel}</div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-400">Preview</div>
                  {previewUrl ? (
                    <audio controls preload="none" className="w-full" onPlay={handlePlay}>
                      <source src={previewUrl} />
                    </audio>
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
                  {item.error ? <div className="text-xs text-rose-600">{item.error}</div> : null}
                  {item.isrc_mismatch_reviewed_at ? (
                    <div className="text-xs text-gray-400">
                      Reviewed {new Date(item.isrc_mismatch_reviewed_at).toLocaleString()} by{' '}
                      {item.isrc_mismatch_reviewed_by || 'unknown'}
                    </div>
                  ) : null}
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
