import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getCurrentUserId } from '@/lib/analytics'
import { logError, logInfo, withApiLogging } from '@/lib/logger'
import { getPlaylistTracks } from '@/lib/spotify'

export const dynamic = 'force-dynamic'
// Increase max duration for large playlists (Vercel Pro allows up to 300s)
export const maxDuration = 60

export const POST = withApiLogging(async (request: Request) => {
  const userId = await getCurrentUserId()
  
  try {
    const body = await request.json()
    const { playlistId, trackIds: providedTrackIds } = body

    if (!playlistId && !providedTrackIds) {
      logError(new Error('playlistId or trackIds is required'), {
        component: 'api.bpm.recalculate',
        userId: userId || 'anonymous',
        status: 400,
      })
      return NextResponse.json(
        { error: 'playlistId or trackIds is required' },
        { status: 400 }
      )
    }

    logInfo('Recalculating BPM/key/scale for playlist', {
      component: 'api.bpm.recalculate',
      userId: userId || 'anonymous',
      playlistId,
      hasProvidedTrackIds: !!providedTrackIds,
    })

    let trackIds: string[] = []

    // If track IDs are provided, use them (faster - avoids Spotify API call)
    if (providedTrackIds && Array.isArray(providedTrackIds) && providedTrackIds.length > 0) {
      trackIds = providedTrackIds
      logInfo('Using provided track IDs', {
        component: 'api.bpm.recalculate',
        trackCount: trackIds.length,
      })
    } else if (playlistId) {
      // Try to get track IDs from cache first (much faster)
      try {
        const cacheResults = await query<{ tracks_data: any[] }>(
          `SELECT tracks_data FROM playlist_cache WHERE playlist_id = $1 LIMIT 1`,
          [playlistId]
        )
        
        if (cacheResults.length > 0 && cacheResults[0].tracks_data) {
          trackIds = cacheResults[0].tracks_data
            .map((track: any) => track.id)
            .filter((id: string) => id) // Filter out any null/undefined
          logInfo('Using track IDs from cache', {
            component: 'api.bpm.recalculate',
            trackCount: trackIds.length,
          })
        }
      } catch (cacheError) {
        logError(cacheError as Error, {
          component: 'api.bpm.recalculate',
          action: 'fetch_from_cache',
        })
      }

      // If cache didn't have tracks, fetch from Spotify (slower but fallback)
      if (trackIds.length === 0) {
        logInfo('Fetching tracks from Spotify API', {
          component: 'api.bpm.recalculate',
        })
        const tracks = await getPlaylistTracks(playlistId, false)
        trackIds = tracks.map(track => track.id).filter(id => id)
      }
    }

    if (trackIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No tracks found in playlist',
        cleared: 0,
      })
    }

    // Limit to prevent timeout on very large playlists
    const MAX_TRACKS = 1000
    const tracksToProcess = trackIds.slice(0, MAX_TRACKS)
    const skipped = trackIds.length - tracksToProcess.length

    // Delete cache entries for these tracks to force recalculation
    // Use batching for very large lists to avoid query size limits
    const BATCH_SIZE = 500
    let deletedCount = 0
    
    for (let i = 0; i < tracksToProcess.length; i += BATCH_SIZE) {
      const batch = tracksToProcess.slice(i, i + BATCH_SIZE)
      await query(
        `DELETE FROM track_bpm_cache 
         WHERE spotify_track_id = ANY($1)`,
        [batch]
      )
      deletedCount += batch.length
    }

    logInfo('Cache cleared for playlist tracks', {
      component: 'api.bpm.recalculate',
      userId: userId || 'anonymous',
      playlistId,
      trackCount: deletedCount,
      skipped,
    })

    return NextResponse.json({
      success: true,
      message: `Cache cleared for ${deletedCount} tracks${skipped > 0 ? ` (${skipped} skipped due to limit)` : ''}. BPM/key/scale will be recalculated on next access.`,
      cleared: deletedCount,
      skipped: skipped > 0 ? skipped : undefined,
    })
  } catch (error) {
    logError(error as Error, {
      component: 'api.bpm.recalculate',
      userId: userId || 'anonymous',
    })
    return NextResponse.json(
      { error: 'Failed to recalculate BPM/key/scale' },
      { status: 500 }
    )
  }
})
