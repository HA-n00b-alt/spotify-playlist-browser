import { NextResponse } from 'next/server'
import { MB_BASE_URL, USER_AGENT } from '@/lib/musicbrainz'

const ROLE_FIELD_MAP: Record<string, string> = {
  producer: 'producer',
  songwriter: 'writer',
  mixer: 'mixer',
  engineer: 'engineer',
  artist: 'artist',
}

function buildQuery(name: string, role: string): string {
  const field = ROLE_FIELD_MAP[role] ?? 'artist'
  return `${field}:"${name}"`
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

  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 25
  const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0
  const query = buildQuery(name, role)
  const url =
    `${MB_BASE_URL}/recording?` +
    `query=${encodeURIComponent(query)}` +
    `&limit=${limit}&offset=${offset}` +
    `&fmt=json&inc=artist-credits+releases+isrcs`

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      return NextResponse.json(
        {
          error: `MusicBrainz request failed: ${response.status} ${response.statusText}`,
          details: errorText.slice(0, 200),
        },
        { status: response.status }
      )
    }

    const data = await response.json()
    const recordings = Array.isArray(data?.recordings) ? data.recordings : []

    const results = recordings.map((recording: any) => {
      const artistCredit = Array.isArray(recording?.['artist-credit'])
        ? recording['artist-credit']
        : []
      const artist = artistCredit
        .map((credit: any) => credit?.name || credit?.artist?.name)
        .filter(Boolean)
        .join(', ')
      const release = Array.isArray(recording?.releases) ? recording.releases[0] : null
      const releaseDate = typeof release?.date === 'string' ? release.date : ''
      const year = releaseDate ? releaseDate.split('-')[0] : ''
      const isrc = Array.isArray(recording?.isrcs) ? recording.isrcs[0] : undefined

      return {
        id: recording?.id,
        title: recording?.title || 'Unknown title',
        artist: artist || 'Unknown artist',
        album: release?.title || 'Unknown release',
        year,
        length: typeof recording?.length === 'number' ? recording.length : 0,
        isrc,
      }
    })

    return NextResponse.json({
      count: typeof data?.count === 'number' ? data.count : results.length,
      offset,
      limit,
      results,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
