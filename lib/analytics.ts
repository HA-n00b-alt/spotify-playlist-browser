import { query } from './db'

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
    console.error('[Analytics] Error tracking pageview:', error)
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
    console.error('[Analytics] Error tracking API request:', error)
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
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      return null
    }

    const user = await response.json()
    return user.id || null
  } catch (error) {
    console.error('[Analytics] Error getting user ID:', error)
    return null
  }
}

/**
 * Check if the current user is the admin (delman-it)
 */
export async function isAdminUser(): Promise<boolean> {
  const userId = await getCurrentUserId()
  return userId === 'delman-it'
}



