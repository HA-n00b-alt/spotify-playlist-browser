import { NextResponse } from 'next/server'
import { refreshPreviewUrlsForTrack } from '@/lib/bpm'
import { getCurrentUserId, trackApiRequest } from '@/lib/analytics'
import { logError, logInfo } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const spotifyTrackId = searchParams.get('spotifyTrackId')
  const countryParam = searchParams.get('country')
  const userId = await getCurrentUserId()

  if (!spotifyTrackId) {
    trackApiRequest(userId, '/api/bpm/preview-refresh', 'GET', 400).catch(() => {})
    return NextResponse.json({ error: 'spotifyTrackId parameter is required' }, { status: 400 })
  }

  try {
    logInfo('Refreshing preview URL via ISRC', {
      component: 'api.bpm.preview-refresh',
      userId: userId || 'anonymous',
      spotifyTrackId,
      country: countryParam || 'auto',
    })

    let modifiedRequest = request
    if (countryParam) {
      const headers = new Headers(request.headers)
      headers.set('x-country-override', countryParam)
      modifiedRequest = new Request(request.url, {
        method: request.method,
        headers,
        body: request.body,
        redirect: request.redirect,
      })
    }

    const result = await refreshPreviewUrlsForTrack(spotifyTrackId, modifiedRequest)
    trackApiRequest(userId, '/api/bpm/preview-refresh', 'GET', 200).catch(() => {})
    return NextResponse.json(result)
  } catch (error) {
    logError(error, {
      component: 'api.bpm.preview-refresh',
      userId: userId || 'anonymous',
      spotifyTrackId,
      status: 500,
    })
    const message = error instanceof Error ? error.message : 'Failed to refresh preview URL'
    trackApiRequest(userId, '/api/bpm/preview-refresh', 'GET', 500).catch(() => {})
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
