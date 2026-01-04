import { NextResponse } from 'next/server'
import { getPlaylistsWithMetadata } from '@/lib/playlists'
import { trackApiRequest, getCurrentUserId } from '@/lib/analytics'
import { logError, logInfo } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const userId = await getCurrentUserId()
  let response: NextResponse

  try {
    logInfo('Fetching playlists', {
      component: 'api.playlists',
      userId: userId || 'anonymous',
    })
    
    const playlists = await getPlaylistsWithMetadata()
    response = NextResponse.json(playlists)
    
    logInfo('Playlists fetched successfully', {
      component: 'api.playlists',
      userId: userId || 'anonymous',
      count: Array.isArray(playlists) ? playlists.length : 0,
    })
    
    // Track successful request
    trackApiRequest(userId, '/api/playlists', 'GET', 200).catch(() => {})
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      logError(error, {
        component: 'api.playlists',
        userId: userId || 'anonymous',
        status: 401,
        errorType: 'Unauthorized',
      })
      response = NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
      trackApiRequest(userId, '/api/playlists', 'GET', 401).catch(() => {})
      return response
    }
    
    // Handle forbidden (403)
    if (error instanceof Error && (error.message.includes('Forbidden') || error.message.includes('403'))) {
      logError(error, {
        component: 'api.playlists',
        userId: userId || 'anonymous',
        status: 403,
        errorType: 'Forbidden',
        errorMessage: error.message,
      })
      response = NextResponse.json(
        { error: error.message || 'Access forbidden. Please check your Spotify app permissions.' },
        { status: 403 }
      )
      trackApiRequest(userId, '/api/playlists', 'GET', 403).catch(() => {})
      return response
    }
    
    // Handle rate limiting (429) - redirect to rate-limit page
    if (error instanceof Error && (error.message.includes('Rate limit') || error.message.includes('429'))) {
      logError(error, {
        component: 'api.playlists',
        userId: userId || 'anonymous',
        status: 429,
        errorType: 'RateLimit',
        errorMessage: error.message,
      })
      trackApiRequest(userId, '/api/playlists', 'GET', 429).catch(() => {})
      // Extract retryAfter from error message if available, or use 0
      const retryAfterMatch = error.message.match(/retryAfter[:\s]+(\d+)/i)
      const retryAfter = retryAfterMatch ? retryAfterMatch[1] : '0'
      // Redirect to rate-limit page with endpoint and retryAfter info
      const rateLimitUrl = new URL('/rate-limit', request.url)
      rateLimitUrl.searchParams.set('endpoint', '/api/playlists')
      rateLimitUrl.searchParams.set('retryAfter', retryAfter)
      return NextResponse.redirect(rateLimitUrl)
    }
    
    logError(error, {
      component: 'api.playlists',
      userId: userId || 'anonymous',
      status: 500,
      errorType: 'Unknown',
    })
    response = NextResponse.json(
      { error: 'Failed to fetch playlists' },
      { status: 500 }
    )
    trackApiRequest(userId, '/api/playlists', 'GET', 500).catch(() => {})
  }

  return response!
}

