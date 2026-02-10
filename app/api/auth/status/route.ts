import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { logError, logInfo, logWarning, withApiLogging } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

export const GET = withApiLogging(async () => {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('access_token')?.value
  const refreshToken = cookieStore.get('refresh_token')?.value

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ authenticated: false })
  }

  // Try to get user info with current access token
  let tokenToUse = accessToken
  
  const REQUEST_TIMEOUT_MS = 10_000

  // If no access token but we have refresh token, try to refresh
  if (!tokenToUse && refreshToken) {
    const clientId = process.env.SPOTIFY_CLIENT_ID
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

    if (clientId && clientSecret) {
      try {
        logInfo('Attempting token refresh from status endpoint', {
          component: 'auth.status',
        })
        const refreshController = new AbortController()
        const refreshTimeoutId = setTimeout(() => refreshController.abort(), REQUEST_TIMEOUT_MS)
        const refreshResponse = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          signal: refreshController.signal,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }),
        })
        clearTimeout(refreshTimeoutId)

        if (refreshResponse.ok) {
          const data = await refreshResponse.json()
          tokenToUse = data.access_token
        } else {
          logWarning('Token refresh failed in status endpoint', {
            component: 'auth.status',
            status: refreshResponse.status,
            statusText: refreshResponse.statusText,
          })
        }
      } catch (error) {
        const isTimeout = error instanceof Error && error.name === 'AbortError'
        if (isTimeout) {
          logWarning('Token refresh timed out', { component: 'auth.status', errorType: 'refresh' })
        } else {
          logError(error, { component: 'auth.status', errorType: 'refresh' })
        }
      }
    }
  }

  // Try to fetch user info
  if (tokenToUse) {
    try {
      const meController = new AbortController()
      const meTimeoutId = setTimeout(() => meController.abort(), REQUEST_TIMEOUT_MS)
      const response = await fetch('https://api.spotify.com/v1/me', {
        signal: meController.signal,
        headers: {
          Authorization: `Bearer ${tokenToUse}`,
        },
      })
      clearTimeout(meTimeoutId)

      if (response.ok) {
        const user = await response.json()
        return NextResponse.json({
          authenticated: true,
          user: {
            id: user.id,
            display_name: user.display_name,
            email: user.email,
          },
        })
      }
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'AbortError'
      if (isTimeout) {
        logWarning('Spotify /me request timed out', { component: 'auth.status', errorType: 'profile' })
      } else {
        logError(error, { component: 'auth.status', errorType: 'profile' })
      }
    }
  }

  // If we have refresh token but couldn't get user info, still consider authenticated
  if (refreshToken) {
    return NextResponse.json({
      authenticated: true,
      needsRefresh: true,
    })
  }

  return NextResponse.json({ authenticated: false })
})
