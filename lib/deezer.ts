const DEEZER_API_BASE = 'https://api.deezer.com'

export interface DeezerTrackSummary {
  title: string
  artist: string
  album: string
  coverArtUrl?: string | null
  previewUrl?: string | null
}

export async function fetchDeezerTrackByIsrc(
  isrc: string
): Promise<{ summary: DeezerTrackSummary | null; raw: unknown } | null> {
  const trimmed = isrc.trim()
  if (!trimmed) return null

  const url = `${DEEZER_API_BASE}/track/isrc:${encodeURIComponent(trimmed)}`
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'SpotifyPlaylistBrowser/1.0.0',
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    return null
  }

  const data = await response.json().catch(() => null)
  const track = data && data.type === 'track' ? data : null

  return {
    summary: track ? {
      title: track.title || '',
      artist: track.artist?.name || '',
      album: track.album?.title || '',
      coverArtUrl: track.album?.cover_medium || track.album?.cover || null,
      previewUrl: track.preview || null,
    } : null,
    raw: data,
  }
}
