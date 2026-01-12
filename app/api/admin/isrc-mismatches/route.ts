import { NextResponse } from 'next/server'
import { isAdminUser, getCurrentUserId } from '@/lib/analytics'
import { query } from '@/lib/db'

type PreviewUrlEntry = {
  url: string
  successful?: boolean
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

export async function GET() {
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
}

export async function PATCH(request: Request) {
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

  if (action !== 'confirm_match' && action !== 'confirm_mismatch') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const reviewerId = await getCurrentUserId()
  const reviewStatus = action === 'confirm_match' ? 'match' : 'mismatch'
  const mismatchValue = action === 'confirm_match' ? false : true

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
}
