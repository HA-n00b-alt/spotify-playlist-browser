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
import { incrementExternalApiUsage } from './externalApiUsage'
import { hasMusoApiKey, searchTracksByKeyword } from './muso'

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
  return token
}

async function refreshAccessToken(): Promise<string | null> {
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get('refresh_token')?.value

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

  const REFRESH_TIMEOUT_MS = 15_000
  try {
    logInfo('Attempting token refresh', {
      component: 'spotify.refreshAccessToken',
      hasRefreshToken: !!refreshToken,
    })
    
    const start = Date.now()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS)
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })
    clearTimeout(timeoutId)
    const durationMs = Date.now() - start

    logInfo('Token refresh response received', {
      component: 'spotify.refreshAccessToken',
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      durationMs,
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
    const isTimeout = error instanceof Error && error.name === 'AbortError'
    if (isTimeout) {
      logWarning('Token refresh timed out', {
        component: 'spotify.refreshAccessToken',
        errorType: 'Timeout',
      })
    } else {
      logError(error, {
        component: 'spotify.refreshAccessToken',
        errorType: 'Exception',
      })
    }
    return null
  }
}

const SPOTIFY_REQUEST_TIMEOUT_MS = 25_000

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
  
  const makeRequest = async (token: string): Promise<Response> => {
    const start = Date.now()
    const controller = new AbortController()
    const timeoutId = options.signal ? undefined : setTimeout(() => controller.abort(), SPOTIFY_REQUEST_TIMEOUT_MS)
    const signal = options.signal ?? controller.signal
    try {
      const response = await fetch(url, {
        ...options,
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      const durationMs = Date.now() - start
      void incrementExternalApiUsage('spotify')
      logInfo('Spotify API request completed', {
        component: 'spotify.makeSpotifyRequest',
        endpoint,
        status: response.status,
        durationMs,
      })
      return response
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
  }

  let response: Response
  try {
    response = await makeRequest(accessToken)
  } catch (requestError) {
    const isTimeout = requestError instanceof Error && requestError.name === 'AbortError'
    if (isTimeout) {
      logWarning('Spotify API request timed out', {
        component: 'spotify.makeSpotifyRequest',
        endpoint,
      })
      throw new NetworkError(
        'Request to Spotify timed out. Please try again.',
        requestError instanceof Error ? requestError : undefined
      )
    }
    throw requestError
  }

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
      
      // Try to parse as JSON
      try {
        errorBody = JSON.parse(responseText)
        if (errorBody.error?.message && errorBody.error.message !== 'Forbidden') {
          errorMessage = errorBody.error.message
        }
      } catch (jsonError) {
        // Not JSON, try to extract meaningful message from HTML/text
        
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
      
      // Try to parse as JSON
      try {
        errorBody = JSON.parse(responseText)
      } catch (jsonError) {
        // Not JSON, create error object from text
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

  return response.json() as Promise<T>
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  iterator: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let index = 0
  const worker = async () => {
    while (index < items.length) {
      const currentIndex = index++
      results[currentIndex] = await iterator(items[currentIndex])
    }
  }
  const concurrency = Math.max(1, Math.min(limit, items.length))
  const workers = Array.from({ length: concurrency }, worker)
  await Promise.all(workers)
  return results
}

export async function getPlaylists(options?: { includeFollowers?: boolean }): Promise<any[]> {
  // Use pagination helper to fetch all playlists
  const allPlaylists = await paginateSpotify<any>('/me/playlists?limit=50')

  if (options?.includeFollowers === false) {
    return allPlaylists
  }

  const missingFollowerIds = allPlaylists.filter((playlist) => !playlist.followers).map((playlist) => playlist.id)
  if (missingFollowerIds.length > 0) {
    try {
      const cachedRows = await query<{ playlist_id: string; playlist_data: any }>(
        `SELECT playlist_id, playlist_data
         FROM playlist_cache
         WHERE playlist_id = ANY($1)`,
        [missingFollowerIds]
      )
      const cachedMap = new Map<string, any>(
        cachedRows.map((row) => [row.playlist_id, row.playlist_data])
      )
      for (const playlist of allPlaylists) {
        if (!playlist.followers) {
          const cached = cachedMap.get(playlist.id)
          if (cached?.followers) {
            playlist.followers = cached.followers
          }
        }
      }
    } catch (error) {
      logWarning('Failed to hydrate followers from cache', {
        component: 'spotify.getPlaylists',
        error,
      })
    }
  }

  const stillMissing = allPlaylists.filter((playlist) => !playlist.followers)
  if (stillMissing.length === 0) {
    return allPlaylists
  }

  const concurrency = Number.parseInt(process.env.SPOTIFY_FOLLOWERS_CONCURRENCY || '5', 10)
  await mapWithConcurrency(stillMissing, concurrency, async (playlist) => {
    try {
      const fullPlaylist = await makeSpotifyRequest<any>(
        `/playlists/${playlist.id}?fields=followers`
      )
      if (fullPlaylist.followers) {
        playlist.followers = fullPlaylist.followers
      }
    } catch (error) {
      logError(error, {
        component: 'spotify.getPlaylists',
        playlistId: playlist.id,
        action: 'fetching_followers',
      })
    }
  })

  return allPlaylists
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

type PlaylistCacheEntry = {
  playlist: any
  tracks: any[]
  snapshotId: string
  updatedAt: Date
}

const playlistRefreshInFlight = new Map<string, Promise<PlaylistCacheEntry>>()
const playlistCacheTtlMs = Number.parseInt(process.env.PLAYLIST_CACHE_TTL_MS || '300000', 10)

function isCacheFresh(updatedAt: Date | null | undefined): boolean {
  if (!updatedAt || !Number.isFinite(playlistCacheTtlMs)) return false
  const ageMs = Date.now() - updatedAt.getTime()
  return ageMs >= 0 && ageMs < playlistCacheTtlMs
}

export function isPlaylistCacheFresh(updatedAt: Date | null | undefined): boolean {
  return isCacheFresh(updatedAt)
}

/**
 * Check if playlist is cached and matches current snapshot_id
 */
async function getCachedPlaylist(playlistId: string): Promise<PlaylistCacheEntry | null> {
  try {
    const results = await query<PlaylistCacheRecord>(
      `SELECT playlist_id, snapshot_id, playlist_data, tracks_data, updated_at
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
        updatedAt: cached.updated_at,
      }
    }
    return null
  } catch (error) {
    logError(error, {
      component: 'spotify.getCachedPlaylist',
      playlistId,
    })
    return null
  }
}

async function getPlaylistSnapshot(playlistId: string): Promise<string | null> {
  try {
    const currentPlaylist = await makeSpotifyRequest<any>(`/playlists/${playlistId}?fields=snapshot_id`)
    return currentPlaylist?.snapshot_id || null
  } catch (error) {
    logWarning('Failed to fetch playlist snapshot', {
      component: 'spotify.getPlaylistSnapshot',
      playlistId,
      error,
    })
    return null
  }
}

async function refreshPlaylistCache(playlistId: string): Promise<PlaylistCacheEntry> {
  if (playlistRefreshInFlight.has(playlistId)) {
    return playlistRefreshInFlight.get(playlistId)!
  }
  const refreshPromise = (async () => {
    const playlist = await makeSpotifyRequest<any>(`/playlists/${playlistId}`)
    const tracks = await getPlaylistTracksInternal(playlistId)
    await ensureTracksHaveIsrcs(playlistId, tracks)
    const snapshotId = playlist?.snapshot_id || ''
    if (snapshotId) {
      await cachePlaylist(playlistId, snapshotId, playlist, tracks)
    }
    return {
      playlist,
      tracks,
      snapshotId,
      updatedAt: new Date(),
    }
  })()
  playlistRefreshInFlight.set(playlistId, refreshPromise)
  try {
    return await refreshPromise
  } finally {
    playlistRefreshInFlight.delete(playlistId)
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
    logInfo(`Cached playlist ${playlistId} with snapshot ${snapshotId}`, {
      component: 'spotify.cachePlaylist',
      playlistId,
      snapshotId,
    })
  } catch (error) {
    logError(error, {
      component: 'spotify.cachePlaylist',
      playlistId,
      snapshotId,
    })
    // Don't throw - caching is optional
  }
}

async function updatePlaylistTracksCache(playlistId: string, tracksData: any[]): Promise<void> {
  try {
    await query(
      `UPDATE playlist_cache
       SET tracks_data = $1::jsonb,
           updated_at = NOW()
       WHERE playlist_id = $2`,
      [JSON.stringify(tracksData), playlistId]
    )
  } catch (error) {
    logError(error, {
      component: 'spotify.updatePlaylistTracksCache',
      playlistId,
    })
  }
}

function normalizeMatchValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

async function ensureTracksHaveIsrcs(playlistId: string, tracks: any[]): Promise<any[]> {
  if (!hasMusoApiKey()) return tracks

  const missing = tracks.filter((track) => {
    if (!track || track.is_local) return false
    const isrc = track.external_ids?.isrc
    return !isrc
  })
  if (missing.length === 0) return tracks

  const concurrency = Number.parseInt(process.env.MUSO_TRACK_SEARCH_CONCURRENCY || '3', 10)
  const limitConcurrency = Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 3
  let index = 0
  let updated = false
  const debug = process.env.MUSO_ISRC_DEBUG === 'true'
  const missingCount = missing.length

  if (debug) {
    logInfo('Muso ISRC enrichment starting', {
      component: 'spotify.ensureTracksHaveIsrcs',
      playlistId,
      missingCount,
      totalTracks: tracks.length,
      concurrency: limitConcurrency,
    })
  }

  const worker = async () => {
    while (index < missing.length) {
      const track = missing[index]
      index += 1
      const title = typeof track?.name === 'string' ? track.name : ''
      const artist = Array.isArray(track?.artists)
        ? track.artists.map((artist: any) => artist?.name).filter(Boolean).join(', ')
        : ''
      if (!title || !artist) continue

      try {
        const keyword = `${title} ${artist}`.trim()
        const results = await searchTracksByKeyword(keyword, { limit: 5 })
        const candidates = results.items || []
        const normalizedTitle = normalizeMatchValue(title)
        const normalizedArtist = normalizeMatchValue(artist)
        const match = candidates.find((candidate) => {
          const candidateTitle = normalizeMatchValue(candidate?.title || '')
          const candidateArtist = normalizeMatchValue(
            Array.isArray(candidate?.artists)
              ? candidate.artists.map((entry) => entry?.name).filter(Boolean).join(', ')
              : ''
          )
          const hasIsrc = Array.isArray(candidate?.isrcs) && candidate.isrcs.length > 0
          return hasIsrc && candidateTitle.includes(normalizedTitle) && candidateArtist.includes(normalizedArtist)
        })
        const fallback = candidates.find(
          (candidate) => Array.isArray(candidate?.isrcs) && candidate.isrcs.length > 0
        )
        const selected = match || fallback
        const isrc = selected?.isrcs?.[0]
        if (isrc) {
          track.external_ids = { ...(track.external_ids || {}), isrc }
          updated = true
          if (debug) {
            logInfo('Muso ISRC match found', {
              component: 'spotify.ensureTracksHaveIsrcs',
              playlistId,
              trackName: title,
              artist,
              isrc,
              matchType: match ? 'title_artist' : 'fallback',
            })
          }
        } else if (debug) {
          logInfo('Muso ISRC match not found', {
            component: 'spotify.ensureTracksHaveIsrcs',
            playlistId,
            trackName: title,
            artist,
            candidates: candidates.length,
          })
        }
      } catch {
        // Ignore Muso lookup failures for individual tracks.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limitConcurrency, missing.length) }, worker))

  if (updated) {
    await updatePlaylistTracksCache(playlistId, tracks)
  }

  if (debug) {
    logInfo('Muso ISRC enrichment completed', {
      component: 'spotify.ensureTracksHaveIsrcs',
      playlistId,
      missingCount,
      updated,
    })
  }

  return tracks
}

export async function getPlaylist(playlistId: string, useCache = true): Promise<any> {
  // Check cache first if enabled
  if (useCache) {
    const cached = await getCachedPlaylist(playlistId)
    if (cached) {
      if (isCacheFresh(cached.updatedAt)) {
        logInfo(`Using cached playlist ${playlistId} (fresh TTL)`, {
          component: 'spotify.getPlaylist',
          playlistId,
          cache: 'hit',
          reason: 'ttl_fresh',
        })
        return cached.playlist
      }

      const currentSnapshot = await getPlaylistSnapshot(playlistId)
      if (!currentSnapshot) {
        logWarning(`Failed to verify snapshot, using cached data for playlist ${playlistId}`, {
          component: 'spotify.getPlaylist',
          playlistId,
        })
        return cached.playlist
      }

      if (currentSnapshot === cached.snapshotId) {
        logInfo(`Using cached playlist ${playlistId} (snapshot matches)`, {
          component: 'spotify.getPlaylist',
          playlistId,
          cache: 'hit',
        })
        return cached.playlist
      }

      logInfo(`Playlist ${playlistId} snapshot changed, refreshing cache`, {
        component: 'spotify.getPlaylist',
        playlistId,
        cache: 'miss',
        reason: 'snapshot_changed',
      })
    }
  }
  
  const refreshed = await refreshPlaylistCache(playlistId)
  return refreshed.playlist
}

/**
 * Internal function to fetch tracks without cache check (used when caching)
 */
async function getPlaylistTracksInternal(playlistId: string): Promise<any[]> {
  const fields = [
    'items(added_at,track(id,name,artists,album,external_urls,external_ids,preview_url,uri,explicit,duration_ms,track_number,disc_number,popularity,is_local,is_playable,linked_from))',
    'next',
  ].join(',')
  const allItems = await paginateSpotify<{
    added_at: string
    track: any
  }>(`/playlists/${playlistId}/tracks?limit=50&fields=${encodeURIComponent(fields)}`)

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
      if (isCacheFresh(cached.updatedAt)) {
        logInfo(`Using cached tracks for playlist ${playlistId} (fresh TTL)`, {
          component: 'spotify.getPlaylistTracks',
          playlistId,
          cache: 'hit',
          reason: 'ttl_fresh',
        })
        return await ensureTracksHaveIsrcs(playlistId, cached.tracks)
      }

      const currentSnapshot = await getPlaylistSnapshot(playlistId)
      if (!currentSnapshot) {
        logWarning(`Failed to verify snapshot, using cached tracks for playlist ${playlistId}`, {
          component: 'spotify.getPlaylistTracks',
          playlistId,
        })
        return await ensureTracksHaveIsrcs(playlistId, cached.tracks)
      }

      if (currentSnapshot === cached.snapshotId) {
        logInfo(`Using cached tracks for playlist ${playlistId}`, {
          component: 'spotify.getPlaylistTracks',
          playlistId,
          cache: 'hit',
        })
        return await ensureTracksHaveIsrcs(playlistId, cached.tracks)
      }

      logInfo(`Playlist ${playlistId} snapshot changed, refreshing cache`, {
        component: 'spotify.getPlaylistTracks',
        playlistId,
        cache: 'miss',
        reason: 'snapshot_changed',
      })
    }
  }
  
  const refreshed = await refreshPlaylistCache(playlistId)
  return refreshed.tracks
}
