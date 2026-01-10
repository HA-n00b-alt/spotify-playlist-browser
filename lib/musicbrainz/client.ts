import { MB_BASE_URL, USER_AGENT } from '../musicbrainz'

type MusicBrainzParams = Record<string, string | number | undefined>

const ROLE_FIELD_MAP: Record<string, string> = {
  producer: 'producer',
  songwriter: 'writer',
  mixer: 'mixer',
  engineer: 'engineer',
  artist: 'artist',
}

const MIN_REQUEST_INTERVAL_MS = 1100
let lastRequestTime = 0
let requestQueue: Promise<unknown> = Promise.resolve()

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const scheduleRequest = async <T>(fn: () => Promise<T>): Promise<T> => {
  const run = async () => {
    const now = Date.now()
    const waitTime = Math.max(0, MIN_REQUEST_INTERVAL_MS - (now - lastRequestTime))
    if (waitTime > 0) {
      await sleep(waitTime)
    }
    lastRequestTime = Date.now()
    return fn()
  }

  requestQueue = requestQueue.then(run, run)
  return requestQueue as Promise<T>
}

function buildUrl(path: string, params?: MusicBrainzParams): string {
  const url = new URL(`${MB_BASE_URL}${path}`)
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined) return
    url.searchParams.set(key, String(value))
  })
  return url.toString()
}

export async function fetchMusicBrainzJson<T>(path: string, params?: MusicBrainzParams): Promise<T> {
  const url = buildUrl(path, params)
  return scheduleRequest(async () => {
    const maxAttempts = 3

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        cache: 'no-store',
      })

      if (response.ok) {
        return response.json()
      }

      if (response.status === 429 || response.status === 503) {
        const retryAfter = response.headers.get('Retry-After')
        const retrySeconds = retryAfter ? Number(retryAfter) : NaN
        const backoffMs = Number.isFinite(retrySeconds)
          ? retrySeconds * 1000
          : 500 * Math.pow(2, attempt)
        await sleep(backoffMs)
        continue
      }

      const errorText = await response.text().catch(() => '')
      throw new Error(
        `MusicBrainz request failed: ${response.status} ${response.statusText}${errorText ? ` (${errorText.slice(0, 200)})` : ''}`
      )
    }

    throw new Error('MusicBrainz request failed: Rate limited')
  })
}

