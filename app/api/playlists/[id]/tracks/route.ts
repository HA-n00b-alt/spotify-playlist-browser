import { NextResponse } from 'next/server'
import { getPlaylistTracks } from '@/lib/spotify'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const tracks = await getPlaylistTracks(params.id)
    return NextResponse.json(tracks)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    console.error('Error fetching tracks:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tracks' },
      { status: 500 }
    )
  }
}

