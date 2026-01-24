import { NextResponse } from 'next/server'
import { isAdminUser } from '@/lib/analytics'
import { withApiLogging } from '@/lib/logger'
import { makeSpotifyRequest, getTrack } from '@/lib/spotify'
import { getTrackDetailsByIsrc, hasMusoApiKey } from '@/lib/muso'

type SpotifySearchResponse = {
  tracks?: {
    items?: any[]
  }
}

type SpotifyTrackSummary = {
  id: string
  title: string
  artist: string
  isrc?: string | null
  previewUrl?: string | null
  album?: string | null
}

type PreviewUrlEntry = {
  url: string
  provider: 'spotify_preview' | 'muso_spotify' | 'deezer_isrc' | 'deezer_search' | 'itunes_search'
  isrc?: string
  title?: string
  artist?: string
}

function formatSpotifyTrack(track: any): SpotifyTrackSummary {
  const artists = Array.isArray(track?.artists)
    ? track.artists.map((artist: any) => artist?.name).filter(Boolean).join(', ')
    : ''
  return {
    id: track?.id,
    title: track?.name || '',
    artist: artists || '',
    isrc: track?.external_ids?.isrc || null,
    previewUrl: track?.preview_url || null,
    album: track?.album?.name || null,
  }
}

async function searchSpotifyTracks(params: {
  isrc?: string | null
  title?: string | null
  artist?: string | null
}): Promise<SpotifyTrackSummary[]> {
  const { isrc, title, artist } = params
  if (!isrc && !title && !artist) return []
  let query = ''
  if (isrc) {
    query = `isrc:${isrc}`
  } else {
    const parts: string[] = []
    if (title) parts.push(`track:${title}`)
    if (artist) parts.push(`artist:${artist}`)
    query = parts.join(' ')
  }
  const response = await makeSpotifyRequest<SpotifySearchResponse>(
    `/search?q=${encodeURIComponent(query)}&type=track&limit=5`
  )
  const items = response.tracks?.items || []
  return items.map(formatSpotifyTrack)
}

async function fetchDeezerByIsrc(isrc: string): Promise<PreviewUrlEntry[]> {
  const entries: PreviewUrlEntry[] = []
  const apiUrl = `https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`
  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'SpotifyPlaylistBrowser/1.0.0',
      Accept: 'application/json',
    },
    cache: 'no-store',
  })
  if (response.ok) {
    const data = await response.json().catch(() => null)
    if (data?.preview) {
      entries.push({
        url: data.preview,
        provider: 'deezer_isrc',
        isrc: data.isrc,
        title: data.title,
        artist: data.artist?.name,
      })
      return entries
    }
  }

  const searchUrl = new URL('https://api.deezer.com/search')
  searchUrl.searchParams.set('q', `isrc:"${isrc}"`)
  searchUrl.searchParams.set('limit', '3')
  const searchResponse = await fetch(searchUrl.toString(), {
    headers: {
      'User-Agent': 'SpotifyPlaylistBrowser/1.0.0',
      Accept: 'application/json',
    },
    cache: 'no-store',
  })
  if (!searchResponse.ok) return entries
  const searchData = await searchResponse.json().catch(() => null)
  const tracks = Array.isArray(searchData?.data) ? searchData.data : []
  tracks.forEach((track: any) => {
    if (!track?.preview) return
    entries.push({
      url: track.preview,
      provider: 'deezer_isrc',
      isrc: track.isrc,
      title: track.title,
      artist: track.artist?.name,
    })
  })
  return entries
}

async function searchDeezerByText(params: {
  title?: string | null
  artist?: string | null
}): Promise<PreviewUrlEntry[]> {
  const { title, artist } = params
  if (!title && !artist) return []
  const searchUrl = new URL('https://api.deezer.com/search')
  const queryParts: string[] = []
  if (artist) queryParts.push(`artist:"${artist}"`)
  if (title) queryParts.push(`track:"${title}"`)
  searchUrl.searchParams.set('q', queryParts.join(' '))
  searchUrl.searchParams.set('limit', '5')
  const response = await fetch(searchUrl.toString(), {
    headers: {
      'User-Agent': 'SpotifyPlaylistBrowser/1.0.0',
      Accept: 'application/json',
    },
    cache: 'no-store',
  })
  if (!response.ok) return []
  const data = await response.json().catch(() => null)
  const tracks = Array.isArray(data?.data) ? data.data : []
  return tracks
    .filter((track: any) => track?.preview)
    .map((track: any) => ({
      url: track.preview,
      provider: 'deezer_search',
      isrc: track.isrc,
      title: track.title,
      artist: track.artist?.name,
    }))
}

