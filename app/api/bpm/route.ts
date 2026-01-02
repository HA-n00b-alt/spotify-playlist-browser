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
    const result = await getBpmForSpotifyTrack(spotifyTrackId)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching BPM:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch BPM'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

