import { NextResponse } from 'next/server'
import { isAdminUser, getCurrentUserId } from '@/lib/analytics'
import { query } from '@/lib/db'
import { withApiLogging } from '@/lib/logger'
import { computeBpmFromPreviewUrl } from '@/lib/bpm'

export const POST = withApiLogging(async (request: Request) => {
  const isAdmin = await isAdminUser()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const spotifyTrackId = typeof body?.spotifyTrackId === 'string' ? body.spotifyTrackId.trim() : ''
  const previewUrl = typeof body?.previewUrl === 'string' ? body.previewUrl.trim() : ''
  const source = typeof body?.source === 'string' ? body.source.trim() : undefined
  const previewIsrc = typeof body?.previewIsrc === 'string' ? body.previewIsrc.trim() : null
  const previewTitle = typeof body?.previewTitle === 'string' ? body.previewTitle.trim() : null
  const previewArtist = typeof body?.previewArtist === 'string' ? body.previewArtist.trim() : null

  if (!spotifyTrackId || !previewUrl) {
    return NextResponse.json(
      { error: 'spotifyTrackId and previewUrl are required' },
      { status: 400 }
    )
  }

  const reviewerId = await getCurrentUserId()

  const bpmResult = await computeBpmFromPreviewUrl({
    spotifyTrackId,
    previewUrl,
    source,
    previewIsrc,
    previewTitle,
    previewArtist,
  })

  await query(
    `UPDATE track_bpm_cache
        SET isrc_mismatch = false,
            isrc_mismatch_review_status = 'match',
            isrc_mismatch_reviewed_by = $2,
            isrc_mismatch_reviewed_at = NOW()
      WHERE spotify_track_id = $1
        AND isrc_mismatch = true`,
    [spotifyTrackId, reviewerId]
  )

  return NextResponse.json({ ok: true, bpmResult })
})
