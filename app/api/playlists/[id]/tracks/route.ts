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
    
    console.log(`[DEBUG API Route] Fetching audio features for ${trackIds.length} tracks`)
    console.log(`[DEBUG API Route] First 5 track IDs:`, trackIds.slice(0, 5))
    
    let audioFeatures: Record<string, any> = {}
    if (trackIds.length > 0) {
      try {
        audioFeatures = await getAudioFeatures(trackIds)
        console.log(`[DEBUG API Route] Received audio features for ${Object.keys(audioFeatures).length} tracks`)
        
        // Log sample features with tempo
        const featuresWithTempo = Object.entries(audioFeatures).filter(([_, feat]) => feat?.tempo != null)
        const featuresWithoutTempo = Object.entries(audioFeatures).filter(([_, feat]) => feat?.tempo == null)
        
        console.log(`[DEBUG API Route] Features with tempo: ${featuresWithTempo.length}`)
        console.log(`[DEBUG API Route] Features without tempo: ${featuresWithoutTempo.length}`)
        
        if (featuresWithTempo.length > 0) {
          console.log(`[DEBUG API Route] Sample feature WITH tempo:`, featuresWithTempo[0])
        }
        if (featuresWithoutTempo.length > 0) {
          console.log(`[DEBUG API Route] Sample feature WITHOUT tempo:`, featuresWithoutTempo[0])
        }
        
        // Check if any features are null
        const nullFeatures = Object.entries(audioFeatures).filter(([_, feat]) => feat === null)
        if (nullFeatures.length > 0) {
          console.log(`[DEBUG API Route] Found ${nullFeatures.length} null features in response`)
        }
      } catch (error) {
        console.error('[DEBUG API Route] Error fetching audio features:', error)
        if (error instanceof Error) {
          console.error('[DEBUG API Route] Error message:', error.message)
          console.error('[DEBUG API Route] Error stack:', error.stack)
        }
        // Continue without audio features if it fails
      }
    } else {
      console.log(`[DEBUG API Route] No track IDs to fetch features for`)
    }

    // Merge audio features into tracks
    const tracksWithFeatures = tracks.map((track) => {
      const feature = audioFeatures[track.id]
      const tempo = feature?.tempo ?? null
      
      // Debug logging for first few tracks
      if (tracks.indexOf(track) < 3) {
        console.log(`[DEBUG API Route] Track ${track.name}:`, {
          trackId: track.id,
          hasFeature: !!feature,
          featureIsNull: feature === null,
          tempo: tempo,
          featureData: feature ? JSON.stringify(feature).substring(0, 200) : 'null'
        })
      }
      
      return {
        ...track,
        tempo: tempo,
      }
    })

    const tracksWithTempo = tracksWithFeatures.filter(t => t.tempo != null)
    console.log(`[DEBUG API Route] Final result: ${tracksWithTempo.length} tracks with tempo out of ${tracksWithFeatures.length} total`)

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

