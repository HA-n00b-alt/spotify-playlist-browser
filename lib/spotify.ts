import { cookies } from 'next/headers'

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
      console.error(`Error fetching page ${pageCount + 1}:`, error)
      // If we have some items, return them; otherwise throw
      if (allItems.length === 0) {
        throw error
      }
      // Break on error but return what we have
      console.warn(`Returning ${allItems.length} items after error on page ${pageCount + 1}`)
      break
    }
  }

  return allItems
}

async function getAccessToken(): Promise<string | null> {
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
    console.warn('[Spotify API DEBUG] refreshAccessToken: No refresh token available')
    return null
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('[Spotify API DEBUG] refreshAccessToken: Missing client credentials')
    return null
  }

  try {
    // TEMPORARY DEBUG
    console.log('[Spotify API DEBUG] refreshAccessToken: Attempting token refresh')
    
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

    // TEMPORARY DEBUG
    console.log('[Spotify API DEBUG] refreshAccessToken Response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error')
      console.error('[Spotify API DEBUG] refreshAccessToken Failed:', errorText)
      return null
    }

    const data = await response.json()
    const { access_token, expires_in, refresh_token: newRefreshToken } = data

    // TEMPORARY DEBUG
    console.log('[Spotify API DEBUG] refreshAccessToken Success:', {
      hasAccessToken: !!access_token,
      expiresIn: expires_in,
      hasNewRefreshToken: !!newRefreshToken,
      accessTokenPrefix: access_token ? `${access_token.substring(0, 20)}...` : 'none',
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
    console.error('[Spotify API DEBUG] refreshAccessToken Exception:', error)
    return null
  }
}

async function makeSpotifyRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  retryCount = 0
): Promise<T> {
  const maxRetries = 3
  let accessToken = await getAccessToken()

  if (!accessToken) {
    accessToken = await refreshAccessToken()
    if (!accessToken) {
      throw new Error('Unauthorized')
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

  // Handle rate limiting (429) with retry logic
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After')
    const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : 0
    
    if (retryCount >= maxRetries) {
      console.error('[Spotify API DEBUG] Rate limit exceeded: Maximum retries reached', {
        endpoint,
        retryCount,
        maxRetries,
        retryAfter: retryAfterSeconds,
      })
      // Include retryAfter in error message for rate-limit page
      throw new Error(`Rate limit exceeded: Maximum retries reached. retryAfter: ${retryAfterSeconds}`)
    }

    const waitTime = retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 1000 * (retryCount + 1)
    
    console.warn('[Spotify API DEBUG] Rate limit hit (429). Retrying:', {
      endpoint,
      retryAfter: retryAfterSeconds,
      waitTime,
      attempt: retryCount + 1,
      maxRetries,
    })
    await new Promise((resolve) => setTimeout(resolve, waitTime))
    
    // Retry the request
    return makeSpotifyRequest<T>(endpoint, options, retryCount + 1)
  }

  // Handle token expiration (401) with retry logic
  if (response.status === 401) {
    if (retryCount >= maxRetries) {
      console.error('[Spotify API DEBUG] Token refresh failed: Maximum retries reached', {
        endpoint,
        retryCount,
        maxRetries,
      })
      throw new Error('Unauthorized: Token refresh failed after maximum retries')
    }

    console.warn('[Spotify API DEBUG] Token expired (401). Refreshing token:', {
      endpoint,
      attempt: retryCount + 1,
      maxRetries,
    })
    accessToken = await refreshAccessToken()
    
    if (!accessToken) {
      console.error('[Spotify API DEBUG] Token refresh failed - no access token returned')
      throw new Error('Unauthorized: Failed to refresh access token')
    }
    
    console.log('[Spotify API DEBUG] Token refreshed successfully, retrying request')
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
      console.error('[Spotify API DEBUG] 403 Forbidden - Failed to read response:', e)
    }
    
    console.error('[Spotify API] 403 Forbidden:', errorMessage)
    throw new Error(`Forbidden: ${errorMessage}`)
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
      console.error('[Spotify API DEBUG] Error - Failed to read response:', e)
    }
    
    throw new Error(
      errorBody.error?.message || `Spotify API error: ${response.status} ${response.statusText}`
    )
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

export async function getPlaylist(playlistId: string): Promise<any> {
  return await makeSpotifyRequest<any>(`/playlists/${playlistId}`)
}

export async function getTrack(trackId: string): Promise<any> {
  return await makeSpotifyRequest<any>(`/tracks/${trackId}`)
}

export async function getPlaylistTracks(playlistId: string): Promise<any[]> {
  // Use pagination helper to fetch all tracks
  const allItems = await paginateSpotify<{
    added_at: string
    track: any
  }>(`/playlists/${playlistId}/tracks?limit=50`)

  // Map items to include added_at with track data
  const tracksWithMetadata = allItems
    .filter((item) => item.track) // Filter out null tracks
    .map((item) => ({
      ...item.track,
      added_at: item.added_at,
    }))

  return tracksWithMetadata
}

