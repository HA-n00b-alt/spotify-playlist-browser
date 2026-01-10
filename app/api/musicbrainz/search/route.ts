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
  releaseType?: string
  year: string
  length: number
  isrc?: string
  releaseId: string
  coverArtUrl?: string | null
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
  const debugSteps: Array<{ step: number; name: string; data?: Record<string, unknown> }> = []

  if (!name) {
    return NextResponse.json({ error: 'Missing name parameter' }, { status: 400 })
  }

  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 25
  const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0
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
        const releases = Array.isArray(recording?.releases) ? recording.releases : []
        const releaseSelection = selectReleaseInfo(releases)
        const release = releaseSelection.release
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
          releaseType: releaseSelection.releaseType,
          year,
          length: typeof recording?.length === 'number' ? recording.length : 0,
          isrc,
          releaseId,
          coverArtUrl,
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
