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
    const data: {
      items: any[]
      next: string | null
    } = await makeSpotifyRequest<{
      items: any[]
      next: string | null
    }>(nextUrl)

    allPlaylists.push(...data.items)

    if (data.next) {
      // Extract the path from the full URL
      nextUrl = new URL(data.next).pathname + new URL(data.next).search
    } else {
      nextUrl = null
    }
  }

  return allPlaylists
}

export async function getPlaylistTracks(playlistId: string): Promise<any[]> {
  const allTracks: any[] = []
  let nextUrl: string | null = `/playlists/${playlistId}/tracks?limit=50`

  while (nextUrl) {
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

    if (data.next) {
      nextUrl = new URL(data.next).pathname + new URL(data.next).search
    } else {
      nextUrl = null
    }
  }

  return allTracks
}

