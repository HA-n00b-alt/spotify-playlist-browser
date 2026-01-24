import { NextResponse } from 'next/server'
import { getTrack } from '@/lib/spotify'
import { getTrackDetailsByIsrc, hasMusoApiKey } from '@/lib/muso'
import { getCurrentUserId, trackApiRequest } from '@/lib/analytics'
import { withApiLogging } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export const POST = withApiLogging(async (request: Request) => {
  const userId = await getCurrentUserId()
  const body = await request.json().catch(() => ({}))
  const spotifyTrackId = typeof body?.spotifyTrackId === 'string' ? body.spotifyTrackId.trim() : ''

  if (!spotifyTrackId) {
    trackApiRequest(userId, '/api/muso/preview', 'POST', 400).catch(() => {})
    return NextResponse.json({ error: 'spotifyTrackId is required' }, { status: 400 })
  }

  if (!hasMusoApiKey()) {
    trackApiRequest(userId, '/api/muso/preview', 'POST', 400).catch(() => {})
    return NextResponse.json({ error: 'Muso API key is not configured' }, { status: 400 })
  }

  try {
    const spotifyTrack = await getTrack(spotifyTrackId)
    const spotifyIsrc = spotifyTrack?.external_ids?.isrc || null
    if (!spotifyIsrc) {
      trackApiRequest(userId, '/api/muso/preview', 'POST', 400).catch(() => {})
      return NextResponse.json({ error: 'Spotify ISRC not available for this track' }, { status: 400 })
    }

    const musoDetails = await getTrackDetailsByIsrc(spotifyIsrc)
    const previewUrl = musoDetails?.spotifyPreviewUrl || null
    if (!previewUrl) {
      trackApiRequest(userId, '/api/muso/preview', 'POST', 404).catch(() => {})
      return NextResponse.json({ error: 'No Spotify preview URL found via Muso' }, { status: 404 })
    }

    trackApiRequest(userId, '/api/muso/preview', 'POST', 200).catch(() => {})
    return NextResponse.json({ previewUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch Muso preview URL'
    trackApiRequest(userId, '/api/muso/preview', 'POST', 500).catch(() => {})
    return NextResponse.json({ error: message }, { status: 500 })
  }
})
