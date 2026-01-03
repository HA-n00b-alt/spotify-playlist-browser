import { NextResponse } from 'next/server'
import { getPlaylists } from '@/lib/spotify'
import { trackApiRequest, getCurrentUserId } from '@/lib/analytics'

export async function GET() {
  const userId = await getCurrentUserId()
  let response: NextResponse

  try {
    const playlists = await getPlaylists()
    response = NextResponse.json(playlists)
    
    // Track successful request
    trackApiRequest(userId, '/api/playlists', 'GET', 200).catch(() => {})
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      response = NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
      trackApiRequest(userId, '/api/playlists', 'GET', 401).catch(() => {})
      return response
    }
    
    // Handle rate limiting (429)
    if (error instanceof Error && (error.message.includes('Rate limit') || error.message.includes('429'))) {
      console.error('Rate limit error fetching playlists:', error)
      response = NextResponse.json(
        { error: 'Rate limit exceeded. Please try again in a moment.' },
        { status: 429 }
      )
      trackApiRequest(userId, '/api/playlists', 'GET', 429).catch(() => {})
      return response
    }
    
    console.error('Error fetching playlists:', error)
    response = NextResponse.json(
      { error: 'Failed to fetch playlists' },
      { status: 500 }
    )
    trackApiRequest(userId, '/api/playlists', 'GET', 500).catch(() => {})
  }

  return response!
}

