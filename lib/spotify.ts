import { cookies } from 'next/headers'
import { query } from './db'
import { 
  AuthenticationError, 
  RateLimitError, 
  NetworkError,
  SpotifyAPIError,
  createErrorFromResponse 
} from './errors'
import { logError, logWarning, logInfo } from './logger'

interface SpotifyError {
  error: {
    status: number
    message: string
  }
}

/**
 * Spotify paginated response type
 */
interface SpotifyPagedResponse<T> {
  items: T[]
  next: string | null
  previous?: string | null
  limit?: number
  offset?: number
  total?: number
}

/**
 * Options for pagination helper
 */
interface PaginationOptions {
  maxPages?: number
  onPageFetched?: (page: number, items: any[]) => void
}

/**
 * Helper function to paginate through Spotify API responses
 * Automatically handles pagination and collects all items
 */
async function paginateSpotify<T>(
  initialUrl: string,
  options: PaginationOptions = {}
): Promise<T[]> {
  const { maxPages = 200, onPageFetched } = options
  const allItems: T[] = []
  let nextUrl: string | null = initialUrl
  let pageCount = 0

  while (nextUrl && pageCount < maxPages) {
    try {
      const data: SpotifyPagedResponse<T> = await makeSpotifyRequest<SpotifyPagedResponse<T>>(nextUrl)
      
      allItems.push(...data.items)
      pageCount++

      if (onPageFetched) {
        onPageFetched(pageCount, data.items)
      }

      if (data.next) {
        // Spotify returns full URLs in the 'next' field, use them directly
        // makeSpotifyRequest now handles both full URLs and relative endpoints
        nextUrl = data.next
      } else {
        nextUrl = null
      }
    } catch (error) {
      logError(error, {
        component: 'spotify.paginateSpotify',
        initialUrl,
        pageCount: pageCount + 1,
        itemsCollected: allItems.length,
      })
      // If we have some items, return them; otherwise throw
      if (allItems.length === 0) {
        throw error
      }
      // Break on error but return what we have
      logWarning(`Returning ${allItems.length} items after error on page ${pageCount + 1}`, {
        component: 'spotify.paginateSpotify',
        initialUrl,
        pageCount: pageCount + 1,
        itemsCollected: allItems.length,
      })
      break
    }
  }

  return allItems
}

export async function getAccessToken(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('access_token')?.value || null
  // TEMPORARY DEBUG
  console.log('[Spotify API DEBUG] getAccessToken:', {
    hasToken: !!token,
    tokenPrefix: token ? `${token.substring(0, 20)}...` : 'none',
  })
  return token
}

