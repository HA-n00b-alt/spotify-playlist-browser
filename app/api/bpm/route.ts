import { NextResponse } from 'next/server'
import { getBpmForSpotifyTrack } from '@/lib/bpm'
import { trackApiRequest, getCurrentUserId } from '@/lib/analytics'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const spotifyTrackId = searchParams.get('spotifyTrackId')
  const userId = await getCurrentUserId()

  if (!spotifyTrackId) {
    trackApiRequest(userId, '/api/bpm', 'GET', 400).catch(() => {})
    return NextResponse.json(
      { error: 'spotifyTrackId parameter is required' },
      { status: 400 }
    )
  }

  try {
    console.log(`[BPM API] Fetching BPM for track: ${spotifyTrackId}`)
    const result = await getBpmForSpotifyTrack(spotifyTrackId)
    console.log(`[BPM API] Result for ${spotifyTrackId}:`, JSON.stringify(result, null, 2))
    trackApiRequest(userId, '/api/bpm', 'GET', 200).catch(() => {})
    return NextResponse.json(result)
  } catch (error) {
    console.error(`[BPM API] Error fetching BPM for ${spotifyTrackId}:`, error)
    if (error instanceof Error) {
      console.error(`[BPM API] Error stack:`, error.stack)
    }
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch BPM'
    trackApiRequest(userId, '/api/bpm', 'GET', 500).catch(() => {})
    return NextResponse.json(
      { error: errorMessage, debug: { trackId: spotifyTrackId, error: errorMessage } },
      { status: 500 }
    )
  }
}

