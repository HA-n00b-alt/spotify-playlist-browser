/**
 * Spotify refresh-token lifecycle helpers shared by lib/spotify.ts and the auth/health routes.
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
 * the dead token is then dropped on the next route handler or server action that refreshes.
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
