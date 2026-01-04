import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getCurrentUserId } from '@/lib/analytics'
import { logError, logInfo } from '@/lib/logger'
import { getPlaylistTracks } from '@/lib/spotify'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const userId = await getCurrentUserId()
  
  try {
    const body = await request.json()
    const { playlistId } = body

    if (!playlistId) {
      logError(new Error('playlistId is required'), {
        component: 'api.bpm.recalculate',
        userId: userId || 'anonymous',
        status: 400,
      })
      return NextResponse.json(
        { error: 'playlistId is required' },
        { status: 400 }
      )
    }

    logInfo('Recalculating BPM/key/scale for playlist', {
      component: 'api.bpm.recalculate',
      userId: userId || 'anonymous',
      playlistId,
    })

    // Get all tracks from the playlist
    const tracks = await getPlaylistTracks(playlistId, false)
    const trackIds = tracks.map(track => track.id)

    if (trackIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No tracks found in playlist',
        cleared: 0,
      })
    }

    // Delete cache entries for these tracks to force recalculation
    const result = await query<{ count: number }>(
      `DELETE FROM track_bpm_cache 
       WHERE spotify_track_id = ANY($1)`,
      [trackIds]
    )

    const clearedCount = trackIds.length

    logInfo('Cache cleared for playlist tracks', {
      component: 'api.bpm.recalculate',
      userId: userId || 'anonymous',
      playlistId,
      trackCount: clearedCount,
    })

    return NextResponse.json({
      success: true,
      message: `Cache cleared for ${clearedCount} tracks. BPM/key/scale will be recalculated on next access.`,
      cleared: clearedCount,
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
}

