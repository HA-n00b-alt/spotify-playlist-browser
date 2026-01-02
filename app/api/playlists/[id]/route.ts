import { NextResponse } from 'next/server'
import { getPlaylist } from '@/lib/spotify'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const playlist = await getPlaylist(params.id)
    return NextResponse.json(playlist)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    console.error('Error fetching playlist:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch playlist'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

