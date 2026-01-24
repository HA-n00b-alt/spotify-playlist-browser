import { NextResponse } from 'next/server'
import { isAdminUser } from '@/lib/analytics'
import { query } from '@/lib/db'
import { withApiLogging } from '@/lib/logger'
import { getPlaylistTracks } from '@/lib/spotify'
import { searchTracksByKeyword } from '@/lib/muso'

type Track = {
  id: string
  name?: string
  artists?: Array<{ name?: string }>
  external_ids?: { isrc?: string }
}

type DebugLog = {
  trackId: string
  title: string
  artist: string
  request: {
    keyword: string
    limit: number
    type: string[]
  }
  response: unknown
  result: {
    isrc?: string | null
    matchType?: 'title_artist' | 'fallback' | 'none'
  }
}

function normalizeMatchValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export const POST = withApiLogging(async (request: Request) => {
  const isAdmin = await isAdminUser()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const playlistId = typeof body?.playlistId === 'string' ? body.playlistId.trim() : ''
  if (!playlistId) {
    return NextResponse.json({ error: 'playlistId is required' }, { status: 400 })
  }

  const cacheRows = await query<{ tracks_data: any[] }>(
    `SELECT tracks_data FROM playlist_cache WHERE playlist_id = $1 LIMIT 1`,
    [playlistId]
  )
  const tracks: Track[] = cacheRows[0]?.tracks_data || await getPlaylistTracks(playlistId, true)
  const missing = tracks.filter((track) => !track?.external_ids?.isrc)

  const logs: DebugLog[] = []
  let updated = false

  for (const track of missing) {
    const title = typeof track?.name === 'string' ? track.name : ''
    const artist = Array.isArray(track?.artists)
      ? track.artists.map((entry) => entry?.name).filter(Boolean).join(', ')
      : ''
    if (!title || !artist) {
      logs.push({
        trackId: track.id,
        title,
        artist,
        request: { keyword: '', limit: 0, type: ['track'] },
        response: { error: 'missing_title_or_artist' },
        result: { matchType: 'none' },
      })
      continue
    }

    const keyword = `${title} ${artist}`.trim()
    const result = await searchTracksByKeyword(keyword, { limit: 5, debug: true })
    const candidates = result.items || []
    const normalizedTitle = normalizeMatchValue(title)
    const normalizedArtist = normalizeMatchValue(artist)
    const match = candidates.find((candidate) => {
      const candidateTitle = normalizeMatchValue(candidate?.title || '')
      const candidateArtist = normalizeMatchValue(
        Array.isArray(candidate?.artists)
          ? candidate.artists.map((entry) => entry?.name).filter(Boolean).join(', ')
          : ''
      )
      const hasIsrc = Array.isArray(candidate?.isrcs) && candidate.isrcs.length > 0
      return hasIsrc && candidateTitle.includes(normalizedTitle) && candidateArtist.includes(normalizedArtist)
    })
    const fallback = candidates.find(
      (candidate) => Array.isArray(candidate?.isrcs) && candidate.isrcs.length > 0
    )
    const selected = match || fallback
    const isrc = selected?.isrcs?.[0] || null
    if (isrc) {
      track.external_ids = { ...(track.external_ids || {}), isrc }
      updated = true
    }

    logs.push({
      trackId: track.id,
      title,
      artist,
      request: { keyword, limit: 5, type: ['track'] },
      response: result.raw ?? result.items,
      result: {
        isrc,
        matchType: match ? 'title_artist' : isrc ? 'fallback' : 'none',
      },
    })
  }

  if (updated && cacheRows.length > 0) {
    await query(
      `UPDATE playlist_cache
       SET tracks_data = $1::jsonb,
           updated_at = NOW()
       WHERE playlist_id = $2`,
      [JSON.stringify(tracks), playlistId]
    )
  }

  return NextResponse.json({
    missingCount: missing.length,
    updated,
    logs,
  })
})
