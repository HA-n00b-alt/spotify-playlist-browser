import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const isrc = searchParams.get('isrc')

  if (!isrc) {
    return NextResponse.json(
      { error: 'Missing isrc parameter' },
      { status: 400 }
    )
  }

  const url =
    `https://musicbrainz.org/ws/2/isrc/${encodeURIComponent(isrc)}` +
    `?fmt=json&inc=artist-credits+artist-rels+recording-rels+work-rels`
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
    const recording = data?.recordings?.[0]
    const artistCredit = recording?.['artist-credit']
    const performers = Array.isArray(artistCredit)
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

    const recordingRelations = Array.isArray(recording?.relations) ? recording.relations : []
    const productionRoles = new Set([
      'producer',
      'co-producer',
      'assistant producer',
      'executive producer',
      'engineer',
      'recording engineer',
      'mixer',
      'mixing',
    ])
    const compositionRoles = new Set(['composer', 'lyricist'])

    const production = Array.from(
      new Set(
        recordingRelations
          .filter((rel: any) => {
            const role = String(rel?.type).toLowerCase()
            if (productionRoles.has(role)) return true
            const attributes = Array.isArray(rel?.attributes) ? rel.attributes : []
            return attributes.some((attr: any) => productionRoles.has(String(attr).toLowerCase()))
          })
          .map((rel: any) => {
            if (typeof rel?.artist?.name === 'string') return rel.artist.name
            if (typeof rel?.name === 'string') return rel.name
            return null
          })
          .filter(Boolean)
      )
    )

    const composition = Array.from(
      new Set(
        recordingRelations
          .filter((rel: any) => compositionRoles.has(String(rel?.type).toLowerCase()))
          .map((rel: any) => {
            if (typeof rel?.artist?.name === 'string') return rel.artist.name
            if (typeof rel?.name === 'string') return rel.name
            return null
          })
          .filter(Boolean)
      )
    )

    // Some work relations include nested work->relations with composer/lyricist credits.
    const workRelations = recordingRelations.filter((rel: any) => rel?.work?.relations)
    for (const rel of workRelations) {
      const workRels = Array.isArray(rel.work?.relations) ? rel.work.relations : []
      for (const workRel of workRels) {
        const role = String(workRel?.type).toLowerCase()
        if (!compositionRoles.has(role)) continue
        const name =
          typeof workRel?.artist?.name === 'string'
            ? workRel.artist.name
            : typeof workRel?.name === 'string'
              ? workRel.name
              : null
        if (name) composition.push(name)
      }
    }

    const uniqueComposition = Array.from(new Set(composition))

    return NextResponse.json({
      performers,
      production,
      composition: uniqueComposition,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
