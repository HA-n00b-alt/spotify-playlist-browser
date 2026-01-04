import { getPlaylists } from './spotify'
import { query } from './db'

interface PlaylistCacheRecord {
  playlist_id: string
  snapshot_id: string
  cached_at: Date
}

/**
 * Enrich playlists with cache status
 * This function fetches playlists from Spotify and adds:
 * - is_cached: whether the playlist is cached
 * - cached_at: when it was cached
 * Returns playlists in Spotify's original order
 */
export async function getPlaylistsWithMetadata() {
  const playlists = await getPlaylists()

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

  // Add metadata to each playlist (keep Spotify's original order)
  const playlistsWithMetadata = playlists.map(playlist => {
    const cacheInfo = cacheMap.get(playlist.id)
    return {
      ...playlist,
      is_cached: cacheInfo ? cacheInfo.snapshotId === playlist.snapshot_id : false,
      cached_at: cacheInfo?.cachedAt || null,
    }
  })

  return playlistsWithMetadata
}


