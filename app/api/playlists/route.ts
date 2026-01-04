import { NextResponse } from 'next/server'
import { getPlaylists } from '@/lib/spotify'
import { trackApiRequest, getCurrentUserId } from '@/lib/analytics'
import { query } from '@/lib/db'

interface PlaylistCacheRecord {
  playlist_id: string
  snapshot_id: string
  cached_at: Date
}

export async function GET(request: Request) {
  const userId = await getCurrentUserId()
  let response: NextResponse

  try {
    const playlists = await getPlaylists()
    
    // Check cache status for each playlist
    if (playlists.length > 0) {
      const playlistIds = playlists.map(p => p.id)
      const placeholders = playlistIds.map((_, i) => `$${i + 1}`).join(',')
      
      try {
        const cacheResults = await query<PlaylistCacheRecord>(
          `SELECT playlist_id, snapshot_id, cached_at 
           FROM playlist_cache 
           WHERE playlist_id IN (${placeholders})`,
          playlistIds
        )
        
        // Create a map of cache status
        const cacheMap = new Map<string, { snapshotId: string; cachedAt: Date }>()
        for (const cached of cacheResults) {
          cacheMap.set(cached.playlist_id, {
            snapshotId: cached.snapshot_id,
            cachedAt: cached.cached_at,
          })
        }
        
        // Add cache info to each playlist
        const playlistsWithCache = playlists.map(playlist => {
          const cacheInfo = cacheMap.get(playlist.id)
          return {
            ...playlist,
            is_cached: cacheInfo ? cacheInfo.snapshotId === playlist.snapshot_id : false,
            cached_at: cacheInfo?.cachedAt || null,
          }
        })
        
        response = NextResponse.json(playlistsWithCache)
      } catch (cacheError) {
        // If cache check fails, return playlists without cache info
        console.error('Error checking cache status:', cacheError)
        response = NextResponse.json(playlists)
      }
    } else {
      response = NextResponse.json(playlists)
    }
    
    // Track successful request
    trackApiRequest(userId, '/api/playlists', 'GET', 200).catch(() => {})
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      response = NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
      trackApiRequest(userId, '/api/playlists', 'GET', 401).catch(() => {})
      return response
    }
    
    // Handle forbidden (403)
    if (error instanceof Error && (error.message.includes('Forbidden') || error.message.includes('403'))) {
      console.error('Forbidden error fetching playlists:', error)
      response = NextResponse.json(
        { error: error.message || 'Access forbidden. Please check your Spotify app permissions.' },
        { status: 403 }
      )
      trackApiRequest(userId, '/api/playlists', 'GET', 403).catch(() => {})
      return response
    }
    
    // Handle rate limiting (429) - redirect to rate-limit page
    if (error instanceof Error && (error.message.includes('Rate limit') || error.message.includes('429'))) {
      console.error('Rate limit error fetching playlists:', error)
      trackApiRequest(userId, '/api/playlists', 'GET', 429).catch(() => {})
      // Extract retryAfter from error message if available, or use 0
      const retryAfterMatch = error.message.match(/retryAfter[:\s]+(\d+)/i)
      const retryAfter = retryAfterMatch ? retryAfterMatch[1] : '0'
      // Redirect to rate-limit page with endpoint and retryAfter info
      const rateLimitUrl = new URL('/rate-limit', request.url)
      rateLimitUrl.searchParams.set('endpoint', '/api/playlists')
      rateLimitUrl.searchParams.set('retryAfter', retryAfter)
      return NextResponse.redirect(rateLimitUrl)
    }
    
    console.error('Error fetching playlists:', error)
    response = NextResponse.json(
      { error: 'Failed to fetch playlists' },
      { status: 500 }
    )
    trackApiRequest(userId, '/api/playlists', 'GET', 500).catch(() => {})
  }

  return response!
}

