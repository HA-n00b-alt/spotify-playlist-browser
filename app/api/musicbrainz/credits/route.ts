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
    const producerRoles = new Set([
      'producer',
      'co-producer',
      'assistant producer',
      'executive producer',
    ])
    const mixRoles = new Set(['mix', 'mixing', 'mixer'])
    const masterRoles = new Set(['mastering', 'mastering engineer'])
    const compositionRoles = new Set(['composer', 'lyricist'])

    const collectNamesForRoles = (relations: any[], roles: Set<string>) =>
      Array.from(
        new Set(
          relations
            .filter((rel: any) => {
              const role = String(rel?.type).toLowerCase()
              if (roles.has(role)) return true
              const attributes = Array.isArray(rel?.attributes) ? rel.attributes : []
              return attributes.some((attr: any) => roles.has(String(attr).toLowerCase()))
            })
            .map((rel: any) => {
              if (typeof rel?.artist?.name === 'string') return rel.artist.name
              if (typeof rel?.name === 'string') return rel.name
              return null
            })
            .filter(Boolean)
        )
      )

    const producedBy = collectNamesForRoles(recordingRelations, producerRoles)
    const mixedBy = collectNamesForRoles(recordingRelations, mixRoles)
    const masteredBy = collectNamesForRoles(recordingRelations, masterRoles)

    let releaseProducedBy: string[] = []
    let releaseMixedBy: string[] = []
    let releaseMasteredBy: string[] = []
    if (
      recording?.id &&
      (producedBy.length === 0 || mixedBy.length === 0 || masteredBy.length === 0)
    ) {
      const releaseUrl =
        `https://musicbrainz.org/ws/2/release?recording=${encodeURIComponent(recording.id)}` +
        `&fmt=json&inc=artist-rels&limit=1`
      try {
        const releaseResponse = await fetch(releaseUrl, {
          headers: {
            'User-Agent': userAgent,
            Accept: 'application/json',
          },
          cache: 'no-store',
        })
        if (releaseResponse.ok) {
          const releaseData = await releaseResponse.json()
          const releaseRelations = Array.isArray(releaseData?.releases?.[0]?.relations)
            ? releaseData.releases[0].relations
            : []
          releaseProducedBy = collectNamesForRoles(releaseRelations, producerRoles)
          releaseMixedBy = collectNamesForRoles(releaseRelations, mixRoles)
          releaseMasteredBy = collectNamesForRoles(releaseRelations, masterRoles)
        }
      } catch {
        releaseProducedBy = []
        releaseMixedBy = []
        releaseMasteredBy = []
      }
    }

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
      performedBy: performers,
      producedBy: Array.from(new Set([...producedBy, ...releaseProducedBy])),
      mixedBy: Array.from(new Set([...mixedBy, ...releaseMixedBy])),
      masteredBy: Array.from(new Set([...masteredBy, ...releaseMasteredBy])),
      writtenBy: uniqueComposition,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
