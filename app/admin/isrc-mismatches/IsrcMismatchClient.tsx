'use client'

import { useEffect, useMemo, useState } from 'react'

type PreviewUrlEntry = {
  url: string
  successful?: boolean
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

function getPreviewUrl(item: IsrcMismatchItem): string | null {
  if (item.preview_url) return item.preview_url
  const urls = item.urls || []
  const successful = urls.find((entry) => entry.successful)
  if (successful?.url) return successful.url
  const first = urls[0]?.url
  return first || null
}

export default function IsrcMismatchClient() {
  const [items, setItems] = useState<IsrcMismatchItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showReviewed, setShowReviewed] = useState(true)

  const loadMismatches = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/isrc-mismatches')
      if (!res.ok) {
        throw new Error('Failed to load ISRC mismatches')
      }
      const data = await res.json()
      setItems(Array.isArray(data?.items) ? data.items : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ISRC mismatches')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMismatches()
  }, [])

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

  const visibleItems = showReviewed ? items : pendingItems

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
          <button
            type="button"
            onClick={() => setShowReviewed((prev) => !prev)}
            className="rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
          >
            {showReviewed ? 'Hide reviewed' : 'Show reviewed'}
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
        {visibleItems.map((item) => {
          const previewUrl = getPreviewUrl(item)
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
                    ISRC: {item.isrc || 'Missing'} | Spotify ID: {item.spotify_track_id}
                  </div>
                </div>
                <div className="text-xs font-semibold text-gray-500">{reviewLabel}</div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-400">Preview</div>
                  {previewUrl ? (
                    <audio controls preload="none" className="w-full">
                      <source src={previewUrl} />
                    </audio>
                  ) : (
                    <div className="text-xs text-gray-500">No preview URL available.</div>
                  )}
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

      {showReviewed ? (
        <div className="text-xs text-gray-500">
          Showing {pendingItems.length} pending and {reviewedItems.length} reviewed records.
        </div>
      ) : (
        <div className="text-xs text-gray-500">Showing {pendingItems.length} pending records.</div>
      )}
    </div>
  )
}
