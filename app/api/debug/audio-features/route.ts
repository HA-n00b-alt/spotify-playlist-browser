import { NextResponse } from 'next/server'
import { getAudioFeatures } from '@/lib/spotify'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const idsParam = searchParams.get('ids')
    
    if (!idsParam) {
      return NextResponse.json(
        { error: 'Missing ids parameter' },
        { status: 400 }
      )
    }
    
    const trackIds = idsParam.split(',').filter(id => id.trim())
    
    if (trackIds.length === 0) {
      return NextResponse.json(
        { error: 'No valid track IDs provided' },
        { status: 400 }
      )
    }
    
    console.log(`[DEBUG API] Fetching audio features for ${trackIds.length} tracks:`, trackIds)
    
    const audioFeatures = await getAudioFeatures(trackIds)
    
    console.log(`[DEBUG API] Received audio features:`, audioFeatures)
    
    return NextResponse.json({
      trackIds,
      audioFeatures,
      count: Object.keys(audioFeatures).length,
      tracksWithTempo: Object.values(audioFeatures).filter((f: any) => f?.tempo != null).length,
      sampleFeature: Object.values(audioFeatures)[0] || null
    })
  } catch (error) {
    console.error('[DEBUG API] Error:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

