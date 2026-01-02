import { NextResponse } from 'next/server'
import { getPlaylists } from '@/lib/spotify'

export async function GET() {
  try {
    const playlists = await getPlaylists()
    return NextResponse.json(playlists)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    console.error('Error fetching playlists:', error)
    return NextResponse.json(
      { error: 'Failed to fetch playlists' },
      { status: 500 }
    )
  }
}

