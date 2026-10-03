/**
 * Spotify token lifecycle helpers shared by lib/spotify.ts, middleware.ts and the auth/health routes.
 * Edge-safe: no Node-only imports, because middleware.ts runs in the Edge runtime.
 *
 * From 20 July 2026 Spotify user refresh tokens expire six months after issue. Refreshing with an
 * expired or revoked token returns HTTP 400 `{"error":"invalid_grant"}`; Spotify asks apps to
 * discard the stored token and send the user through sign-in again, without retrying.
 */

// Slightly under six months, so the cookie never outlives the token it holds.
export const REFRESH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 180

export function isInvalidGrant(status: number, body: string): boolean {
  if (status !== 400) return false
  try {
    return JSON.parse(body)?.error === 'invalid_grant'
  } catch {
    return false
  }
}

type WritableCookies = { delete(name: string): unknown }

/**
 * Deletes the Spotify token cookies. Returns false where cookies are read-only (Server Components);
 * the dead token is then dropped by middleware.ts or the next route handler that refreshes.
 */
export function clearSpotifyAuthCookies(cookieStore: WritableCookies): boolean {
  try {
    cookieStore.delete('refresh_token')
    cookieStore.delete('access_token')
    return true
  } catch {
    return false
  }
}

/**
 * Seconds the access_token cookie lives: Spotify's `expires_in` minus a margin, so the cookie is gone
 * (and middleware.ts refreshes before the page renders) before Spotify starts rejecting the token.
 */
export const ACCESS_TOKEN_EXPIRY_MARGIN_SECONDS = 5 * 60

export function accessTokenCookieMaxAge(expiresIn: number | undefined): number {
  const lifetime = expiresIn || 3600
  return Math.max(60, lifetime - ACCESS_TOKEN_EXPIRY_MARGIN_SECONDS)
}

export function spotifyTokenCookieOptions(maxAge: number) {
  return {
    maxAge,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  }
}

type TokenRefreshHttpFailure<R> = { ok: false; reason: R; status: number; statusText: string; errorText: string; durationMs: number }
type TokenRefreshException<R> = { ok: false; reason: R; error: unknown; durationMs: number }

export type TokenRefreshResult =
  | { ok: true; accessToken: string; expiresIn?: number; refreshToken?: string; status: number; durationMs: number }
  | TokenRefreshHttpFailure<'invalid_grant'>
  | TokenRefreshHttpFailure<'http_error'>
  | TokenRefreshException<'timeout'>
  | TokenRefreshException<'network'>

/**
 * Exchanges a refresh token for a new access token. Uses only fetch and btoa, so it runs both in
 * Node (lib/spotify.ts) and in the Edge runtime (middleware.ts). Never throws; never touches cookies.
 */
export async function requestTokenRefresh(
  refreshToken: string,
  credentials: { clientId: string; clientSecret: string },
  timeoutMs = 15_000
): Promise<TokenRefreshResult> {
  const start = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${credentials.clientId}:${credentials.clientSecret}`)}`,
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error')
      return {
        ok: false,
        reason: isInvalidGrant(response.status, errorText) ? ('invalid_grant' as const) : ('http_error' as const),
        status: response.status,
        statusText: response.statusText,
        errorText,
        durationMs: Date.now() - start,
      }
    }
    const data = await response.json()
    return {
      ok: true,
      accessToken: data.access_token,
      expiresIn: data.expires_in,
      refreshToken: data.refresh_token,
      status: response.status,
      durationMs: Date.now() - start,
    }
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError'
    const durationMs = Date.now() - start
    return isTimeout ? { ok: false, reason: 'timeout', error, durationMs } : { ok: false, reason: 'network', error, durationMs }
  } finally {
    clearTimeout(timeoutId)
  }
}
