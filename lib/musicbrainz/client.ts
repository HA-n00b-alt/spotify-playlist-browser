import { MB_BASE_URL, USER_AGENT } from '../musicbrainz'

type MusicBrainzParams = Record<string, string | number | undefined>

const ROLE_FIELD_MAP: Record<string, string> = {
  songwriter: 'writer',
  mixer: 'mixer',
  engineer: 'engineer',
  artist: 'artist',
}

const MIN_REQUEST_INTERVAL_MS = 1100
const MB_CACHE_TTL_MS = 5 * 60 * 1000
const COVER_CACHE_TTL_MS = 60 * 60 * 1000
const rateLimiters = new Map<string, { lastRequestTime: number; queue: Promise<unknown> }>()
const responseCache = new Map<string, { expiresAt: number; value: unknown }>()
const coverArtCache = new Map<string, { expiresAt: number; value: string | null }>()

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

class MusicBrainzError extends Error {
  status?: number
  statusText?: string
  url?: string
  retryable?: boolean
  responseText?: string

  constructor(message: string, options?: Partial<MusicBrainzError>) {
    super(message)
    Object.assign(this, options)
  }
}

const scheduleRequest = async <T>(url: string, fn: () => Promise<T>): Promise<T> => {
  const host = new URL(url).host
  const limiter = rateLimiters.get(host) || { lastRequestTime: 0, queue: Promise.resolve() }
  const run = async () => {
    const now = Date.now()
    const waitTime = Math.max(0, MIN_REQUEST_INTERVAL_MS - (now - limiter.lastRequestTime))
    if (waitTime > 0) {
      await sleep(waitTime)
    }
    limiter.lastRequestTime = Date.now()
    return fn()
  }

  limiter.queue = limiter.queue.then(run, run)
  rateLimiters.set(host, limiter)
  return limiter.queue as Promise<T>
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
  const cached = responseCache.get(url)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T
  }
  if (cached) {
    responseCache.delete(url)
  }

  return scheduleRequest(url, async () => {
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
        const data = await response.json()
        responseCache.set(url, { expiresAt: Date.now() + MB_CACHE_TTL_MS, value: data })
        return data
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
      throw new MusicBrainzError(
        `MusicBrainz request failed: ${response.status} ${response.statusText}${errorText ? ` (${errorText.slice(0, 200)})` : ''}`,
        {
          status: response.status,
          statusText: response.statusText,
          url,
          retryable: false,
          responseText: errorText,
        }
      )
    }

    throw new MusicBrainzError('MusicBrainz request failed: Rate limited', {
      status: 429,
      url,
      retryable: true,
    })
  })
}

export async function fetchCoverArtUrl(releaseId: string): Promise<string | null> {
  try {
    const cached = coverArtCache.get(releaseId)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value
    }
    if (cached) {
      coverArtCache.delete(releaseId)
    }

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
    const imageUrl = frontImage?.image || null
    coverArtCache.set(releaseId, { expiresAt: Date.now() + COVER_CACHE_TTL_MS, value: imageUrl })
    return imageUrl
  } catch {
    return null
  }
}

export function buildCreditQuery(name: string, role: string): string {
  const field = ROLE_FIELD_MAP[role] ?? 'artist'
  return `${field}:"${name}"`
}

function isProducerRelation(relation: any, artistId: string): boolean {
  if (!relation || relation['target-type'] !== 'artist') {
    return false
  }

  const type = (relation.type || '').toLowerCase()
  const producerTypes = ['producer', 'additional producer', 'associate producer', 'co-producer', 'executive producer']

  if (!producerTypes.includes(type)) {
    return false
  }

  return relation.artist && relation.artist.id === artistId
}

