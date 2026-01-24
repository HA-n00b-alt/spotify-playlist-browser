import { NextResponse } from 'next/server'
import { isAdminUser, getCurrentUserId } from '@/lib/analytics'
import { query } from '@/lib/db'
import { withApiLogging } from '@/lib/logger'
import { computeBpmFromPreviewUrl } from '@/lib/bpm'
import { getTrack } from '@/lib/spotify'
import { getTrackDetailsByIsrc, hasMusoApiKey } from '@/lib/muso'

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

type IsrcMismatchRow = {
  spotify_track_id: string
  isrc: string | null
  artist: string | null
  title: string | null
  updated_at: Date
  error: string | null
  urls: PreviewUrlEntry[] | null
  isrc_mismatch: boolean
  isrc_mismatch_review_status: string | null
  isrc_mismatch_reviewed_by: string | null
  isrc_mismatch_reviewed_at: Date | null
}

function getPreviewUrl(urls: PreviewUrlEntry[] | null): string | null {
  if (!urls || urls.length === 0) return null
  const successful = urls.find((entry) => entry.successful)
  if (successful?.url) return successful.url
  return urls[0]?.url || null
}

export const GET = withApiLogging(async () => {
  const isAdmin = await isAdminUser()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const rows = await query<IsrcMismatchRow>(
    `SELECT spotify_track_id, isrc, artist, title, updated_at, error, urls,
            isrc_mismatch, isrc_mismatch_review_status, isrc_mismatch_reviewed_by, isrc_mismatch_reviewed_at
       FROM track_bpm_cache
      WHERE isrc_mismatch = true OR isrc_mismatch_review_status IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 200`
  )

  const items = rows.map((row) => ({
    ...row,
    preview_url: getPreviewUrl(row.urls),
  }))

  return NextResponse.json({ items })
})

export const PATCH = withApiLogging(async (request: Request) => {
  const isAdmin = await isAdminUser()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const payload = await request.json().catch(() => null)
  const spotifyTrackId = typeof payload?.spotifyTrackId === 'string' ? payload.spotifyTrackId.trim() : ''
  const action = payload?.action as string | undefined

  if (!spotifyTrackId) {
    return NextResponse.json({ error: 'spotifyTrackId is required' }, { status: 400 })
  }

  if (action !== 'confirm_match' && action !== 'confirm_mismatch' && action !== 'resolve_with_muso') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const reviewerId = await getCurrentUserId()
  const reviewStatus = action === 'confirm_match' || action === 'resolve_with_muso' ? 'match' : 'mismatch'
  const mismatchValue = action === 'confirm_match' || action === 'resolve_with_muso' ? false : true

  if (action === 'resolve_with_muso') {
    if (!hasMusoApiKey()) {
      return NextResponse.json({ error: 'Muso API key is not configured' }, { status: 400 })
    }
    const spotifyTrack = await getTrack(spotifyTrackId)
    const spotifyIsrc = spotifyTrack?.external_ids?.isrc || null
    if (!spotifyIsrc) {
      return NextResponse.json({ error: 'Spotify ISRC not available for this track' }, { status: 400 })
    }
    const musoDetails = await getTrackDetailsByIsrc(spotifyIsrc)
    const previewUrl = musoDetails?.spotifyPreviewUrl || null
    if (!previewUrl) {
      return NextResponse.json({ error: 'No Spotify preview URL found via Muso' }, { status: 404 })
    }
    await computeBpmFromPreviewUrl({
      spotifyTrackId,
      previewUrl,
      source: 'muso_spotify_preview',
      previewIsrc: spotifyIsrc,
      previewTitle: spotifyTrack?.name || null,
      previewArtist: Array.isArray(spotifyTrack?.artists)
        ? spotifyTrack.artists.map((artist: any) => artist?.name).filter(Boolean).join(', ')
        : null,
    })
  }

  await query(
    `UPDATE track_bpm_cache
        SET isrc_mismatch = $1,
            isrc_mismatch_review_status = $2,
            isrc_mismatch_reviewed_by = $3,
            isrc_mismatch_reviewed_at = NOW()
      WHERE spotify_track_id = $4`,
    [mismatchValue, reviewStatus, reviewerId, spotifyTrackId]
  )

  return NextResponse.json({ ok: true })
})
