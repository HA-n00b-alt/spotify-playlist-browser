import { NextResponse } from 'next/server'
import { fetchMusicBrainzJson } from '@/lib/musicbrainz/client'
import { getTrackDetailsByIsrc, hasMusoApiKey, type MusoTrackDetails } from '@/lib/muso'
import { withApiLogging } from '@/lib/logger'

const normalizeRole = (value?: string | null) => (value || '').toLowerCase()

const uniqueNames = (names: Array<string | null | undefined>) =>
  Array.from(new Set(names.filter((name): name is string => Boolean(name && name.trim()))))

const collectMusoCredits = (track: MusoTrackDetails) => {
  const performedBy = uniqueNames(track.artists?.map((artist) => artist.name) || [])
  const producedBy: string[] = []
  const mixedBy: string[] = []
  const masteredBy: string[] = []
  const writtenBy: string[] = []

  const credits = Array.isArray(track.credits) ? track.credits : []
  for (const group of credits) {
    const parent = normalizeRole(group.parent)
    const childCredits = Array.isArray(group.credits) ? group.credits : []
    for (const credit of childCredits) {
      const child = normalizeRole(credit.child)
      const collaborators = Array.isArray(credit.collaborators) ? credit.collaborators : []
      const names = uniqueNames(collaborators.map((collab) => collab.name))
      const bucket = (target: string[], incoming: string[]) => target.push(...incoming)

      if (child.includes('producer') || parent.includes('producer')) {
        bucket(producedBy, names)
        continue
      }
      if (child.includes('mix') || child.includes('engineer')) {
        bucket(mixedBy, names)
        continue
      }
      if (child.includes('master')) {
        bucket(masteredBy, names)
        continue
      }
      if (child.includes('writer') || child.includes('composer') || child.includes('lyric')) {
        bucket(writtenBy, names)
        continue
      }
      if (child.includes('artist') || parent.includes('artist')) {
        bucket(performedBy, names)
      }
    }
  }

  return {
    performedBy: uniqueNames(performedBy),
    producedBy: uniqueNames(producedBy),
    mixedBy: uniqueNames(mixedBy),
    masteredBy: uniqueNames(masteredBy),
    writtenBy: uniqueNames(writtenBy),
    releaseId: null,
  }
}

export const GET = withApiLogging(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const isrc = searchParams.get('isrc')

  if (!isrc) {
    return NextResponse.json(
      { error: 'Missing isrc parameter' },
      { status: 400 }
    )
  }

  try {
    if (hasMusoApiKey()) {
      try {
        const track = await getTrackDetailsByIsrc(isrc)
        if (track) {
          return NextResponse.json(collectMusoCredits(track))
        }
      } catch {
        // Fall back to MusicBrainz if Muso is unavailable or rate-limited.
      }
    }
    const data = await fetchMusicBrainzJson<any>(`/isrc/${encodeURIComponent(isrc)}`, {
      fmt: 'json',
      inc: 'artist-credits+artist-rels+recording-rels+work-rels',
    })
    const recording = data?.recordings?.[0]
    if (!recording) {
      return NextResponse.json(
        { error: 'No MusicBrainz recording found for this ISRC' },
        { status: 404 }
      )
    }
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
    let releaseId: string | null = null
    if (recording?.id) {
      try {
        const releaseData = await fetchMusicBrainzJson<any>('/release', {
          recording: recording.id,
          fmt: 'json',
          inc: 'artist-rels',
          limit: 1,
        })
        const release = releaseData?.releases?.[0]
        releaseId = typeof release?.id === 'string' ? release.id : null
        if (producedBy.length === 0 || mixedBy.length === 0 || masteredBy.length === 0) {
          const releaseRelations = Array.isArray(release?.relations)
            ? release.relations
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
      releaseId,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
})
