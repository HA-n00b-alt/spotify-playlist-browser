import { NextResponse } from 'next/server'
import { getPlaylistTracks } from '@/lib/spotify'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tracks = await getPlaylistTracks(params.id)
    
    // Return tracks (BPM is fetched separately via /api/bpm endpoint)
    return NextResponse.json(tracks)
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