export async function fetchCoverArtUrl(releaseId: string): Promise<string | null> {
  try {
    const response = await fetch(`https://coverartarchive.org/release/${encodeURIComponent(releaseId)}`, {
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    const images = Array.isArray(data?.images) ? data.images : []
    const frontImage = images.find((image: any) => image?.front) || images[0]
    if (!frontImage?.image) return null
    return frontImage.image
  } catch {
    return null
  }
}

export function buildCreditQuery(name: string, role: string): string {
  const field = ROLE_FIELD_MAP[role] ?? 'artist'
  return `${field}:"${name}"`
}

function isProducerRelation(relation: any, artistId: string): boolean {
  if (!relation || !artistId) return false
  const type = typeof relation?.type === 'string' ? relation.type.toLowerCase() : ''
  const relationArtistId = relation?.artist?.id
  if (!relationArtistId || relationArtistId !== artistId) return false
  return type === 'producer' || type.includes('producer')
}

async function findArtistIdByName(name: string): Promise<string | null> {
  const data = await fetchMusicBrainzJson<any>('/artist', {
    query: `artist:"${name}"`,
    limit: 1,
    fmt: 'json',
  })
  const artists = Array.isArray(data?.artists) ? data.artists : []
  if (!artists[0]?.id) return null
  return artists[0].id
}

async function browseProducerRecordingsByArtist(params: {
  artistId: string
  limit: number
  offset: number
}): Promise<{ count: number; offset: number; limit: number; recordings: any[] }> {
  const batchLimit = Math.min(100, Math.max(params.limit, 25))
  let rawOffset = 0
  let rawTotal = Number.POSITIVE_INFINITY
  let scannedProducerCount = 0
  const recordings: any[] = []
  let iterations = 0
  const maxIterations = 6

  while (rawOffset < rawTotal && iterations < maxIterations && recordings.length < params.offset + params.limit) {
    const data = await fetchMusicBrainzJson<any>('/recording', {
      artist: params.artistId,
      limit: batchLimit,
      offset: rawOffset,
      fmt: 'json',
      inc: 'artist-credits+isrcs+artist-rels',
    })

    const rawRecordings = Array.isArray(data?.recordings) ? data.recordings : []
    rawTotal = typeof data?.['recording-count'] === 'number' ? data['recording-count'] : rawRecordings.length + rawOffset

    for (const recording of rawRecordings) {
      const relations = Array.isArray(recording?.relations) ? recording.relations : []
      const matches = relations.some((relation: any) => isProducerRelation(relation, params.artistId))
      if (!matches) continue
      scannedProducerCount += 1
      if (scannedProducerCount <= params.offset) {
        continue
      }
      if (recordings.length < params.offset + params.limit) {
        recordings.push(recording)
      }
    }

    if (rawRecordings.length === 0) {
      break
    }
    rawOffset += rawRecordings.length
    iterations += 1
  }

  const reachedEnd = rawOffset >= rawTotal || rawTotal === 0
  const estimatedCount = reachedEnd
    ? scannedProducerCount
    : Math.max(scannedProducerCount, params.offset + recordings.length + 1)

  return {
    count: estimatedCount,
    offset: params.offset,
    limit: params.limit,
    recordings: recordings.slice(0, params.limit),
  }
}

export async function searchRecordingsByCredit(params: {
  name: string
  role: string
  limit: number
  offset: number
}): Promise<{ count: number; offset: number; limit: number; recordings: any[] }> {
  if (params.role === 'producer') {
    const artistId = await findArtistIdByName(params.name)
    if (artistId) {
      return browseProducerRecordingsByArtist({
        artistId,
        limit: params.limit,
        offset: params.offset,
      })
    }
  }

  let query = buildCreditQuery(params.name, params.role)

  if (params.role === 'artist') {
    const artistId = await findArtistIdByName(params.name)
    if (artistId) {
      query = `arid:${artistId}`
    }
  }

  const data = await fetchMusicBrainzJson<any>('/recording', {
    query,
    limit: params.limit,
    offset: params.offset,
    fmt: 'json',
    inc: 'artist-credits+isrcs',
  })

  const recordings = Array.isArray(data?.recordings) ? data.recordings : []
  return {
    count: typeof data?.count === 'number' ? data.count : recordings.length,
    offset: typeof data?.offset === 'number' ? data.offset : params.offset,
    limit: typeof data?.limit === 'number' ? data.limit : params.limit,
    recordings,
  }
}

export async function searchReleasesByCredit(params: {
  name: string
  role: string
  limit: number
  offset: number
}): Promise<{ count: number; offset: number; limit: number; releases: Array<{ id: string; title: string; date?: string }> }> {
  const query = buildCreditQuery(params.name, params.role)
  const data = await fetchMusicBrainzJson<any>('/release', {
    query,
    limit: params.limit,
    offset: params.offset,
    fmt: 'json',
  })

  const releases = Array.isArray(data?.releases) ? data.releases : []
  return {
    count: typeof data?.count === 'number' ? data.count : releases.length,
    offset: typeof data?.offset === 'number' ? data.offset : params.offset,
    limit: typeof data?.limit === 'number' ? data.limit : params.limit,
    releases: releases
      .map((release: any) => ({
        id: release?.id,
        title: release?.title || 'Unknown release',
        date: release?.date,
      }))
      .filter((release: any) => typeof release.id === 'string'),
  }
}

export async function fetchReleaseDetails(releaseId: string): Promise<any> {
  return fetchMusicBrainzJson<any>(`/release/${encodeURIComponent(releaseId)}`, {
    fmt: 'json',
    inc: 'recordings+artist-credits+artist-rels+recording-rels+work-rels+isrcs',
  })
}

function extractRelationNames(relations: any[]): string[] {
  return relations
    .map((rel: any) => rel?.artist?.name || rel?.name || rel?.target)
    .filter((name: any) => typeof name === 'string')
}

export function releaseMatchesCreditName(release: any, nameLower: string): boolean {
  const releaseRelations = Array.isArray(release?.relations) ? release.relations : []
  const releaseNames = extractRelationNames(releaseRelations)
  return releaseNames.some((name) => name.toLowerCase().includes(nameLower))
}

export function recordingMatchesCreditName(recording: any, nameLower: string): boolean {
  const recordingRelations = Array.isArray(recording?.relations) ? recording.relations : []
  const recordingNames = extractRelationNames(recordingRelations)

  const workRelations: any[] = []
  recordingRelations.forEach((rel: any) => {
    const workRels = Array.isArray(rel?.work?.relations) ? rel.work.relations : []
    workRelations.push(...workRels)
  })
  const workNames = extractRelationNames(workRelations)

  return [...recordingNames, ...workNames].some((name) => name.toLowerCase().includes(nameLower))
}
