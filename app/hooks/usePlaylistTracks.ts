import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SpotifyTrack } from '@/lib/types'

interface TracksCacheInfo {
  isCached: boolean
  cachedAt: Date | null
  snapshotId: string | null
}

async function fetchPlaylistTracks(playlistId: string, forceRefresh = false): Promise<SpotifyTrack[]> {
  const url = `/api/playlists/${playlistId}/tracks${forceRefresh ? '?refresh=true' : ''}`
  const res = await fetch(url)
  
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Unauthorized - Please log in')
    }
    throw new Error('Failed to fetch tracks')
  }
  
  const data = await res.json()
  
  // Store cache info in query meta for access
  const cached = res.headers.get('X-Cached') === 'true'
  const cachedAtStr = res.headers.get('X-Cached-At')
  const snapshotId = res.headers.get('X-Snapshot-Id')
  
  // We'll store cache info separately since tracks is just an array
  return data
}

export function usePlaylistTracks(playlistId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['playlistTracks', playlistId],
    queryFn: () => fetchPlaylistTracks(playlistId),
    enabled: options?.enabled !== false && !!playlistId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useRefreshPlaylistTracks(playlistId: string) {
  const queryClient = useQueryClient()
  
  return async () => {
    const data = await fetchPlaylistTracks(playlistId, true)
    queryClient.setQueryData(['playlistTracks', playlistId], data)
    await queryClient.invalidateQueries({ queryKey: ['playlistTracks', playlistId] })
    return data
  }
}