async function fetchRecordingsByWork(params: {
  workId: string
  limit: number
  offset: number
}): Promise<{ count: number; offset: number; limit: number; recordings: any[] }> {
  const data = await fetchMusicBrainzJson<any>('/recording', {
    work: params.workId,
    limit: params.limit,
    offset: params.offset,
    fmt: 'json',
    inc: 'artist-credits+isrcs+releases+release-groups',
  })

  const recordings = Array.isArray(data?.recordings) ? data.recordings : []
  return {
    count: typeof data?.count === 'number' ? data.count : recordings.length,
    offset: typeof data?.offset === 'number' ? data.offset : params.offset,
    limit: typeof data?.limit === 'number' ? data.limit : params.limit,
    recordings,
  }
}

async function findArtistIdByName(name: string): Promise<string | null> {
  const data = await fetchMusicBrainzJson<any>('/artist', {
    query: `artist:"${name}"`,
    limit: 5,
    fmt: 'json',
  })
  const artists = Array.isArray(data?.artists) ? data.artists : []
  if (!artists.length) return null
  const exact = artists.find((artist: any) => typeof artist?.name === 'string' && artist.name.toLowerCase() === name.toLowerCase())
  const selectedId = exact?.id || artists[0]?.id || null
  if (!selectedId) return null

  try {
    const lookup = await fetchMusicBrainzJson<any>(`/artist/${encodeURIComponent(selectedId)}`, {
      fmt: 'json',
    })
    if (lookup?.id === selectedId) {
      return selectedId
    }
  } catch {
    return null
  }

  return null
}

function selectRepresentativeRecording(recordings: any[]): any | null {
  if (!Array.isArray(recordings) || recordings.length === 0) {
    return null
  }
  const noAttributeRecordings = recordings.filter((recording) => {
    const attributes = Array.isArray(recording?.attributes) ? recording.attributes : []
    return attributes.length === 0
  })
  const candidates = noAttributeRecordings.length > 0 ? noAttributeRecordings : recordings
  const withIds = candidates.filter((recording) => typeof recording?.id === 'string')
  if (withIds.length > 0) {
    return withIds.sort((a, b) => a.id.localeCompare(b.id))[0]
  }
  return candidates[0] ?? null
}

async function browseProducerWorksByArtist(params: {
  artistId: string
  limit: number
  offset: number
}): Promise<{ count: number; offset: number; limit: number; works: any[]; debug?: Record<string, unknown> }> {
  const batchLimit = Math.min(100, Math.max(params.limit, 25))
  let rawOffset = 0
  let rawTotal = Number.POSITIVE_INFINITY
  let scannedProducerCount = 0
  const works: any[] = []
  const requestUrls: string[] = []
  let iterations = 0

  while (rawOffset < rawTotal) {
    const requestParams = {
      artist: params.artistId,
      limit: batchLimit,
      offset: rawOffset,
      fmt: 'json',
      inc: 'artist-rels',
    }
    requestUrls.push(buildUrl('/work', requestParams))
    const data = await fetchMusicBrainzJson<any>('/work', requestParams)

    const rawWorks = Array.isArray(data?.works) ? data.works : []
    rawTotal = typeof data?.['work-count'] === 'number' ? data['work-count'] : rawWorks.length + rawOffset

    for (const work of rawWorks) {
      const relations = Array.isArray(work?.relations) ? work.relations : []
      const matches = relations.some((relation: any) => isProducerRelation(relation, params.artistId))
      if (!matches) continue
      scannedProducerCount += 1
      if (scannedProducerCount <= params.offset) {
        continue
      }
      if (works.length < params.offset + params.limit) {
        works.push(work)
      }
    }

    if (rawWorks.length === 0) {
      break
    }
    rawOffset += rawWorks.length
    iterations += 1
  }

  const reachedEnd = rawOffset >= rawTotal || rawTotal === 0
  const estimatedCount = reachedEnd
    ? scannedProducerCount
    : Math.max(scannedProducerCount, params.offset + works.length + 1)

  return {
    count: estimatedCount,
    offset: params.offset,
    limit: params.limit,
    works: works.slice(0, params.limit),
    debug: {
      artistId: params.artistId,
      batchLimit,
      iterations,
      rawOffset,
      rawTotal: Number.isFinite(rawTotal) ? rawTotal : null,
      scannedProducerCount,
      collectedCount: works.length,
      requestUrls,
    },
  }
}

