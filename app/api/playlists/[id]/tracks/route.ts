import { NextResponse } from 'next/server'
import { getPlaylistTracks } from '@/lib/spotify'
import { query } from '@/lib/db'
import { AuthenticationError } from '@/lib/errors'
import { logError, withApiLogging } from '@/lib/logger'

export const dynamic = 'force-dynamic'

interface PlaylistCacheRecord {
  snapshot_id: string
  updated_at: Date
}

export const GET = withApiLogging(async (
  request: Request,
  { params }: { params: { id: string } }
) => {
  try {
    const url = new URL(request.url)
    const forceRefresh = url.searchParams.get('refresh') === 'true'
    
    // Check if we have cached data
    let isCached = false
    let cacheInfo: { snapshotId: string; cachedAt: Date } | null = null
    
    if (!forceRefresh) {
      try {
        const cacheResults = await query<PlaylistCacheRecord>(
          `SELECT snapshot_id, updated_at 
           FROM playlist_cache 
           WHERE playlist_id = $1`,
          [params.id]
        )
        
        if (cacheResults.length > 0) {
          const cached = cacheResults[0]
          // For tracks, we'll check snapshot when fetching playlist
          isCached = true
          cacheInfo = {
            snapshotId: cached.snapshot_id,
            cachedAt: cached.updated_at,
          }
        }
      } catch (error) {
        logError(error, {
          component: 'api.playlists.id.tracks',
          playlistId: params.id,
          action: 'check_cache',
        })
      }
    }
    
    const tracks = await getPlaylistTracks(params.id, !forceRefresh)
    
    // Return with cache info in headers
    const response = NextResponse.json(tracks)
    if (isCached && cacheInfo) {
      response.headers.set('X-Cached', 'true')
      response.headers.set('X-Snapshot-Id', cacheInfo.snapshotId)
      response.headers.set('X-Cached-At', cacheInfo.cachedAt.toISOString())
    } else {
      response.headers.set('X-Cached', 'false')
    }
    
    return response
  } catch (error) {
    // Handle authentication errors
    if (error instanceof AuthenticationError || (error instanceof Error && (error.message.includes('Unauthorized') || error.message.includes('No access token') || error.message.includes('Please log in')))) {
      logError(error, {
        component: 'api.playlists.id.tracks',
        playlistId: params.id,
        status: 401,
        errorType: 'AuthenticationError',
      })
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    logError(error, {
      component: 'api.playlists.id.tracks',
      playlistId: params.id,
      status: 500,
      errorType: 'Unknown',
    })
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch tracks'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
})
