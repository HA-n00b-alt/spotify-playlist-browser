import { NextResponse } from 'next/server'
import { isAdminUser, getCurrentUserId } from '@/lib/analytics'
import { query } from '@/lib/db'
import { withApiLogging } from '@/lib/logger'
import { computeBpmFromPreviewUrl } from '@/lib/bpm'
import { getTrack } from '@/lib/spotify'
import { getTrackDetailsByIsrc, hasMusoApiKey } from '@/lib/muso'

type IsrcMismatchRow = {
  spotify_track_id: string
  isrc: string | null
  title: string | null
  artist: string | null
}

type ResolveResult = {
  spotifyTrackId: string
  status: 'resolved' | 'skipped' | 'failed'
  reason?: string
  previewUrl?: string | null
  isrc?: string | null
}

export const POST = withApiLogging(async (request: Request) => {
  const isAdmin = await isAdminUser()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  if (!hasMusoApiKey()) {
    return NextResponse.json({ error: 'Muso API key is not configured' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const requestedLimit = Number(body?.limit)
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 1000)
    : null

  const reviewerId = await getCurrentUserId()
  const rows = limit
    ? await query<IsrcMismatchRow>(
        `SELECT spotify_track_id, isrc, title, artist
           FROM track_bpm_cache
          WHERE isrc_mismatch = true
            AND (isrc_mismatch_review_status IS NULL OR isrc_mismatch_review_status <> 'match')
          ORDER BY updated_at DESC
          LIMIT $1`,
        [limit]
      )
    : await query<IsrcMismatchRow>(
        `SELECT spotify_track_id, isrc, title, artist
           FROM track_bpm_cache
          WHERE isrc_mismatch = true
            AND (isrc_mismatch_review_status IS NULL OR isrc_mismatch_review_status <> 'match')
          ORDER BY updated_at DESC`
      )

  const results: ResolveResult[] = []
  let resolved = 0
  let skipped = 0

  for (const row of rows) {
    const spotifyTrackId = row.spotify_track_id
    let spotifyIsrc = row.isrc
    let spotifyTitle = row.title
    let spotifyArtist = row.artist

    if (!spotifyIsrc) {
      try {
        const track = await getTrack(spotifyTrackId)
        spotifyIsrc = track?.external_ids?.isrc || null
        spotifyTitle = spotifyTitle || track?.name || null
        spotifyArtist =
          spotifyArtist ||
          (Array.isArray(track?.artists)
            ? track.artists.map((artist: any) => artist?.name).filter(Boolean).join(', ')
            : null)
      } catch {
        spotifyIsrc = null
      }
    }

    if (!spotifyIsrc) {
      results.push({ spotifyTrackId, status: 'skipped', reason: 'missing_isrc' })
      skipped += 1
      continue
    }

    try {
      const musoDetails = await getTrackDetailsByIsrc(spotifyIsrc)
      const previewUrl = musoDetails?.spotifyPreviewUrl || null
      if (!previewUrl) {
        results.push({ spotifyTrackId, status: 'skipped', reason: 'no_preview', isrc: spotifyIsrc })
        skipped += 1
        continue
      }

      await computeBpmFromPreviewUrl({
        spotifyTrackId,
        previewUrl,
        source: 'muso_spotify_preview',
        previewIsrc: spotifyIsrc,
        previewTitle: musoDetails?.title || spotifyTitle || null,
        previewArtist: Array.isArray(musoDetails?.artists)
          ? musoDetails?.artists?.map((artist) => artist?.name).filter(Boolean).join(', ')
          : spotifyArtist || null,
      })

      await query(
        `UPDATE track_bpm_cache
            SET isrc_mismatch = false,
                isrc_mismatch_review_status = 'match',
                isrc_mismatch_reviewed_by = $2,
                isrc_mismatch_reviewed_at = NOW()
          WHERE spotify_track_id = $1`,
        [spotifyTrackId, reviewerId]
      )

      results.push({ spotifyTrackId, status: 'resolved', previewUrl, isrc: spotifyIsrc })
      resolved += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed'
      results.push({ spotifyTrackId, status: 'failed', reason: message, isrc: spotifyIsrc })
    }
  }

  return NextResponse.json({
    processed: rows.length,
    resolved,
    skipped,
    results,
  })
})