async function browseProducerRecordingsByArtist(params: {
  artistId: string
  limit: number
  offset: number
}): Promise<{ count: number; offset: number; limit: number; recordings: any[]; debug?: Record<string, unknown> }> {
  const batchLimit = Math.min(100, Math.max(params.limit, 25))
  let rawOffset = 0
  let rawTotal = Number.POSITIVE_INFINITY
  let scannedProducerCount = 0
  const recordings: any[] = []
  const requestUrls: string[] = []
  let iterations = 0
  const maxIterations = Math.max(6, Math.ceil((params.offset + params.limit) / batchLimit) + 2)

  while (rawOffset < rawTotal && iterations < maxIterations && recordings.length < params.offset + params.limit) {
    const requestParams = {
      artist: params.artistId,
      limit: batchLimit,
      offset: rawOffset,
      fmt: 'json',
      inc: 'artist-credits+isrcs+artist-rels',
    }
    requestUrls.push(buildUrl('/recording', requestParams))
    const data = await fetchMusicBrainzJson<any>('/recording', requestParams)

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
    debug: {
      artistId: params.artistId,
      batchLimit,
      iterations,
      rawOffset,
      rawTotal: Number.isFinite(rawTotal) ? rawTotal : null,
      scannedProducerCount,
      collectedCount: recordings.length,
      requestUrls,
    },
  }
}

async function browseProducerReleasesByArtist(params: {
  artistId: string
  limit: number
  offset: number
}): Promise<{ count: number; offset: number; limit: number; releases: Array<{ id: string; title: string; date?: string }>; debug?: Record<string, unknown> }> {
  const batchLimit = Math.min(100, Math.max(params.limit, 25))
  let rawOffset = 0
  let rawTotal = Number.POSITIVE_INFINITY
  let scannedProducerCount = 0
  const releases: Array<{ id: string; title: string; date?: string }> = []
  const requestUrls: string[] = []
  let iterations = 0
  const maxIterations = Math.max(6, Math.ceil((params.offset + params.limit) / batchLimit) + 2)

  while (rawOffset < rawTotal && iterations < maxIterations && releases.length < params.offset + params.limit) {
    const requestParams = {
      artist: params.artistId,
      limit: batchLimit,
      offset: rawOffset,
      fmt: 'json',
      inc: 'artist-credits+artist-rels',
    }
    requestUrls.push(buildUrl('/release', requestParams))
    const data = await fetchMusicBrainzJson<any>('/release', requestParams)

    const rawReleases = Array.isArray(data?.releases) ? data.releases : []
    rawTotal = typeof data?.['release-count'] === 'number' ? data['release-count'] : rawReleases.length + rawOffset

    for (const release of rawReleases) {
      const relations = Array.isArray(release?.relations) ? release.relations : []
      const matches = relations.some((relation: any) => isProducerRelation(relation, params.artistId))
      if (!matches) continue
      scannedProducerCount += 1
      if (scannedProducerCount <= params.offset) {
        continue
      }
      if (releases.length < params.offset + params.limit) {
        releases.push({
          id: release?.id,
          title: release?.title || 'Unknown release',
          date: release?.date,
        })
      }
    }

    if (rawReleases.length === 0) {
      break
    }
    rawOffset += rawReleases.length
    iterations += 1
  }

  const reachedEnd = rawOffset >= rawTotal || rawTotal === 0
  const estimatedCount = reachedEnd
    ? scannedProducerCount
    : Math.max(scannedProducerCount, params.offset + releases.length + 1)

  return {
    count: estimatedCount,
    offset: params.offset,
    limit: params.limit,
    releases: releases.slice(0, params.limit),
    debug: {
      artistId: params.artistId,
      batchLimit,
      iterations,
      rawOffset,
      rawTotal: Number.isFinite(rawTotal) ? rawTotal : null,
      scannedProducerCount,
      collectedCount: releases.length,
      requestUrls,
    },
  }
}

