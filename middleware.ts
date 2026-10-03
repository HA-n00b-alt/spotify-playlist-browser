import { NextResponse, type NextRequest } from 'next/server'
import {
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  accessTokenCookieMaxAge,
  requestTokenRefresh,
  spotifyTokenCookieOptions,
} from '@/lib/spotifyAuth'

/**
 * Refreshes the Spotify access token before a server-rendered page reads it (#12).
 *
 * Server Components cannot write cookies, so a refresh during render cannot be stored. When the
 * access_token cookie has expired but a refresh_token is present, refresh here, where cookies can
 * be written: the new tokens go to the browser (response cookies) and to this request's render
 * (request cookies), so the page itself stays read-only. Edge runtime: lib/spotifyAuth only.
 */
export async function middleware(request: NextRequest) {
  const refreshToken = request.cookies.get('refresh_token')?.value
  if (request.cookies.get('access_token')?.value || !refreshToken) {
    return NextResponse.next()
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.next()
  }

  const result = await requestTokenRefresh(refreshToken, { clientId, clientSecret })

  if (result.ok) {
    request.cookies.set('access_token', result.accessToken)
    if (result.refreshToken) request.cookies.set('refresh_token', result.refreshToken)
    const response = NextResponse.next({ request: { headers: request.headers } })
    response.cookies.set(
      'access_token',
      result.accessToken,
      spotifyTokenCookieOptions(accessTokenCookieMaxAge(result.expiresIn))
    )
    if (result.refreshToken) {
      response.cookies.set('refresh_token', result.refreshToken, spotifyTokenCookieOptions(REFRESH_TOKEN_MAX_AGE_SECONDS))
    }
    return response
  }

  if (result.reason === 'invalid_grant') {
    // Expired or revoked refresh token: drop it so the page treats the user as signed out.
    request.cookies.delete('refresh_token')
    const response = NextResponse.next({ request: { headers: request.headers } })
    response.cookies.delete('refresh_token')
    response.cookies.delete('access_token')
    console.warn('[middleware] Refresh token rejected (invalid_grant); user must sign in again')
    return response
  }

  // Transient failure: let the page try its own refresh for this render.
  console.warn('[middleware] Spotify token refresh failed', {
    reason: result.reason,
    status: 'status' in result ? result.status : undefined,
  })
  return NextResponse.next()
}

// Pages that call Spotify while rendering. API routes refresh on their own (route handlers can write cookies).
export const config = {
  matcher: ['/playlists/:path*', '/admin/:path*', '/stats'],
}
