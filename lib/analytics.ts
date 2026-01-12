import { query } from './db'
import { logError, logInfo } from './logger'

/**
 * Track a pageview for a user
 * This should be called asynchronously (fire and forget) to avoid blocking
 */
export async function trackPageview(spotifyUserId: string | null, path: string): Promise<void> {
  if (!spotifyUserId) {
    return // Don't track anonymous users
  }

  try {
    // Update or insert user record
    await query(
      `INSERT INTO analytics_users (spotify_user_id, last_seen_at, total_pageviews)
       VALUES ($1, NOW(), 1)
       ON CONFLICT (spotify_user_id) 
       DO UPDATE SET 
         last_seen_at = NOW(),
         total_pageviews = analytics_users.total_pageviews + 1`,
      [spotifyUserId]
    )

    // Insert pageview record
    await query(
      `INSERT INTO analytics_pageviews (spotify_user_id, path, created_at)
       VALUES ($1, $2, NOW())`,
      [spotifyUserId, path]
    )
  } catch (error) {
    // Silently fail analytics tracking to avoid breaking the app
    logError(error, { component: 'analytics.trackPageview' })
  }
}

/**
 * Track an API request
 * This should be called asynchronously (fire and forget) to avoid blocking
 */
export async function trackApiRequest(
  spotifyUserId: string | null,
  endpoint: string,
  method: string,
  statusCode?: number
): Promise<void> {
  try {
    if (spotifyUserId) {
      // Update user's API request count
      await query(
        `INSERT INTO analytics_users (spotify_user_id, last_seen_at, total_api_requests)
         VALUES ($1, NOW(), 1)
         ON CONFLICT (spotify_user_id) 
         DO UPDATE SET 
           last_seen_at = NOW(),
           total_api_requests = analytics_users.total_api_requests + 1`,
        [spotifyUserId]
      )
    }

    // Insert API request record
    await query(
      `INSERT INTO analytics_api_requests (spotify_user_id, endpoint, method, status_code, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [spotifyUserId, endpoint, method, statusCode || null]
    )
  } catch (error) {
    // Silently fail analytics tracking to avoid breaking the app
    logError(error, { component: 'analytics.trackApiRequest' })
  }
}

/**
 * Get current user's Spotify ID from cookies
 * Returns null if not authenticated
 */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('access_token')?.value

    if (!accessToken) {
      return null
    }

    // Fetch user info from Spotify
    const start = Date.now()
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    const durationMs = Date.now() - start

    if (!response.ok) {
      logInfo('Spotify profile lookup failed', {
        component: 'analytics.getCurrentUserId',
        status: response.status,
        durationMs,
      })
      return null
    }

    const user = await response.json()
    logInfo('Spotify profile lookup completed', {
      component: 'analytics.getCurrentUserId',
      status: response.status,
      durationMs,
    })
    return user.id || null
  } catch (error) {
    logError(error, { component: 'analytics.getCurrentUserId' })
    return null
  }
}

export async function getCurrentUserProfile(): Promise<{
  id: string
  display_name: string | null
  email: string | null
} | null> {
  try {
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('access_token')?.value

    if (!accessToken) {
      return null
    }

    const start = Date.now()
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    const durationMs = Date.now() - start

    if (!response.ok) {
      logInfo('Spotify profile lookup failed', {
        component: 'analytics.getCurrentUserProfile',
        status: response.status,
        durationMs,
      })
      return null
    }

    const user = await response.json()
    logInfo('Spotify profile lookup completed', {
      component: 'analytics.getCurrentUserProfile',
      status: response.status,
      durationMs,
    })
    return {
      id: user.id,
      display_name: user.display_name || null,
      email: user.email || null,
    }
  } catch (error) {
    logError(error, { component: 'analytics.getCurrentUserProfile' })
    return null
  }
}

/**
 * Check if the current user is the admin (delman-it)
 */
export async function isAdminUser(): Promise<boolean> {
  const userId = await getCurrentUserId()
  if (!userId) {
    return false
  }

  try {
    const rows = await query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM admin_users WHERE spotify_user_id = $1 AND active = true) AS exists',
      [userId]
    )
    return rows[0]?.exists === true
  } catch (error) {
    logError(error, { component: 'analytics.isAdminUser' })
    return false
  }
}

export async function isSuperAdminUser(): Promise<boolean> {
  const userId = await getCurrentUserId()
  if (!userId) {
    return false
  }

  try {
    const rows = await query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM admin_users WHERE spotify_user_id = $1 AND active = true AND is_super_admin = true) AS exists',
      [userId]
    )
    return rows[0]?.exists === true
  } catch (error) {
    logError(error, { component: 'analytics.isSuperAdminUser' })
    return false
  }
}
