import { NextResponse } from 'next/server'
import {
  fetchCoverArtUrl,
  fetchReleaseDetails,
  recordingMatchesCreditName,
  releaseMatchesCreditName,
  searchReleasesByCredit,
} from '@/lib/musicbrainz/client'

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

  if (!name) {
    return NextResponse.json({ error: 'Missing name parameter' }, { status: 400 })
  }

  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 25
  const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0
  const nameLower = name.toLowerCase()

  try {
    const releaseSearch = await searchReleasesByCredit({
      name,
      role,
      limit,
      offset,
    })

    const releaseDetails = await Promise.all(
      releaseSearch.releases.map(async (release) => {
        const [detail, coverArtUrl] = await Promise.all([
          fetchReleaseDetails(release.id),
          fetchCoverArtUrl(release.id),
        ])
        return { detail, coverArtUrl }
      })
    )

    const results: TrackResult[] = []

    releaseDetails.forEach(({ detail, coverArtUrl }) => {
      if (!detail?.id) return
      const releaseMatches = releaseMatchesCreditName(detail, nameLower)
      const year = typeof detail?.date === 'string' ? detail.date.split('-')[0] : ''

      const media = Array.isArray(detail?.media) ? detail.media : []
      media.forEach((disc: any) => {
        const tracks = Array.isArray(disc?.tracks) ? disc.tracks : []
        tracks.forEach((track: any) => {
          const recording = track?.recording
          if (!recording?.id) return
          const trackMatches = recordingMatchesCreditName(recording, nameLower)
          if (!trackMatches && !releaseMatches) return

          const artistCredit = Array.isArray(recording?.['artist-credit'])
            ? recording['artist-credit']
            : Array.isArray(detail?.['artist-credit'])
              ? detail['artist-credit']
              : []
          const artist = artistCredit
            .map((credit: any) => credit?.name || credit?.artist?.name)
            .filter(Boolean)
            .join(', ')
          const isrc = Array.isArray(recording?.isrcs) ? recording.isrcs[0] : undefined

          results.push({
            id: recording.id,
            title: recording?.title || track?.title || 'Unknown title',
            artist: artist || 'Unknown artist',
            album: detail?.title || 'Unknown release',
            year,
            length: typeof recording?.length === 'number' ? recording.length : 0,
            isrc,
            releaseId: detail.id,
            coverArtUrl,
          })
        })
      })
    })

    return NextResponse.json({
      releaseCount: releaseSearch.count,
      releaseOffset: releaseSearch.offset,
      releaseLimit: releaseSearch.limit,
      trackCount: results.length,
      results,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
