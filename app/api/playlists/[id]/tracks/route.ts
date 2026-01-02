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
    
    console.log(`[DEBUG] Fetching audio features for ${trackIds.length} tracks`)
    
    let audioFeatures: Record<string, any> = {}
    if (trackIds.length > 0) {
      try {
        audioFeatures = await getAudioFeatures(trackIds)
        console.log(`[DEBUG] Received audio features for ${Object.keys(audioFeatures).length} tracks`)
        console.log(`[DEBUG] Sample audio feature:`, Object.values(audioFeatures)[0])
      } catch (error) {
        console.error('[DEBUG] Error fetching audio features:', error)
        // Continue without audio features if it fails
      }
    }

    // Merge audio features into tracks
    const tracksWithFeatures = tracks.map((track) => {
      const feature = audioFeatures[track.id]
      const tempo = feature?.tempo ?? null
      
      // Debug logging for first few tracks
      if (tracks.indexOf(track) < 3) {
        console.log(`[DEBUG] Track ${track.name}:`, {
          trackId: track.id,
          hasFeature: !!feature,
          tempo: tempo,
          featureData: feature
        })
      }
      
      return {
        ...track,
        tempo: tempo,
      }
    })

    console.log(`[DEBUG] Tracks with tempo: ${tracksWithFeatures.filter(t => t.tempo != null).length} of ${tracksWithFeatures.length}`)

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

