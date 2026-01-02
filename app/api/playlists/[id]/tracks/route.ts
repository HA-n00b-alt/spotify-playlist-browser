import { NextResponse } from 'next/server'
import { getPlaylistTracks, getAudioFeatures } from '@/lib/spotify'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tracks = await getPlaylistTracks(params.id)
    
    // Get audio features (BPM) for tracks
    const trackIds = tracks
      .map((track) => track.id)
      .filter((id): id is string => !!id)
    
    let audioFeatures: Record<string, any> = {}
    if (trackIds.length > 0) {
      try {
        audioFeatures = await getAudioFeatures(trackIds)
      } catch (error) {
        console.error('Error fetching audio features:', error)
        // Continue without audio features if it fails
      }
    }

    // Merge audio features into tracks
    const tracksWithFeatures = tracks.map((track) => ({
      ...track,
      tempo: audioFeatures[track.id]?.tempo || null,
    }))

    return NextResponse.json(tracksWithFeatures)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    console.error('Error fetching tracks:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch tracks'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

