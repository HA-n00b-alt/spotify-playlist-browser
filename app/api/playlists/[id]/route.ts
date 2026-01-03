import { NextResponse } from 'next/server'
import { getPlaylist } from '@/lib/spotify'
import { query } from '@/lib/db'
import { AuthenticationError } from '@/lib/errors'

interface PlaylistCacheRecord {
  snapshot_id: string
  updated_at: Date
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
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
          // Verify snapshot is still current
          try {
            const currentPlaylist = await getPlaylist(params.id, false) // Don't use cache for verification
            if (currentPlaylist.snapshot_id === cached.snapshot_id) {
              isCached = true
              cacheInfo = {
                snapshotId: cached.snapshot_id,
                cachedAt: cached.updated_at,
              }
            }
          } catch (error) {
            // If verification fails, still try to use cache
            isCached = true
            cacheInfo = {
              snapshotId: cached.snapshot_id,
              cachedAt: cached.updated_at,
            }
          }
        }
      } catch (error) {
        console.error('Error checking cache:', error)
      }
    }
    
    // Fetch playlist (will use cache if available and not forcing refresh)
    const playlist = await getPlaylist(params.id, !forceRefresh)
    
    // Return with cache info in headers
    const response = NextResponse.json(playlist)
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
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    console.error('Error fetching playlist:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch playlist'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

