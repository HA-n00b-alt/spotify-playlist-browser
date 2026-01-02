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
        try {
          // Extract path and query from full URL
          const nextUrlObj: URL = new URL(data.next)
          nextUrl = nextUrlObj.pathname + nextUrlObj.search
        } catch (urlError) {
          console.error('Error parsing next URL:', data.next, urlError)
          // If URL parsing fails, try to continue with the next URL as-is (might be relative)
          nextUrl = data.next.startsWith('http') ? null : data.next
        }
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
  return cookieStore.get('access_token')?.value || null
}

async function refreshAccessToken(): Promise<string | null> {
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get('refresh_token')?.value

  if (!refreshToken) {
    return null
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return null
  }

  try {
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

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    const { access_token, expires_in } = data

    // Update the access token cookie
    const cookieStore = await cookies()
    cookieStore.set('access_token', access_token, {
      maxAge: expires_in || 3600,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    })

    return access_token
  } catch {
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

  const url = `https://api.spotify.com/v1${endpoint}`
  
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

  // Handle rate limiting (429) with retry logic
  if (response.status === 429) {
    if (retryCount >= maxRetries) {
      throw new Error('Rate limit exceeded: Maximum retries reached')
    }

    const retryAfter = response.headers.get('Retry-After')
    const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000 * (retryCount + 1)
    
    console.warn(`Rate limit hit (429). Retrying after ${waitTime}ms (attempt ${retryCount + 1}/${maxRetries})`)
    await new Promise((resolve) => setTimeout(resolve, waitTime))
    
    // Retry the request
    return makeSpotifyRequest<T>(endpoint, options, retryCount + 1)
  }

  // Handle token expiration (401) with retry logic
  if (response.status === 401) {
    if (retryCount >= maxRetries) {
      throw new Error('Unauthorized: Token refresh failed after maximum retries')
    }

    console.warn(`Token expired (401). Refreshing token (attempt ${retryCount + 1}/${maxRetries})`)
    accessToken = await refreshAccessToken()
    
    if (!accessToken) {
      throw new Error('Unauthorized: Failed to refresh access token')
    }
    
    // Retry the request with new token
    return makeSpotifyRequest<T>(endpoint, options, retryCount + 1)
  }

  if (!response.ok) {
    const error: SpotifyError = await response.json().catch(() => ({
      error: { status: response.status, message: response.statusText },
    }))
    throw new Error(
      error.error?.message || `Spotify API error: ${response.status} ${response.statusText}`
    )
  }

  return response.json()
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

export async function getAudioFeatures(trackIds: string[]): Promise<Record<string, any>> {
  // Spotify API allows up to 100 track IDs per request
  const batchSize = 100
  const featuresMap: Record<string, any> = {}

  console.log(`[DEBUG getAudioFeatures] Fetching audio features for ${trackIds.length} tracks`)

  for (let i = 0; i < trackIds.length; i += batchSize) {
    const batch = trackIds.slice(i, i + batchSize)
    const ids = batch.join(',')

    try {
      console.log(`[DEBUG getAudioFeatures] Batch ${Math.floor(i / batchSize) + 1}: Requesting features for ${batch.length} tracks`)
      console.log(`[DEBUG getAudioFeatures] Request URL: /audio-features?ids=${ids.substring(0, 100)}...`)
      
      const data = await makeSpotifyRequest<{
        audio_features: Array<{
          id: string
          tempo: number | null
          [key: string]: any
        } | null>
      }>(`/audio-features?ids=${ids}`)

      console.log(`[DEBUG getAudioFeatures] Batch ${Math.floor(i / batchSize) + 1}: Received ${data.audio_features?.length || 0} features`)
      console.log(`[DEBUG getAudioFeatures] Raw response structure:`, {
        hasAudioFeatures: !!data.audio_features,
        audioFeaturesLength: data.audio_features?.length,
        firstFeatureSample: data.audio_features?.[0] ? {
          id: data.audio_features[0]?.id,
          tempo: data.audio_features[0]?.tempo,
          isNull: data.audio_features[0] === null,
          keys: data.audio_features[0] ? Object.keys(data.audio_features[0]) : null
        } : null
      })

      if (data.audio_features) {
        let nullCount = 0
        let withTempoCount = 0
        let withoutTempoCount = 0
        
        data.audio_features.forEach((feature, index) => {
          if (feature && feature.id) {
            featuresMap[feature.id] = feature
            if (feature.tempo != null) {
              withTempoCount++
            } else {
              withoutTempoCount++
            }
            if (index < 3) {
              console.log(`[DEBUG getAudioFeatures] Sample feature ${index + 1}:`, {
                id: feature.id,
                tempo: feature.tempo,
                hasTempo: feature.tempo != null,
                allKeys: Object.keys(feature).slice(0, 10)
              })
            }
          } else if (feature === null) {
            nullCount++
            console.log(`[DEBUG getAudioFeatures] Null feature at index ${index} in batch ${Math.floor(i / batchSize) + 1}`)
          }
        })
        
        console.log(`[DEBUG getAudioFeatures] Batch ${Math.floor(i / batchSize) + 1} summary:`, {
          nullFeatures: nullCount,
          withTempo: withTempoCount,
          withoutTempo: withoutTempoCount,
          totalProcessed: nullCount + withTempoCount + withoutTempoCount
        })
      } else {
        console.log(`[DEBUG getAudioFeatures] No audio_features array in response`)
        console.log(`[DEBUG getAudioFeatures] Response keys:`, Object.keys(data))
      }
    } catch (error) {
      console.error(`[DEBUG getAudioFeatures] Error fetching audio features batch ${Math.floor(i / batchSize) + 1}:`, error)
      if (error instanceof Error) {
        console.error(`[DEBUG getAudioFeatures] Error message:`, error.message)
        console.error(`[DEBUG getAudioFeatures] Error stack:`, error.stack)
      }
      // Continue with other batches even if one fails
    }
  }

  console.log(`[DEBUG getAudioFeatures] Total features collected: ${Object.keys(featuresMap).length}`)
  return featuresMap
}