async function refreshAccessToken(): Promise<string | null> {
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get('refresh_token')?.value

  // TEMPORARY DEBUG
  console.log('[Spotify API DEBUG] refreshAccessToken:', {
    hasRefreshToken: !!refreshToken,
    refreshTokenPrefix: refreshToken ? `${refreshToken.substring(0, 20)}...` : 'none',
  })

  if (!refreshToken) {
    logWarning('No refresh token available', {
      component: 'spotify.refreshAccessToken',
    })
    return null
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    const error = new Error('Missing Spotify client credentials')
    logError(error, {
      component: 'spotify.refreshAccessToken',
      env: {
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
      },
    })
    return null
  }

  try {
    logInfo('Attempting token refresh', {
      component: 'spotify.refreshAccessToken',
      hasRefreshToken: !!refreshToken,
    })
    
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    logInfo('Token refresh response received', {
      component: 'spotify.refreshAccessToken',
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error')
      const error = new Error(`Token refresh failed: ${response.status} ${response.statusText}`)
      logError(error, {
        component: 'spotify.refreshAccessToken',
        status: response.status,
        statusText: response.statusText,
        errorText: errorText.substring(0, 500),
      })
      return null
    }

    const data = await response.json()
    const { access_token, expires_in, refresh_token: newRefreshToken } = data

    logInfo('Token refresh successful', {
      component: 'spotify.refreshAccessToken',
      hasAccessToken: !!access_token,
      expiresIn: expires_in,
      hasNewRefreshToken: !!newRefreshToken,
    })

    // Update the access token cookie
    const cookieStore = await cookies()
    cookieStore.set('access_token', access_token, {
      maxAge: expires_in || 3600,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    })

    // Update refresh token if a new one was provided
    if (newRefreshToken) {
      cookieStore.set('refresh_token', newRefreshToken, {
        maxAge: 60 * 60 * 24 * 365, // 1 year
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      })
    }

    return access_token
  } catch (error) {
    logError(error, {
      component: 'spotify.refreshAccessToken',
      errorType: 'Exception',
    })
    return null
  }
}

export async function makeSpotifyRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  retryCount = 0
): Promise<T> {
  const maxRetries = 3
  let accessToken = await getAccessToken()

  if (!accessToken) {
    accessToken = await refreshAccessToken()
    if (!accessToken) {
      const error = new AuthenticationError('No access token available. Please log in again.')
      logError(error, {
        component: 'spotify.makeSpotifyRequest',
        endpoint,
        retryCount,
        errorType: 'AuthenticationError',
      })
      throw error
    }
  }

  // Handle full URLs (from pagination) vs relative endpoints
  const url = endpoint.startsWith('http') 
    ? endpoint 
    : `https://api.spotify.com/v1${endpoint}`
  
  // TEMPORARY DEBUG: Log request details
  const requestMethod = options.method || 'GET'
  console.log('[Spotify API DEBUG] Request:', {
    method: requestMethod,
    endpoint,
    url,
    retryCount,
    hasToken: !!accessToken,
    tokenPrefix: accessToken ? `${accessToken.substring(0, 20)}...` : 'none',
  })
  
  const makeRequest = async (token: string): Promise<Response> => {
    return fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  }

  let response = await makeRequest(accessToken)
  
  // TEMPORARY DEBUG: Log response details
  const responseHeaders: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value
  })
  
  console.log('[Spotify API DEBUG] Response:', {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    headers: responseHeaders,
    url: response.url,
  })

  // Handle rate limiting (429) - wait for Retry-After before retrying
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After')
    const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : 0
    
    logWarning('Rate limit hit (429)', {
      component: 'spotify.makeSpotifyRequest',
      endpoint,
      retryAfter: retryAfterSeconds,
      retryCount,
      maxRetries,
    })
    
    // If we haven't exceeded max retries, wait and retry
    if (retryCount < maxRetries && retryAfterSeconds > 0) {
      const waitTime = retryAfterSeconds * 1000 // Convert to milliseconds
      logInfo(`Waiting ${retryAfterSeconds} seconds before retry`, {
        component: 'spotify.makeSpotifyRequest',
        endpoint,
        retryAfter: retryAfterSeconds,
      })
      await new Promise(resolve => setTimeout(resolve, waitTime))
      
      // Retry the request after waiting
      logInfo('Retrying request after rate limit wait', {
        component: 'spotify.makeSpotifyRequest',
        endpoint,
        retryCount: retryCount + 1,
      })
      return makeSpotifyRequest<T>(endpoint, options, retryCount + 1)
    }
    
    // If we've exceeded retries or no Retry-After header, throw error
    const error = new RateLimitError(
      'Rate limit exceeded. Please try again later.',
      retryAfterSeconds > 0 ? retryAfterSeconds : null
    )
    logError(error, {
      component: 'spotify.makeSpotifyRequest',
      endpoint,
      retryCount,
      maxRetries,
      retryAfter: retryAfterSeconds,
      errorType: 'RateLimitError',
    })
    throw error
  }

  // Handle token expiration (401) with retry logic
  if (response.status === 401) {
    if (retryCount >= maxRetries) {
      const error = new AuthenticationError('Token refresh failed after maximum retries')
      logError(error, {
        component: 'spotify.makeSpotifyRequest',
        endpoint,
        retryCount,
        maxRetries,
        status: 401,
        errorType: 'AuthenticationError',
      })
      throw error
    }

    logWarning('Token expired (401). Refreshing token', {
      component: 'spotify.makeSpotifyRequest',
      endpoint,
      attempt: retryCount + 1,
      maxRetries,
    })
    accessToken = await refreshAccessToken()
    
    if (!accessToken) {
      const error = new AuthenticationError('Failed to refresh access token. Please log in again.')
      logError(error, {
        component: 'spotify.makeSpotifyRequest',
        endpoint,
        retryCount,
        status: 401,
        errorType: 'AuthenticationError',
      })
      throw error
    }
    
    logInfo('Token refreshed successfully, retrying request', {
      component: 'spotify.makeSpotifyRequest',
      endpoint,
      retryCount: retryCount + 1,
    })
    // Retry the request with new token
    return makeSpotifyRequest<T>(endpoint, options, retryCount + 1)
  }

  // Handle forbidden (403) - insufficient permissions or scopes
  if (response.status === 403) {
    let errorMessage = 'Insufficient permissions. Please ensure the app has access to your playlists.'
    let errorBody: any = null
    let responseText = ''
    
    try {
      // Try to get response as text first to see what we're dealing with
      responseText = await response.clone().text()
      // TEMPORARY DEBUG: Log raw response
      console.error('[Spotify API DEBUG] 403 Forbidden - Raw Response Text:', responseText.substring(0, 500))
      
      // Try to parse as JSON
      try {
        errorBody = JSON.parse(responseText)
        // TEMPORARY DEBUG: Log parsed JSON error response
        console.error('[Spotify API DEBUG] 403 Forbidden - Parsed JSON Response:', JSON.stringify(errorBody, null, 2))
        if (errorBody.error?.message && errorBody.error.message !== 'Forbidden') {
          errorMessage = errorBody.error.message
        }
      } catch (jsonError) {
        // Not JSON, try to extract meaningful message from HTML/text
        console.error('[Spotify API DEBUG] 403 Forbidden - Response is not JSON, trying to extract message from text')
        
        // Try to find error message in HTML/text response
        const htmlMatch = responseText.match(/<title[^>]*>([^<]+)<\/title>/i) || 
                         responseText.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                         responseText.match(/<p[^>]*>([^<]+)<\/p>/i)
        
        if (htmlMatch && htmlMatch[1]) {
          errorMessage = htmlMatch[1].trim()
        } else if (responseText.length > 0 && responseText.length < 200) {
          // If it's short text (not HTML), use it directly
          errorMessage = responseText.trim()
        }
      }
    } catch (e) {
      // If text parsing fails, use default message
      logError(e, {
        component: 'spotify.makeSpotifyRequest',
        endpoint,
        status: 403,
        errorType: 'Forbidden',
        action: 'parsing_error',
      })
    }
    
    const error = new Error(`Forbidden: ${errorMessage}`)
    logError(error, {
      component: 'spotify.makeSpotifyRequest',
      endpoint,
      status: 403,
      errorType: 'Forbidden',
      errorMessage,
    })
    throw error
  }

  if (!response.ok) {
    let errorBody: any = null
    let responseText = ''
    
    try {
      // Try to get response as text first
      responseText = await response.clone().text()
      // TEMPORARY DEBUG: Log raw response
      console.error('[Spotify API DEBUG] Error Response - Raw Text:', responseText.substring(0, 500))
      
      // Try to parse as JSON
      try {
        errorBody = JSON.parse(responseText)
        // TEMPORARY DEBUG: Log parsed JSON error response
        console.error('[Spotify API DEBUG] Error Response - Parsed JSON:', {
          status: response.status,
          statusText: response.statusText,
          body: JSON.stringify(errorBody, null, 2),
        })
      } catch (jsonError) {
        // Not JSON, create error object from text
        console.error('[Spotify API DEBUG] Error Response - Not JSON, using text as message')
        errorBody = { 
          error: { 
            status: response.status, 
            message: responseText.length > 0 && responseText.length < 200 
              ? responseText.trim() 
              : response.statusText 
          } 
        }
      }
    } catch (e) {
      errorBody = { error: { status: response.status, message: response.statusText } }
      logError(e, {
        component: 'spotify.makeSpotifyRequest',
        endpoint,
        status: response.status,
        errorType: 'SpotifyAPIError',
        action: 'reading_response',
      })
    }
    
    const errorMessage = errorBody.error?.message || `Spotify API error: ${response.status} ${response.statusText}`
    const error = new Error(errorMessage)
    logError(error, {
      component: 'spotify.makeSpotifyRequest',
      endpoint,
      status: response.status,
      statusText: response.statusText,
      errorType: 'SpotifyAPIError',
      errorBody: errorBody.error,
    })
    throw error
  }

  // TEMPORARY DEBUG: Log successful response (first 500 chars to avoid huge logs)
  const responseData = await response.json()
  const responsePreview = JSON.stringify(responseData, null, 2).substring(0, 500)
  console.log('[Spotify API DEBUG] Success Response Preview:', {
    length: JSON.stringify(responseData).length,
    preview: responsePreview + (JSON.stringify(responseData).length > 500 ? '...' : ''),
  })
  
  return responseData as T
}