async function searchItunes(params: {
  title?: string | null
  artist?: string | null
  isrc?: string | null
}): Promise<PreviewUrlEntry[]> {
  const { title, artist, isrc } = params
  if (!title && !artist && !isrc) return []
  const term = `${artist || ''} ${title || ''} ${isrc || ''}`.trim()
  const searchUrl = new URL('https://itunes.apple.com/search')
  searchUrl.searchParams.set('term', term)
  searchUrl.searchParams.set('media', 'music')
  searchUrl.searchParams.set('entity', 'song')
  searchUrl.searchParams.set('limit', '5')
  searchUrl.searchParams.set('country', 'us')
  const response = await fetch(searchUrl.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    cache: 'no-store',
  })
  if (!response.ok) return []
  const data = await response.json().catch(() => null)
  const results = Array.isArray(data?.results) ? data.results : []
  return results
    .filter((track: any) => track?.previewUrl)
    .map((track: any) => ({
      url: track.previewUrl,
      provider: 'itunes_search',
      isrc: track.isrc,
      title: track.trackName,
      artist: track.artistName,
    }))
}

export const POST = withApiLogging(async (request: Request) => {
  const isAdmin = await isAdminUser()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const rawIsrc = typeof body?.isrc === 'string' ? body.isrc.trim() : ''
  const rawTitle = typeof body?.title === 'string' ? body.title.trim() : ''
  const rawArtist = typeof body?.artist === 'string' ? body.artist.trim() : ''
  const rawSpotifyTrackId = typeof body?.spotifyTrackId === 'string' ? body.spotifyTrackId.trim() : ''

  if (!rawIsrc && !rawTitle && !rawArtist && !rawSpotifyTrackId) {
    return NextResponse.json(
      { error: 'Provide at least an ISRC, title, artist, or Spotify track ID' },
      { status: 400 }
    )
  }

  let spotifyTrack: SpotifyTrackSummary | null = null
  let spotifyTracks: SpotifyTrackSummary[] = []
  let resolvedIsrc = rawIsrc || null
  let resolvedTitle = rawTitle || null
  let resolvedArtist = rawArtist || null

  if (rawSpotifyTrackId) {
    const track = await getTrack(rawSpotifyTrackId)
    spotifyTrack = formatSpotifyTrack(track)
    spotifyTracks = spotifyTrack ? [spotifyTrack] : []
  } else {
    spotifyTracks = await searchSpotifyTracks({
      isrc: rawIsrc || null,
      title: rawTitle || null,
      artist: rawArtist || null,
    })
    spotifyTrack = spotifyTracks[0] || null
  }

  if (spotifyTrack?.isrc && !resolvedIsrc) {
    resolvedIsrc = spotifyTrack.isrc || null
  }
  if (spotifyTrack?.title && !resolvedTitle) {
    resolvedTitle = spotifyTrack.title || null
  }
  if (spotifyTrack?.artist && !resolvedArtist) {
    resolvedArtist = spotifyTrack.artist || null
  }

  const previewUrls: PreviewUrlEntry[] = []
  const seen = new Set<string>()
  const addEntry = (entry: PreviewUrlEntry | null) => {
    if (!entry?.url) return
    if (seen.has(entry.url)) return
    seen.add(entry.url)
    previewUrls.push(entry)
  }

  if (spotifyTrack?.previewUrl) {
    addEntry({
      url: spotifyTrack.previewUrl,
      provider: 'spotify_preview',
      isrc: spotifyTrack.isrc || undefined,
      title: spotifyTrack.title,
      artist: spotifyTrack.artist,
    })
  }

  if (resolvedIsrc) {
    const deezerEntries = await fetchDeezerByIsrc(resolvedIsrc)
    deezerEntries.forEach(addEntry)

    if (hasMusoApiKey()) {
      try {
        const musoDetails = await getTrackDetailsByIsrc(resolvedIsrc)
        if (musoDetails?.spotifyPreviewUrl) {
          addEntry({
            url: musoDetails.spotifyPreviewUrl,
            provider: 'muso_spotify',
            isrc: resolvedIsrc,
            title: musoDetails.title || resolvedTitle || undefined,
            artist: Array.isArray(musoDetails.artists)
              ? musoDetails.artists.map((artist) => artist?.name).filter(Boolean).join(', ')
              : resolvedArtist || undefined,
          })
        }
      } catch {
        // Ignore Muso lookup errors for search results.
      }
    }
  }

  const deezerTextEntries = await searchDeezerByText({
    title: resolvedTitle,
    artist: resolvedArtist,
  })
  deezerTextEntries.forEach(addEntry)

  const itunesEntries = await searchItunes({
    title: resolvedTitle,
    artist: resolvedArtist,
    isrc: resolvedIsrc,
  })
  itunesEntries.forEach(addEntry)

  return NextResponse.json({
    spotifyTrack,
    spotifyTracks,
    previewUrls,
    query: {
      isrc: resolvedIsrc,
      title: resolvedTitle,
      artist: resolvedArtist,
    },
  })
})
