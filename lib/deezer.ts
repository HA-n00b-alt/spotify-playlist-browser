import { logError, logInfo } from './logger'

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
): Promise<DeezerTrackSummary | null> {
  const trimmed = isrc.trim()
  if (!trimmed) return null

  const trackUrl = `${DEEZER_API_BASE}/track/isrc:${encodeURIComponent(trimmed)}`
  const start = Date.now()
  const response = await fetch(trackUrl, {
    headers: {
      'User-Agent': 'SpotifyPlaylistBrowser/1.0.0',
      Accept: 'application/json',
    },
    cache: 'no-store',
  })
  const durationMs = Date.now() - start

  let data = response.ok ? await response.json().catch(() => null) : null
  let track = data && data.type === 'track' ? data : null

  if (!track) {
    const searchUrl = new URL(`${DEEZER_API_BASE}/search`)
    searchUrl.searchParams.set('q', `isrc:"${trimmed}"`)
    searchUrl.searchParams.set('limit', '1')
    const searchStart = Date.now()
    const searchResponse = await fetch(searchUrl.toString(), {
      headers: {
        'User-Agent': 'SpotifyPlaylistBrowser/1.0.0',
        Accept: 'application/json',
      },
      cache: 'no-store',
    })
    const searchDurationMs = Date.now() - searchStart
    if (!searchResponse.ok) {
      logError(new Error('Deezer search failed'), {
        provider: 'deezer',
        url: searchUrl.toString(),
        status: searchResponse.status,
        durationMs: searchDurationMs,
      })
      return null
    }
    data = await searchResponse.json().catch(() => null)
    track = data?.data && Array.isArray(data.data) ? data.data[0] : null
  }

  if (!track) return null

  logInfo('Deezer ISRC lookup completed', {
    provider: 'deezer',
    url: trackUrl,
    status: response.status,
    durationMs,
  })
  return {
    title: track.title || '',
    artist: track.artist?.name || '',
    album: track.album?.title || '',
    coverArtUrl: track.album?.cover_medium || track.album?.cover || null,
    previewUrl: track.preview || null,
  }
}
