import { NextResponse } from 'next/server'
import { getBpmForSpotifyTrack } from '@/lib/bpm'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const spotifyTrackId = searchParams.get('spotifyTrackId')

  if (!spotifyTrackId) {
    return NextResponse.json(
      { error: 'spotifyTrackId parameter is required' },
      { status: 400 }
    )
  }

  try {
    console.log(`[BPM API] Fetching BPM for track: ${spotifyTrackId}`)
    const result = await getBpmForSpotifyTrack(spotifyTrackId)
    console.log(`[BPM API] Result for ${spotifyTrackId}:`, JSON.stringify(result, null, 2))
    return NextResponse.json(result)
  } catch (error) {
    console.error(`[BPM API] Error fetching BPM for ${spotifyTrackId}:`, error)
    if (error instanceof Error) {
      console.error(`[BPM API] Error stack:`, error.stack)
    }
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch BPM'
    return NextResponse.json(
      { error: errorMessage, debug: { trackId: spotifyTrackId, error: errorMessage } },
      { status: 500 }
    )
  }
}

