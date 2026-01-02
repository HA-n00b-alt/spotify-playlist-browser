import { cookies } from 'next/headers'

interface SpotifyError {
  error: {
    status: number
    message: string
  }
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
  options: RequestInit = {}
): Promise<T> {
  let accessToken = await getAccessToken()

  if (!accessToken) {
    accessToken = await refreshAccessToken()
    if (!accessToken) {
      throw new Error('Unauthorized')
    }
  }

  const url = `https://api.spotify.com/v1${endpoint}`
  let response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  // Handle rate limiting (429)
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After')
    const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000
    await new Promise((resolve) => setTimeout(resolve, waitTime))
    response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  }

  // Handle token expiration
  if (response.status === 401) {
    accessToken = await refreshAccessToken()
    if (!accessToken) {
      throw new Error('Unauthorized')
    }
    response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  }

  if (!response.ok) {
    const error: SpotifyError = await response.json().catch(() => ({
      error: { status: response.status, message: response.statusText },
    }))
    throw new Error(
      error.error?.message || `Spotify API error: ${response.status}`
    )
  }

  return response.json()
}

export async function getPlaylists(): Promise<any[]> {
  const allPlaylists: any[] = []
  let nextUrl: string | null = '/me/playlists?limit=50'

  while (nextUrl) {
    try {
      const data: {
        items: any[]
        next: string | null
      } = await makeSpotifyRequest<{
        items: any[]
        next: string | null
      }>(nextUrl)

      // For each playlist, fetch full details to get followers if not present
      const playlistsWithFollowers = await Promise.all(
        data.items.map(async (playlist) => {
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

      allPlaylists.push(...playlistsWithFollowers)

      if (data.next) {
        // Extract the path from the full URL
        nextUrl = new URL(data.next).pathname + new URL(data.next).search
      } else {
        nextUrl = null
      }
    } catch (error) {
      console.error('Error fetching playlists page:', error)
      // Break on error to avoid infinite loop
      break
    }
  }

  return allPlaylists
}

export async function getPlaylistTracks(playlistId: string): Promise<any[]> {
  const allTracks: any[] = []
  let nextUrl: string | null = `/playlists/${playlistId}/tracks?limit=50`
  let pageCount = 0
  const maxPages = 200 // Safety limit to prevent infinite loops

  while (nextUrl && pageCount < maxPages) {
    try {
      const data: {
        items: Array<{
          added_at: string
          track: any
        }>
        next: string | null
      } = await makeSpotifyRequest<{
        items: Array<{
          added_at: string
          track: any
        }>
        next: string | null
      }>(nextUrl)

      // Map items to include added_at with track data
      const tracksWithMetadata = data.items
        .filter((item) => item.track) // Filter out null tracks
        .map((item) => ({
          ...item.track,
          added_at: item.added_at,
        }))

      allTracks.push(...tracksWithMetadata)
      pageCount++

      if (data.next) {
        try {
          // Extract path and query from full URL
          const nextUrlObj = new URL(data.next)
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
      console.error(`Error fetching tracks page ${pageCount + 1}:`, error)
      // If we have some tracks, return them; otherwise throw
      if (allTracks.length === 0) {
        throw error
      }
      // Break on error but return what we have
      console.warn(`Returning ${allTracks.length} tracks after error on page ${pageCount + 1}`)
      break
    }
  }

  return allTracks
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
      const data = await makeSpotifyRequest<{
        audio_features: Array<{
          id: string
          tempo: number | null
          [key: string]: any
        } | null>
      }>(`/audio-features?ids=${ids}`)

      console.log(`[DEBUG getAudioFeatures] Batch ${Math.floor(i / batchSize) + 1}: Received ${data.audio_features?.length || 0} features`)

      if (data.audio_features) {
        data.audio_features.forEach((feature, index) => {
          if (feature && feature.id) {
            featuresMap[feature.id] = feature
            if (index < 3) {
              console.log(`[DEBUG getAudioFeatures] Sample feature ${index + 1}:`, {
                id: feature.id,
                tempo: feature.tempo,
                hasTempo: feature.tempo != null
              })
            }
          } else if (feature === null) {
            console.log(`[DEBUG getAudioFeatures] Null feature at index ${index} in batch ${Math.floor(i / batchSize) + 1}`)
          }
        })
      } else {
        console.log(`[DEBUG getAudioFeatures] No audio_features array in response`)
      }
    } catch (error) {
      console.error(`[DEBUG getAudioFeatures] Error fetching audio features batch ${Math.floor(i / batchSize) + 1}:`, error)
      // Continue with other batches even if one fails
    }
  }

  console.log(`[DEBUG getAudioFeatures] Total features collected: ${Object.keys(featuresMap).length}`)
  return featuresMap
}

