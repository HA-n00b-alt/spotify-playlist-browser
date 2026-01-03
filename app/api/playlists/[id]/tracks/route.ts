import { NextResponse } from 'next/server'
import { getPlaylistTracks } from '@/lib/spotify'
import { query } from '@/lib/db'

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
          // For tracks, we'll check snapshot when fetching playlist
          isCached = true
          cacheInfo = {
            snapshotId: cached.snapshot_id,
            cachedAt: cached.updated_at,
          }
        }
      } catch (error) {
        console.error('Error checking cache:', error)
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
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    console.error('Error fetching tracks:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch tracks'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