export async function getPlaylists(): Promise<any[]> {
  // Use pagination helper to fetch all playlists
  const allPlaylists = await paginateSpotify<any>('/me/playlists?limit=50')

  // For each playlist, fetch full details to get followers if not present
  const playlistsWithFollowers = await Promise.all(
    allPlaylists.map(async (playlist) => {
      // If followers is missing, try to get it from the full playlist endpoint
      if (!playlist.followers) {
        try {
          const fullPlaylist = await makeSpotifyRequest<any>(
            `/playlists/${playlist.id}?fields=followers`
          )
          if (fullPlaylist.followers) {
            playlist.followers = fullPlaylist.followers
          }
        } catch (error) {
          // If fetching fails, continue without followers
          console.error(`Error fetching followers for playlist ${playlist.id}:`, error)
        }
      }
      return playlist
    })
  )

  return playlistsWithFollowers
}

interface PlaylistCacheRecord {
  id: number
  playlist_id: string
  snapshot_id: string
  playlist_data: any
  tracks_data: any
  cached_at: Date
  updated_at: Date
}

/**
 * Check if playlist is cached and matches current snapshot_id
 */
async function getCachedPlaylist(playlistId: string): Promise<{
  playlist: any
  tracks: any[]
  snapshotId: string
} | null> {
  try {
    const results = await query<PlaylistCacheRecord>(
      `SELECT playlist_id, snapshot_id, playlist_data, tracks_data 
       FROM playlist_cache 
       WHERE playlist_id = $1`,
      [playlistId]
    )
    
    if (results.length > 0) {
      const cached = results[0]
      return {
        playlist: cached.playlist_data,
        tracks: cached.tracks_data,
        snapshotId: cached.snapshot_id,
      }
    }
    return null
  } catch (error) {
    console.error('[Spotify Cache] Error fetching cached playlist:', error)
    return null
  }
}

