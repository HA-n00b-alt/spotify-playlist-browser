import { NextResponse } from 'next/server'
import {
  fetchCoverArtUrl,
  searchRecordingsByCredit,
} from '@/lib/musicbrainz/client'

export const dynamic = 'force-dynamic'

interface TrackResult {
  id: string
  title: string
  artist: string
  album: string
  year: string
  length: number
  isrc?: string
  releaseId: string
  coverArtUrl?: string | null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')?.trim()
  const role = searchParams.get('role')?.trim().toLowerCase() || 'producer'
  const limitParam = Number(searchParams.get('limit') ?? 25)
  const offsetParam = Number(searchParams.get('offset') ?? 0)
  const debugParam = searchParams.get('debug')
  const debug = debugParam !== null && debugParam.toLowerCase() !== 'false'

  if (!name) {
    return NextResponse.json({ error: 'Missing name parameter' }, { status: 400 })
  }

  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 25
  const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0
  try {
    const recordingSearch = await searchRecordingsByCredit({
      name,
      role,
      limit,
      offset,
    })

    const results = await Promise.all(
      recordingSearch.recordings.map(async (recording) => {
        const releases = Array.isArray(recording?.releases) ? recording.releases : []
        const release = releases[0]
        const releaseId = release?.id || 'unknown'
        const coverArtUrl = release?.id ? await fetchCoverArtUrl(release.id) : null
        const year = typeof release?.date === 'string' ? release.date.split('-')[0] : ''
        const artistCredit = Array.isArray(recording?.['artist-credit'])
          ? recording['artist-credit']
          : []
        const artist = artistCredit
          .map((credit: any) => credit?.name || credit?.artist?.name)
          .filter(Boolean)
          .join(', ')
        const isrc = Array.isArray(recording?.isrcs) ? recording.isrcs[0] : undefined

        return {
          id: recording.id,
          title: recording?.title || 'Unknown title',
          artist: artist || 'Unknown artist',
          album: release?.title || 'Unknown release',
          year,
          length: typeof recording?.length === 'number' ? recording.length : 0,
          isrc,
          releaseId,
          coverArtUrl,
        } as TrackResult
      })
    )

    const payload: Record<string, any> = {
      releaseCount: recordingSearch.count,
      releaseOffset: recordingSearch.offset,
      releaseLimit: recordingSearch.limit,
      trackCount: results.length,
      results,
    }
    if (debug) {
      payload.debug = {
        role,
        name,
        ...(recordingSearch as any).debug,
      }
    }
    return NextResponse.json(payload)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
