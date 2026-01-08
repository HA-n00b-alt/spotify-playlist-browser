import { NextResponse } from 'next/server'

function sanitizeQuery(value: string) {
  return value.replace(/"/g, '\\"').trim()
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const title = searchParams.get('title')
  const artist = searchParams.get('artist')

  if (!title || !artist) {
    return NextResponse.json(
      { error: 'Missing title or artist parameter' },
      { status: 400 }
    )
  }

  const query = `recording:"${sanitizeQuery(title)}" AND artist:"${sanitizeQuery(artist)}"`
  const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=1`
  const userAgent =
    process.env.MUSICBRAINZ_USER_AGENT ?? 'spotify-playlist-browser/1.0 (https://example.com)'

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      return NextResponse.json(
        { error: `MusicBrainz request failed: ${response.status} ${response.statusText}`, details: errorText.slice(0, 200) },
        { status: response.status }
      )
    }

    const data = await response.json()
    const artistCredit = data?.recordings?.[0]?.['artist-credit']
    const credits = Array.isArray(artistCredit)
      ? Array.from(
          new Set(
            artistCredit
              .map((credit: any) => {
                if (typeof credit?.name === 'string') return credit.name
                if (typeof credit?.artist?.name === 'string') return credit.artist.name
                return null
              })
              .filter(Boolean)
          )
        )
      : []

    return NextResponse.json({ credits })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
