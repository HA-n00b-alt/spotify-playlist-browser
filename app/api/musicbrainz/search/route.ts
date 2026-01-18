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
import {
  getTrackDetailsById,
  hasMusoApiKey,
  listProfileCredits,
  searchProfilesByName,
  type MusoTrackDetails,
} from '@/lib/muso'
import { query } from '@/lib/db'
import { withApiLogging } from '@/lib/logger'

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

export const GET = withApiLogging(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')?.trim()
  const role = searchParams.get('role')?.trim().toLowerCase() || 'producer'
  const limitParam = Number(searchParams.get('limit') ?? 20)
  const offsetParam = Number(searchParams.get('offset') ?? 0)
  const releaseDateStart = searchParams.get('releaseDateStart')?.trim() || null
  const releaseDateEnd = searchParams.get('releaseDateEnd')?.trim() || null
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

  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 20
  const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0
  const nameKey = name.toLowerCase()
  const profileSearchLimit = 5

  const loadCache = async () => {
    try {
      const rows = await query<{ results: any; profile: any; total_count: number | null }>(
        `
        SELECT results, profile, total_count
        FROM credits_cache
        WHERE name = $1
          AND role = $2
          AND release_date_start IS NOT DISTINCT FROM $3
          AND release_date_end IS NOT DISTINCT FROM $4
        LIMIT 1
        `,
        [nameKey, role, releaseDateStart, releaseDateEnd]
      )
      if (!rows.length) return null
      const results = Array.isArray(rows[0]?.results) ? rows[0].results : null
      const rawProfile = rows[0]?.profile
      let profile = rawProfile ?? null
      if (typeof rawProfile === 'string') {
        try {
          profile = JSON.parse(rawProfile)
        } catch {
          profile = null
        }
      }
      return {
        results,
        profile,
        totalCount: typeof rows[0]?.total_count === 'number' ? rows[0].total_count : null,
      }
    } catch {
      return null
    }
  }

  const saveCache = async (results: TrackResult[], options?: { profile?: Record<string, unknown> | null; totalCount?: number | null }) => {
    try {
      const isrcs = Array.from(new Set(results.map((item) => item.isrc).filter(Boolean))) as string[]
      await query(
        `
        INSERT INTO credits_cache (name, role, release_date_start, release_date_end, results, isrcs, profile, total_count, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (name, role, release_date_start, release_date_end)
        DO UPDATE SET
          results = EXCLUDED.results,
          isrcs = EXCLUDED.isrcs,
          profile = EXCLUDED.profile,
          total_count = EXCLUDED.total_count,
          updated_at = NOW()
        `,
        [
          nameKey,
          role,
          releaseDateStart,
          releaseDateEnd,
          JSON.stringify(results),
          isrcs,
          options?.profile ? JSON.stringify(options.profile) : null,
          typeof options?.totalCount === 'number' ? options.totalCount : null,
        ]
      )
    } catch {
      // ignore cache failures
    }
  }

  const trackDetailsCache = new Map<string, MusoTrackDetails | null>()

  const loadTrackCache = async (trackId: string): Promise<MusoTrackDetails | null> => {
    if (trackDetailsCache.has(trackId)) {
      return trackDetailsCache.get(trackId) ?? null
    }
    try {
      const rows = await query<{ data: any }>(
        'SELECT data FROM muso_track_cache WHERE muso_track_id = $1 LIMIT 1',
        [trackId]
      )
      if (!rows.length) {
        trackDetailsCache.set(trackId, null)
        return null
      }
      const rawData = rows[0]?.data
      let cached = rawData as MusoTrackDetails | null
      if (typeof rawData === 'string') {
        try {
          cached = JSON.parse(rawData) as MusoTrackDetails
        } catch {
          cached = null
        }
      }
      trackDetailsCache.set(trackId, cached ?? null)
      return cached ?? null
    } catch {
      return null
    }
  }

  const saveTrackCache = async (trackId: string, details: MusoTrackDetails | null) => {
    if (!details) return
    trackDetailsCache.set(trackId, details)
    try {
      const isrcs = Array.isArray(details.isrcs) ? details.isrcs : []
      await query(
        `
        INSERT INTO muso_track_cache (muso_track_id, data, spotify_preview_url, isrcs, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (muso_track_id)
        DO UPDATE SET
          data = EXCLUDED.data,
          spotify_preview_url = EXCLUDED.spotify_preview_url,
          isrcs = EXCLUDED.isrcs,
          updated_at = NOW()
        `,
        [
          trackId,
          JSON.stringify(details),
          details.spotifyPreviewUrl ?? null,
          isrcs,
        ]
      )
    } catch {
      // ignore cache failures
    }
  }

  const saveAlbumCache = async (album: { id?: string } | null | undefined) => {
    if (!album?.id) return
    try {
      await query(
        `
        INSERT INTO muso_album_cache (muso_album_id, data, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (muso_album_id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        `,
        [album.id, JSON.stringify(album)]
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
        return ['Composer']
      case 'mixer':
        return ['Mixer']
      case 'engineer':
        return ['Engineer']
      case 'artist':
        return ['Artist']
      case 'producer':
      default:
        return ['Producer']
    }
  }

  const fetchMusoResults = async () => {
    const { items: profiles } = await searchProfilesByName(name, { limit: profileSearchLimit, offset: 0 })
    const profile = profiles[0]
    if (!profile?.id) {
      return { results: [] as TrackResult[], totalCount: 0, profile: null }
    }
    const { items, totalCount } = await listProfileCredits({
      profileId: profile.id,
      credits: musoRoleCredits(role),
      limit,
      offset,
      sortKey: 'releaseDate',
      releaseDateStart: releaseDateStart ?? undefined,
      releaseDateEnd: releaseDateEnd ?? undefined,
    })
    const results: TrackResult[] = []
    for (const item of items) {
      const track = item.track || {}
      const album = item.album || {}
      await saveAlbumCache(album)

      const trackId = typeof track.id === 'string' ? track.id : ''
      let trackDetails = trackId ? await loadTrackCache(trackId) : null
      if (!trackDetails && trackId) {
        trackDetails = await getTrackDetailsById({ idKey: 'id', idValue: trackId })
        await saveTrackCache(trackId, trackDetails)
      }
      const artists = Array.isArray(trackDetails?.artists)
        ? trackDetails?.artists
        : (Array.isArray(item.artists) ? item.artists : [])
      const artistName = artists.map((artist) => artist?.name).filter(Boolean).join(', ')
      const releaseDate = typeof trackDetails?.releaseDate === 'string'
        ? trackDetails.releaseDate
        : (typeof item.releaseDate === 'string' ? item.releaseDate : '')
      const isrc = Array.isArray(trackDetails?.isrcs)
        ? trackDetails?.isrcs[0]
        : (Array.isArray(track.isrcs) ? track.isrcs[0] : undefined)

      results.push({
        id: track.id || 'unknown',
        title: trackDetails?.title || track.title || 'Unknown title',
        artist: artistName || 'Unknown artist',
        album: album.title || 'Unknown release',
        releaseType: undefined,
        year: releaseDate ? releaseDate.split('-')[0] : '',
        length: typeof trackDetails?.duration === 'number'
          ? trackDetails.duration
          : (typeof track.duration === 'number' ? track.duration : 0),
        isrc,
        releaseId: album.id || 'unknown',
        coverArtUrl: album.albumArt || null,
        previewUrl: trackDetails?.spotifyPreviewUrl || track.spotifyPreviewUrl || null,
        source: 'muso',
      })
    }
    return { results, totalCount, profile }
  }

  if (hasMusoApiKey()) {
    try {
      const { results, totalCount, profile } = await fetchMusoResults()
      if (stream) {
        const encoder = new TextEncoder()
        const streamBody = new ReadableStream({
          start: async (controller) => {
            const send = (payload: Record<string, unknown>) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
            }
            try {
              if (profile) {
                send({ type: 'profile', profile })
              }
              if (typeof totalCount === 'number') {
                send({ type: 'meta', totalWorks: totalCount })
              }
              results.forEach((track) => send({ type: 'result', track }))
              await saveCache(results, { profile, totalCount })
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

      await saveCache(results, { profile, totalCount })
      return NextResponse.json({
        releaseCount: totalCount,
        releaseOffset: offset,
        releaseLimit: limit,
        trackCount: results.length,
        results,
        profile,
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
    if (cached?.results && cached.results.length) {
      const encoder = new TextEncoder()
      const streamBody = new ReadableStream({
        start: async (controller) => {
          if (cached.profile) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'profile', profile: cached.profile })}\n\n`))
          }
          if (typeof cached.totalCount === 'number') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'meta', totalWorks: cached.totalCount })}\n\n`))
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'cached', results: cached.results })}\n\n`))
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', count: cached.results.length })}\n\n`))
          controller.close()
        },
      })

      void (async () => {
        if (hasMusoApiKey()) {
          try {
            const { results, profile, totalCount } = await fetchMusoResults()
            const merged = mergeResults(cached.results, results)
            await saveCache(merged, { profile, totalCount })
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
        const merged = mergeResults(cached.results, collected)
        await saveCache(merged, { profile: cached.profile ?? null, totalCount: cached.totalCount ?? null })
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
          const merged = mergeResults(existing?.results ?? null, collected)
          await saveCache(merged, { profile: existing?.profile ?? null, totalCount: existing?.totalCount ?? null })
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
      data: { name, role, limit, offset, releaseDateStart, releaseDateEnd },
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
})
