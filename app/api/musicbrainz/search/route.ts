import { NextResponse } from 'next/server'
import {
  fetchCoverArtUrl,
  fetchReleasesByRecording,
  fetchWorkCountByArtistId,
  findArtistIdByName,
  searchRecordingsByCredit,
  streamRecordingsByCredit,
} from '@/lib/musicbrainz/client'
import { fetchDeezerTrackByIsrc } from '@/lib/deezer'
import { hasMusoApiKey, listProfileCredits, searchProfilesByName } from '@/lib/muso'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

interface TrackResult {
  id: string
  title: string
  artist: string
  album: string
  releaseType?: string
  year: string
  length: number
  isrc?: string
  isrcDetails?: Array<{
    value: string
    hasDeezer: boolean
    selected?: boolean
    reason?: string
  }>
  releaseId: string
  coverArtUrl?: string | null
  previewUrl?: string | null
  source?: 'muso' | 'musicbrainz'
}

function getReleasePrimaryType(release: any): string | null {
  const releaseGroup = release?.['release-group'] || release?.release_group
  const primaryType = releaseGroup?.['primary-type'] || releaseGroup?.primary_type
  return typeof primaryType === 'string' ? primaryType : null
}

function selectReleaseInfo(releases: any[]) {
  const typedReleases = releases.map((release) => ({
    release,
    primaryType: getReleasePrimaryType(release),
  }))
  const albumRelease = typedReleases.find((item) => item.primaryType === 'Album')
  if (albumRelease?.release) {
    return {
      release: albumRelease.release,
      releaseType: 'Album',
    }
  }
  const singleRelease = typedReleases.find((item) => item.primaryType === 'Single')
  if (singleRelease?.release) {
    return {
      release: singleRelease.release,
      releaseType: 'Single',
    }
  }
  const primaryTypes = typedReleases
    .map((item) => item.primaryType)
    .filter((type): type is string => typeof type === 'string')
  const uniqueTypes = Array.from(new Set(primaryTypes))
  const fallbackRelease = releases[0]
  if (uniqueTypes.length === 1) {
    return {
      release: fallbackRelease,
      releaseType: uniqueTypes[0],
    }
  }
  if (uniqueTypes.length > 1) {
    return {
      release: fallbackRelease,
      releaseType: 'Multiple',
    }
  }
  return {
    release: fallbackRelease,
    releaseType: 'Unknown',
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')?.trim()
  const role = searchParams.get('role')?.trim().toLowerCase() || 'producer'
  const limitParam = Number(searchParams.get('limit') ?? 25)
  const offsetParam = Number(searchParams.get('offset') ?? 0)
  const debugParam = searchParams.get('debug')
  const debug = debugParam !== null && debugParam.toLowerCase() !== 'false'
  const streamParam = searchParams.get('stream')
  const stream = streamParam !== null && streamParam.toLowerCase() !== 'false'
  const refreshParam = searchParams.get('refresh')
  const refresh = refreshParam !== null && refreshParam.toLowerCase() !== 'false'
  const debugSteps: Array<{ step: number; name: string; data?: Record<string, unknown> }> = []

  if (!name) {
    return NextResponse.json({ error: 'Missing name parameter' }, { status: 400 })
  }

  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 25
  const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0
  const nameKey = name.toLowerCase()

  const loadCache = async () => {
    try {
      const rows = await query<{ results: any }>(
        'SELECT results FROM credits_cache WHERE name = $1 AND role = $2 LIMIT 1',
        [nameKey, role]
      )
      if (!rows.length) return null
      const results = Array.isArray(rows[0]?.results) ? rows[0].results : null
      return results
    } catch {
      return null
    }
  }

  const saveCache = async (results: TrackResult[]) => {
    try {
      const isrcs = Array.from(new Set(results.map((item) => item.isrc).filter(Boolean))) as string[]
      await query(
        `
        INSERT INTO credits_cache (name, role, results, isrcs, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (name, role)
        DO UPDATE SET
          results = EXCLUDED.results,
          isrcs = EXCLUDED.isrcs,
          updated_at = NOW()
        `,
        [nameKey, role, JSON.stringify(results), isrcs]
      )
    } catch {
      // ignore cache failures
    }
  }

  const mergeResults = (existing: TrackResult[] | null, incoming: TrackResult[]) => {
    const map = new Map<string, TrackResult>()
    if (existing) {
      existing.forEach((item) => {
        map.set(`${item.id}-${item.releaseId}`, item)
      })
    }
    incoming.forEach((item) => {
      map.set(`${item.id}-${item.releaseId}`, item)
    })
    return Array.from(map.values())
  }

  const musoRoleCredits = (roleName: string) => {
    switch (roleName) {
      case 'songwriter':
        return ['Songwriter', 'Writer', 'Composer', 'Lyricist']
      case 'mixer':
        return ['Mixer', 'Mixing Engineer']
      case 'engineer':
        return ['Engineer', 'Recording Engineer', 'Mastering Engineer']
      case 'artist':
        return ['Artist', 'Primary Artist', 'Featured Artist']
      case 'producer':
      default:
        return ['Producer']
    }
  }

  const fetchMusoResults = async () => {
    const profiles = await searchProfilesByName(name)
    const profile = profiles[0]
    if (!profile?.id) {
      return { results: [] as TrackResult[], totalCount: 0 }
    }
    const { items, totalCount } = await listProfileCredits({
      profileId: profile.id,
      credits: musoRoleCredits(role),
      limit,
      offset,
    })
    const results = items.map((item) => {
      const track = item.track || {}
      const album = item.album || {}
      const artists = Array.isArray(item.artists) ? item.artists : []
      const artistName = artists.map((artist) => artist?.name).filter(Boolean).join(', ')
      const releaseDate = typeof item.releaseDate === 'string' ? item.releaseDate : ''
      return {
        id: track.id || 'unknown',
        title: track.title || 'Unknown title',
        artist: artistName || 'Unknown artist',
        album: album.title || 'Unknown release',
        releaseType: undefined,
        year: releaseDate ? releaseDate.split('-')[0] : '',
        length: typeof track.duration === 'number' ? track.duration : 0,
        isrc: Array.isArray(track.isrcs) ? track.isrcs[0] : undefined,
        releaseId: album.id || 'unknown',
        coverArtUrl: album.albumArt || null,
        previewUrl: track.spotifyPreviewUrl || null,
        source: 'muso',
      } as TrackResult
    })
    return { results, totalCount }
  }

  if (hasMusoApiKey()) {
    try {
      const { results, totalCount } = await fetchMusoResults()
      if (stream) {
        const encoder = new TextEncoder()
        const streamBody = new ReadableStream({
          start: async (controller) => {
            const send = (payload: Record<string, unknown>) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
            }
            try {
              results.forEach((track) => send({ type: 'result', track }))
              await saveCache(results)
              send({ type: 'done', count: results.length })
            } catch (error) {
              send({ type: 'error', message: error instanceof Error ? error.message : 'Unknown error' })
            } finally {
              controller.close()
            }
          },
        })
        return new Response(streamBody, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      }

      await saveCache(results)
      return NextResponse.json({
        releaseCount: totalCount,
        releaseOffset: offset,
        releaseLimit: limit,
        trackCount: results.length,
        results,
        source: 'muso',
      })
    } catch (error) {
      if (debug) {
        debugSteps.push({
          step: 2,
          name: 'Muso lookup failed; falling back to MusicBrainz',
          data: { error: error instanceof Error ? error.message : 'Unknown error' },
        })
      }
    }
  }

  if (stream && !refresh) {
    const cached = await loadCache()
    if (cached && cached.length) {
      const encoder = new TextEncoder()
      const streamBody = new ReadableStream({
        start: async (controller) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'cached', results: cached })}\n\n`))
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', count: cached.length })}\n\n`))
          controller.close()
        },
      })

      void (async () => {
        if (hasMusoApiKey()) {
          try {
            const { results } = await fetchMusoResults()
            const merged = mergeResults(cached, results)
            await saveCache(merged)
            return
          } catch {
            // Fall back to MusicBrainz refresh.
          }
        }

        const collected: TrackResult[] = []
        for await (const recording of streamRecordingsByCredit({ name, role, limit, offset: 0 })) {
          const embeddedReleases = Array.isArray(recording?.releases) ? recording.releases : []
          const releases = embeddedReleases.length > 0
            ? embeddedReleases
            : (recording?.id ? await fetchReleasesByRecording(recording.id) : [])
          const releaseSelection = selectReleaseInfo(releases)
          const release = releaseSelection.release
          const releaseId = release?.id || 'unknown'
          const isrcDetails = Array.isArray((recording as any)?.isrcDetails)
            ? (recording as any).isrcDetails
            : undefined
          const selectedIsrc = isrcDetails?.find((entry: any) => entry?.selected)?.value
          const isrc = selectedIsrc ?? (Array.isArray(recording?.isrcs) ? recording.isrcs[0] : undefined)
          const deezerTrack = isrc ? await fetchDeezerTrackByIsrc(isrc) : null
          const coverArtUrl = deezerTrack?.coverArtUrl
            ?? (release?.id ? await fetchCoverArtUrl(release.id) : null)
          const year = typeof release?.date === 'string' ? release.date.split('-')[0] : ''
          const artistCredit = Array.isArray(recording?.['artist-credit'])
            ? recording['artist-credit']
            : []
          const artist = artistCredit
            .map((credit: any) => credit?.name || credit?.artist?.name)
            .filter(Boolean)
            .join(', ')

          collected.push({
            id: recording.id,
            title: deezerTrack?.title || recording?.title || 'Unknown title',
            artist: deezerTrack?.artist || artist || 'Unknown artist',
            album: deezerTrack?.album || release?.title || 'Unknown release',
            releaseType: releaseSelection.releaseType,
            year,
            length: typeof recording?.length === 'number' ? recording.length : 0,
            isrc,
            isrcDetails,
            releaseId,
            coverArtUrl,
            previewUrl: deezerTrack?.previewUrl || null,
            source: 'musicbrainz',
          })
        }
        const merged = mergeResults(cached, collected)
        await saveCache(merged)
      })()

      return new Response(streamBody, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }
  }

  if (stream) {
    const encoder = new TextEncoder()
    const streamBody = new ReadableStream({
      start: async (controller) => {
        const send = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
        }

        try {
          if (role === 'producer') {
            const artistId = await findArtistIdByName(name)
            if (artistId) {
              const totalWorks = await fetchWorkCountByArtistId(artistId)
              if (typeof totalWorks === 'number') {
                send({ type: 'meta', totalWorks })
              }
            }
          }
          let streamedCount = 0
          const collected: TrackResult[] = []
          for await (const recording of streamRecordingsByCredit({ name, role, limit, offset })) {
            const embeddedReleases = Array.isArray(recording?.releases) ? recording.releases : []
            const releases = embeddedReleases.length > 0
              ? embeddedReleases
              : (recording?.id ? await fetchReleasesByRecording(recording.id) : [])
            const releaseSelection = selectReleaseInfo(releases)
            const release = releaseSelection.release
            const releaseId = release?.id || 'unknown'
            const isrcDetails = Array.isArray((recording as any)?.isrcDetails)
              ? (recording as any).isrcDetails
              : undefined
            const selectedIsrc = isrcDetails?.find((entry: any) => entry?.selected)?.value
            const isrc = selectedIsrc ?? (Array.isArray(recording?.isrcs) ? recording.isrcs[0] : undefined)
            const deezerTrack = isrc ? await fetchDeezerTrackByIsrc(isrc) : null
            const coverArtUrl = deezerTrack?.coverArtUrl
              ?? (release?.id ? await fetchCoverArtUrl(release.id) : null)
            const year = typeof release?.date === 'string' ? release.date.split('-')[0] : ''
            const artistCredit = Array.isArray(recording?.['artist-credit'])
              ? recording['artist-credit']
              : []
            const artist = artistCredit
              .map((credit: any) => credit?.name || credit?.artist?.name)
              .filter(Boolean)
              .join(', ')

            const track: TrackResult = {
              id: recording.id,
              title: deezerTrack?.title || recording?.title || 'Unknown title',
              artist: deezerTrack?.artist || artist || 'Unknown artist',
              album: deezerTrack?.album || release?.title || 'Unknown release',
              releaseType: releaseSelection.releaseType,
              year,
              length: typeof recording?.length === 'number' ? recording.length : 0,
              isrc,
              isrcDetails,
              releaseId,
              coverArtUrl,
              previewUrl: deezerTrack?.previewUrl || null,
              source: 'musicbrainz',
            }

            send({ type: 'result', track })
            streamedCount += 1
            collected.push(track)
          }
          const existing = await loadCache()
          const merged = mergeResults(existing, collected)
          await saveCache(merged)
          send({ type: 'done', count: streamedCount })
        } catch (error) {
          send({ type: 'error', message: error instanceof Error ? error.message : 'Unknown error' })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(streamBody, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }

  if (debug) {
    debugSteps.push({
      step: 1,
      name: 'Parse request params',
      data: { name, role, limit, offset },
    })
  }
  try {
    if (debug) {
      debugSteps.push({
        step: 2,
        name: 'Dispatch search',
        data: { method: 'searchRecordingsByCredit' },
      })
    }
    const recordingSearch = await searchRecordingsByCredit({
      name,
      role,
      limit,
      offset,
    })
    if (debug) {
      debugSteps.push({
        step: 3,
        name: 'Resolve producer artist MBID (when role=producer)',
        data: { artistId: (recordingSearch as any).debug?.artistId ?? null },
      })
      debugSteps.push({
        step: 4,
        name: 'Browse recordings for artist and collect producer relations',
        data: {
          batchLimit: (recordingSearch as any).debug?.batchLimit ?? null,
          iterations: (recordingSearch as any).debug?.iterations ?? null,
          rawOffset: (recordingSearch as any).debug?.rawOffset ?? null,
          rawTotal: (recordingSearch as any).debug?.rawTotal ?? null,
          scannedProducerCount: (recordingSearch as any).debug?.scannedProducerCount ?? null,
          collectedCount: (recordingSearch as any).debug?.collectedCount ?? null,
          worksScanned: (recordingSearch as any).debug?.worksScanned ?? null,
          worksProcessed: (recordingSearch as any).debug?.worksProcessed ?? null,
          recordingsScanned: (recordingSearch as any).debug?.recordingsScanned ?? null,
          recordingsCollected: (recordingSearch as any).debug?.recordingsCollected ?? null,
          workBrowseUrls: (recordingSearch as any).debug?.workBrowse?.requestUrls ?? null,
          recordingBrowseUrls: (recordingSearch as any).debug?.requestUrls ?? null,
          recordingByWorkUrls: (recordingSearch as any).debug?.recordingByWorkUrls ?? null,
        },
      })
    }

    const results = await Promise.all(
      recordingSearch.recordings.map(async (recording) => {
        const embeddedReleases = Array.isArray(recording?.releases) ? recording.releases : []
        const releases = embeddedReleases.length > 0
          ? embeddedReleases
          : (recording?.id ? await fetchReleasesByRecording(recording.id) : [])
        const releaseSelection = selectReleaseInfo(releases)
        const release = releaseSelection.release
        const releaseId = release?.id || 'unknown'
        const isrcDetails = Array.isArray((recording as any)?.isrcDetails)
          ? (recording as any).isrcDetails
          : undefined
        const selectedIsrc = isrcDetails?.find((entry: any) => entry?.selected)?.value
        const isrc = selectedIsrc ?? (Array.isArray(recording?.isrcs) ? recording.isrcs[0] : undefined)
        const deezerTrack = isrc ? await fetchDeezerTrackByIsrc(isrc) : null
        const coverArtUrl = deezerTrack?.coverArtUrl
          ?? (release?.id ? await fetchCoverArtUrl(release.id) : null)
        const year = typeof release?.date === 'string' ? release.date.split('-')[0] : ''
        const artistCredit = Array.isArray(recording?.['artist-credit'])
          ? recording['artist-credit']
          : []
        const artist = artistCredit
          .map((credit: any) => credit?.name || credit?.artist?.name)
          .filter(Boolean)
          .join(', ')

        return {
          id: recording.id,
          title: deezerTrack?.title || recording?.title || 'Unknown title',
          artist: deezerTrack?.artist || artist || 'Unknown artist',
          album: deezerTrack?.album || release?.title || 'Unknown release',
          releaseType: releaseSelection.releaseType,
          year,
          length: typeof recording?.length === 'number' ? recording.length : 0,
          isrc,
          isrcDetails,
          releaseId,
          coverArtUrl,
          previewUrl: deezerTrack?.previewUrl || null,
          source: 'musicbrainz',
        } as TrackResult
      })
    )
    if (debug) {
      debugSteps.push({
        step: 5,
        name: 'Normalize recording results',
        data: { resultsCount: results.length },
      })
    }

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
        steps: [
          ...debugSteps,
          { step: 6, name: 'Attach response metadata', data: { releaseCount: recordingSearch.count, trackCount: results.length } },
          { step: 7, name: 'Return JSON response', data: { ok: true } },
          { step: 8, name: 'Client renders results', data: { note: 'Client receives and renders results.' } },
        ],
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
