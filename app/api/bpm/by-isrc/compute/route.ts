import { NextResponse } from 'next/server'
import { getBpmForSpotifyTrack } from '@/lib/bpm'
import { makeSpotifyRequest } from '@/lib/spotify'
import { getCurrentUserId, trackApiRequest } from '@/lib/analytics'
import { withApiLogging } from '@/lib/logger'

export const dynamic = 'force-dynamic'

type SpotifySearchResponse = {
  tracks?: {
    items?: Array<{ id: string }>
  }
}

function cleanArtistName(artist: string) {
  return artist.split(' feat.')[0].split(' ft.')[0].trim()
}

async function resolveSpotifyTrackId(params: {
  isrc?: string | null
  title?: string | null
  artist?: string | null
}) {
  const { isrc, title, artist } = params
  if (isrc) {
    const searchRes = await makeSpotifyRequest<SpotifySearchResponse>(
      `/search?q=${encodeURIComponent(`isrc:${isrc}`)}&type=track&limit=1`
    )
    const id = searchRes.tracks?.items?.[0]?.id
    if (id) return id
  }
  if (title && artist) {
    const cleanArtist = cleanArtistName(artist)
    const searchQuery = `track:${title} artist:${cleanArtist}`
    const searchRes = await makeSpotifyRequest<SpotifySearchResponse>(
      `/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=1`
    )
    return searchRes.tracks?.items?.[0]?.id ?? null
  }
  return null
}

export const POST = withApiLogging(async (request: Request) => {
  const userId = await getCurrentUserId()
  const body = await request.json().catch(() => ({}))
  const isrc = typeof body?.isrc === 'string' ? body.isrc.trim() : null
  const title = typeof body?.title === 'string' ? body.title.trim() : null
  const artist = typeof body?.artist === 'string' ? body.artist.trim() : null
  let spotifyTrackId = typeof body?.spotifyTrackId === 'string' ? body.spotifyTrackId.trim() : ''

  if (!isrc && !spotifyTrackId) {
    trackApiRequest(userId, '/api/bpm/by-isrc/compute', 'POST', 400).catch(() => {})
    return NextResponse.json({ error: 'isrc or spotifyTrackId is required' }, { status: 400 })
  }

  try {
    if (!spotifyTrackId) {
      const resolved = await resolveSpotifyTrackId({ isrc, title, artist })
      if (!resolved) {
        trackApiRequest(userId, '/api/bpm/by-isrc/compute', 'POST', 404).catch(() => {})
        return NextResponse.json({ error: 'Unable to resolve Spotify track' }, { status: 404 })
      }
      spotifyTrackId = resolved
    }

    const result = await getBpmForSpotifyTrack(spotifyTrackId, request)
    trackApiRequest(userId, '/api/bpm/by-isrc/compute', 'POST', 200).catch(() => {})
    return NextResponse.json({ spotifyTrackId, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to compute BPM'
    trackApiRequest(userId, '/api/bpm/by-isrc/compute', 'POST', 500).catch(() => {})
    return NextResponse.json({ error: message }, { status: 500 })
  }
})