/**
 * Store playlist in cache
 */
async function cachePlaylist(
  playlistId: string,
  snapshotId: string,
  playlistData: any,
  tracksData: any[]
): Promise<void> {
  try {
    await query(
      `INSERT INTO playlist_cache (playlist_id, snapshot_id, playlist_data, tracks_data, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
       ON CONFLICT (playlist_id) DO UPDATE SET
         snapshot_id = EXCLUDED.snapshot_id,
         playlist_data = EXCLUDED.playlist_data,
         tracks_data = EXCLUDED.tracks_data,
         updated_at = NOW()`,
      [playlistId, snapshotId, JSON.stringify(playlistData), JSON.stringify(tracksData)]
    )
    console.log(`[Spotify Cache] Cached playlist ${playlistId} with snapshot ${snapshotId}`)
  } catch (error) {
    console.error('[Spotify Cache] Error caching playlist:', error)
    // Don't throw - caching is optional
  }
}

export async function getPlaylist(playlistId: string, useCache = true): Promise<any> {
  // Check cache first if enabled
  if (useCache) {
    const cached = await getCachedPlaylist(playlistId)
    if (cached) {
      // Verify snapshot_id is still current by making a minimal API call
      try {
        // Create a temporary request function that doesn't use cache for verification
        const currentPlaylist = await makeSpotifyRequest<any>(`/playlists/${playlistId}?fields=snapshot_id`)
        if (currentPlaylist.snapshot_id === cached.snapshotId) {
          console.log(`[Spotify Cache] Using cached playlist ${playlistId} (snapshot matches)`)
          return cached.playlist
        } else {
          console.log(`[Spotify Cache] Playlist ${playlistId} snapshot changed, fetching fresh data`)
        }
      } catch (error) {
        // If API call fails, use cached data as fallback
        console.warn(`[Spotify Cache] Failed to verify snapshot, using cached data:`, error)
        return cached.playlist
      }
    }
  }
  
  // Fetch fresh data from API
  const playlist = await makeSpotifyRequest<any>(`/playlists/${playlistId}`)
  
  // Cache the result if we have a snapshot_id (only if useCache is true)
  if (playlist.snapshot_id && useCache) {
    // Fetch tracks separately to cache them too (don't use cache when fetching for caching)
    const tracks = await getPlaylistTracksInternal(playlistId)
    await cachePlaylist(playlistId, playlist.snapshot_id, playlist, tracks)
  }
  
  return playlist
}

/**
 * Internal function to fetch tracks without cache check (used when caching)
 */
async function getPlaylistTracksInternal(playlistId: string): Promise<any[]> {
  const allItems = await paginateSpotify<{
    added_at: string
    track: any
  }>(`/playlists/${playlistId}/tracks?limit=50`)

  const tracksWithMetadata = allItems
    .filter((item) => item.track)
    .map((item) => ({
      ...item.track,
      added_at: item.added_at,
    }))

  return tracksWithMetadata
}

export async function getTrack(trackId: string): Promise<any> {
  return await makeSpotifyRequest<any>(`/tracks/${trackId}`)
}

export async function getPlaylistTracks(playlistId: string, useCache = true): Promise<any[]> {
  // Check cache first if enabled
  if (useCache) {
    const cached = await getCachedPlaylist(playlistId)
    if (cached) {
      // Verify snapshot_id is still current
      try {
        const currentPlaylist = await makeSpotifyRequest<any>(`/playlists/${playlistId}?fields=snapshot_id`)
        if (currentPlaylist.snapshot_id === cached.snapshotId) {
          console.log(`[Spotify Cache] Using cached tracks for playlist ${playlistId}`)
          return cached.tracks
        } else {
          console.log(`[Spotify Cache] Playlist ${playlistId} snapshot changed, fetching fresh tracks`)
        }
      } catch (error) {
        // If API call fails, use cached data as fallback
        console.warn(`[Spotify Cache] Failed to verify snapshot, using cached tracks:`, error)
        return cached.tracks
      }
    }
  }
  
  // Fetch fresh tracks
  return await getPlaylistTracksInternal(playlistId)
}
