import { getPlaylists } from './spotify'
import { getCurrentUserId } from './analytics'
import { query } from './db'

interface PlaylistCacheRecord {
  playlist_id: string
  snapshot_id: string
  cached_at: Date
}

interface PlaylistOrderRecord {
  playlist_id: string
  display_order: number
}

/**
 * Enrich playlists with cache status and custom order
 * This function fetches playlists from Spotify and adds:
 * - is_cached: whether the playlist is cached
 * - cached_at: when it was cached
 * - display_order: custom user-defined order
 * Then sorts by display_order if available
 */
export async function getPlaylistsWithMetadata() {
  const playlists = await getPlaylists()
  const userId = await getCurrentUserId()

  if (playlists.length === 0) {
    return playlists
  }

  const playlistIds = playlists.map(p => p.id)
  const placeholders = playlistIds.map((_, i) => `$${i + 1}`).join(',')

  // Fetch cache status
  const cacheMap = new Map<string, { snapshotId: string; cachedAt: Date }>()
  try {
    const cacheResults = await query<PlaylistCacheRecord>(
      `SELECT playlist_id, snapshot_id, cached_at 
       FROM playlist_cache 
       WHERE playlist_id IN (${placeholders})`,
      playlistIds
    )

    for (const cached of cacheResults) {
      cacheMap.set(cached.playlist_id, {
        snapshotId: cached.snapshot_id,
        cachedAt: cached.cached_at,
      })
    }
  } catch (cacheError) {
    console.error('Error checking cache status:', cacheError)
  }

  // Fetch custom order
  const orderMap = new Map<string, number>()
  if (userId) {
    try {
      const orderResults = await query<PlaylistOrderRecord>(
        `SELECT playlist_id, display_order 
         FROM playlist_order 
         WHERE spotify_user_id = $1 
         ORDER BY display_order ASC`,
        [userId]
      )

      for (const order of orderResults) {
        orderMap.set(order.playlist_id, order.display_order)
      }
    } catch (orderError) {
      console.error('Error fetching playlist order:', orderError)
    }
  }

  // Add metadata to each playlist
  let playlistsWithMetadata = playlists.map(playlist => {
    const cacheInfo = cacheMap.get(playlist.id)
    const order = orderMap.get(playlist.id)
    return {
      ...playlist,
      is_cached: cacheInfo ? cacheInfo.snapshotId === playlist.snapshot_id : false,
      cached_at: cacheInfo?.cachedAt || null,
      display_order: order !== undefined ? order : null,
    }
  })

  // Sort by saved order if available
  playlistsWithMetadata = playlistsWithMetadata.sort((a, b) => {
    const aOrder = a.display_order
    const bOrder = b.display_order
    // If both have orders, sort by order
    if (aOrder !== null && bOrder !== null) {
      return aOrder - bOrder
    }
    // If only one has order, prioritize it
    if (aOrder !== null) return -1
    if (bOrder !== null) return 1
    // If neither has order, maintain original order
    return 0
  })

  return playlistsWithMetadata
}

