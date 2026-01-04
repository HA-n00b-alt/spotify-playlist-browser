import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SpotifyPlaylistInfo } from '@/lib/types'

interface PlaylistResponse extends SpotifyPlaylistInfo {
  is_cached?: boolean
  cached_at?: Date
  snapshot_id?: string
}

interface PlaylistCacheInfo {
  isCached: boolean
  cachedAt: Date | null
  snapshotId: string | null
}

async function fetchPlaylist(playlistId: string, forceRefresh = false): Promise<PlaylistResponse> {
  const url = `/api/playlists/${playlistId}${forceRefresh ? '?refresh=true' : ''}`
  const res = await fetch(url)
  
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Unauthorized - Please log in')
    }
    throw new Error('Failed to fetch playlist')
  }
  
  const data = await res.json()
  
  // Extract cache info from headers
  const cached = res.headers.get('X-Cached') === 'true'
  const cachedAtStr = res.headers.get('X-Cached-At')
  const snapshotId = res.headers.get('X-Snapshot-Id')
  
  return {
    ...data,
    is_cached: cached,
    cached_at: cachedAtStr ? new Date(cachedAtStr) : undefined,
    snapshot_id: snapshotId || undefined,
  }
}

export function usePlaylist(playlistId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['playlist', playlistId],
    queryFn: () => fetchPlaylist(playlistId),
    enabled: options?.enabled !== false && !!playlistId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function usePlaylistCacheInfo(playlistId: string): PlaylistCacheInfo {
  const queryClient = useQueryClient()
  const queryData = queryClient.getQueryData<PlaylistResponse>(['playlist', playlistId])
  
  return {
    isCached: queryData?.is_cached ?? false,
    cachedAt: queryData?.cached_at ?? null,
    snapshotId: queryData?.snapshot_id ?? null,
  }
}

export function useRefreshPlaylist(playlistId: string) {
  const queryClient = useQueryClient()
  
  return async () => {
    const data = await fetchPlaylist(playlistId, true)
    queryClient.setQueryData(['playlist', playlistId], data)
    await queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] })
    return data
  }
}