async function searchProducerRecordingsByWorks(params: {
  artistId: string
  limit: number
  offset: number
}): Promise<{
  count: number
  offset: number
  limit: number
  recordings: any[]
  debug?: {
    artistId?: string
    worksScanned?: number
    worksProcessed?: number
    recordingsScanned?: number
    recordingsCollected?: number
    workBrowse?: Record<string, unknown> | null
    recordingByWorkUrls?: string[]
  }
}> {
  const workBatch = await browseProducerWorksByArtist({
    artistId: params.artistId,
    limit: 100,
    offset: 0,
  })

  const recordings: any[] = []
  const seenRecordingIds = new Set<string>()
  let scannedRecordings = 0
  let worksProcessed = 0
  const recordingByWorkUrls: string[] = []
  const workRecordingPageLimit = 100

  for (const work of workBatch.works) {
    if (!work?.id) continue
    worksProcessed += 1
    let workOffset = 0
    let totalForWork = Number.POSITIVE_INFINITY
    const recordingsForWork: any[] = []

    while (workOffset < totalForWork) {
      recordingByWorkUrls.push(buildUrl('/recording', {
        work: work.id,
        limit: workRecordingPageLimit,
        offset: workOffset,
        fmt: 'json',
        inc: 'artist-credits+isrcs+releases+release-groups',
      }))
      const workRecordings = await fetchRecordingsByWork({
        workId: work.id,
        limit: workRecordingPageLimit,
        offset: workOffset,
      })
      totalForWork = workRecordings.count
      scannedRecordings += workRecordings.recordings.length
      recordingsForWork.push(...workRecordings.recordings)
      if (workRecordings.recordings.length === 0) {
        break
      }
      workOffset += workRecordings.recordings.length
    }

    const representative = selectRepresentativeRecording(recordingsForWork)
    const recordingId = representative?.id
    if (!recordingId || seenRecordingIds.has(recordingId)) {
      continue
    }
    seenRecordingIds.add(recordingId)
    if (seenRecordingIds.size <= params.offset) {
      continue
    }
    recordings.push(representative)
  }

  return {
    count: Math.max(params.offset + recordings.length, workBatch.count),
    offset: params.offset,
    limit: params.limit,
    recordings: recordings.slice(0, params.limit),
    debug: {
      artistId: params.artistId,
      worksScanned: typeof workBatch.debug?.scannedProducerCount === 'number'
        ? workBatch.debug.scannedProducerCount
        : workBatch.works.length,
      worksProcessed,
      recordingsScanned: scannedRecordings,
      recordingsCollected: recordings.length,
      workBrowse: workBatch.debug ?? null,
      recordingByWorkUrls,
    },
  }
}

export async function searchRecordingsByCredit(params: {
  name: string
  role: string
  limit: number
  offset: number
}): Promise<{ count: number; offset: number; limit: number; recordings: any[]; debug?: Record<string, unknown> }> {
  if (params.role === 'producer') {
    const artistId = await findArtistIdByName(params.name)
    if (artistId) {
      const workResult = await searchProducerRecordingsByWorks({
        artistId,
        limit: params.limit,
        offset: params.offset,
      })
      if (workResult.recordings.length > 0 || (workResult.debug?.worksScanned ?? 0) > 0) {
        return workResult
      }

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
}): Promise<{ count: number; offset: number; limit: number; releases: Array<{ id: string; title: string; date?: string }>; debug?: Record<string, unknown> }> {
  if (params.role === 'producer') {
    const artistId = await findArtistIdByName(params.name)
    if (artistId) {
      return browseProducerReleasesByArtist({
        artistId,
        limit: params.limit,
        offset: params.offset,
      })
    }
  }

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
