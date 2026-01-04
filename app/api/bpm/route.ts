import { NextResponse } from 'next/server'
import { getBpmForSpotifyTrack } from '@/lib/bpm'
import { trackApiRequest, getCurrentUserId } from '@/lib/analytics'
import { logError, logInfo } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const spotifyTrackId = searchParams.get('spotifyTrackId')
  const countryParam = searchParams.get('country')
  const userId = await getCurrentUserId()

  if (!spotifyTrackId) {
    const error = new Error('spotifyTrackId parameter is required')
    logError(error, {
      component: 'api.bpm',
      userId: userId || 'anonymous',
      status: 400,
    })
    trackApiRequest(userId, '/api/bpm', 'GET', 400).catch(() => {})
    return NextResponse.json(
      { error: 'spotifyTrackId parameter is required' },
      { status: 400 }
    )
  }

  try {
    logInfo('Fetching BPM for track', {
      component: 'api.bpm',
      userId: userId || 'anonymous',
      spotifyTrackId,
      country: countryParam || 'auto',
    })
    
    // Create a modified request with country in header if provided
    let modifiedRequest = request
    
    if (countryParam) {
      // Create a new Request with the country override header
      const headers = new Headers(request.headers)
      headers.set('x-country-override', countryParam)
      modifiedRequest = new Request(request.url, {
        method: request.method,
        headers: headers,
        body: request.body,
        redirect: request.redirect,
      })
    }
    
    const result = await getBpmForSpotifyTrack(spotifyTrackId, modifiedRequest)
    
    logInfo('BPM fetched successfully', {
      component: 'api.bpm',
      userId: userId || 'anonymous',
      spotifyTrackId,
      hasBpm: result.bpm !== null,
      source: result.source,
    })
    
    trackApiRequest(userId, '/api/bpm', 'GET', 200).catch(() => {})
    return NextResponse.json(result)
  } catch (error) {
    logError(error, {
      component: 'api.bpm',
      userId: userId || 'anonymous',
      spotifyTrackId,
      country: countryParam || 'auto',
      status: 500,
    })
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch BPM'
    trackApiRequest(userId, '/api/bpm', 'GET', 500).catch(() => {})
    return NextResponse.json(
      { error: errorMessage, debug: { trackId: spotifyTrackId, error: errorMessage } },
      { status: 500 }
    )
  }
}

