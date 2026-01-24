/*
  * DEBUGGING MUSO API
  *
  * The Muso API is deprecated and will be discontinued on January 31, 2024.
  * See the documentation: https://muso.ai/developers/docs/
  *
  * To test the Muso API from the command line, you can use the following `curl` command.
  * Replace YOUR_MUSO_API_KEY with your actual Muso API key from your environment variables.
  *
  * Test 'searchProfilesByName':
  * curl -X POST -H "x-api-key: YOUR_MUSO_API_KEY" -H "Content-Type: application/json" \
  *   "https://api.developer.muso.ai/v4/search" \
  *   --data '{"keyword":"John Doe","type":["profile"],"limit":5,"offset":0}'
  *
  * Test 'listProfileCredits':
  * curl -H "x-api-key: YOUR_MUSO_API_KEY" "https://api.developer.muso.ai/v4/profile/PROFILE_ID/credits"
  *
  * You will need to replace PROFILE_ID with a valid profile ID. You can get a profile ID by running the 'searchProfilesByName' command and extracting the 'id' from the response.
  *
  * Test 'getTrackDetailsByIsrc':
  * curl -H "x-api-key: YOUR_MUSO_API_KEY" "https://api.developer.muso.ai/v4/track/isrc/ISRC_CODE"
  *
  * You will need to replace ISRC_CODE with a valid ISRC. You can find ISRCs on the ISRC mismatch page in the application, or from other sources.
  *
  * Please execute this command in your terminal and check the output to understand if the API is reachable and if your key is valid.
*/
import { query } from './db'
import { logError, logInfo, logWarning } from './logger'

const MUSO_API_BASE = 'https://api.developer.muso.ai/v4'
const MUSO_PROVIDER = 'muso'

type MusoResponse<T> = {
  result?: string
  code?: number
  data?: T
}

type MusoProfile = {
  id: string
  name: string
  avatarUrl?: string | null
  commonCredits?: string[]
  creditCount?: number
  collaboratorsCount?: number
}

type MusoProfileCreditItem = {
  credits?: Array<{
    parent?: string
    child?: string
  }>
  track?: {
    id?: string
    title?: string
    spotifyPreviewUrl?: string | null
    spotifyId?: string | null
    isrcs?: string[]
    duration?: number
  }
  album?: {
    id?: string
    title?: string
    albumArt?: string | null
  }
  releaseDate?: string | null
  artists?: Array<{ name?: string }>
}

type MusoTrackDetails = {
  id?: string
  title?: string
  isrcs?: string[]
  spotifyId?: string | null
  spotifyPreviewUrl?: string | null
  releaseDate?: string | null
  duration?: number
  bpm?: number | null
  key?: string | null
  credits?: Array<{
    parent?: string
    credits?: Array<{
      child?: string
      collaborators?: Array<{ name?: string | null }>
    }>
  }>
  artists?: Array<{ name?: string }>
}

function getMusoApiKey() {
  return process.env.MUSO_API_KEY
}

export function hasMusoApiKey(): boolean {
  return Boolean(getMusoApiKey())
}

function getDailyLimit(): number {
  const raw = process.env.MUSO_API_DAILY_LIMIT
  const parsed = raw ? Number.parseInt(raw, 10) : 1000
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function getMusoUsageSnapshot(): Promise<{
  enabled: boolean
  used: number
  limit: number
  remaining: number
}> {
  const enabled = hasMusoApiKey()
  const limit = getDailyLimit()
  if (!enabled) {
    return { enabled: false, used: 0, limit, remaining: limit }
  }
  try {
    const today = getTodayDate()
    const rows = await query<{ request_count: number }>(
      'SELECT request_count FROM external_api_usage WHERE provider = $1 AND usage_date = $2',
      [MUSO_PROVIDER, today]
    )
    const used = rows[0]?.request_count ?? 0
    return { enabled: true, used, limit, remaining: Math.max(limit - used, 0) }
  } catch {
    return { enabled: true, used: 0, limit, remaining: limit }
  }
}

async function incrementUsage(): Promise<void> {
  const today = getTodayDate()
  await query(
    `INSERT INTO external_api_usage (provider, usage_date, request_count, updated_at)
     VALUES ($1, $2, 1, NOW())
     ON CONFLICT (provider, usage_date)
     DO UPDATE SET request_count = external_api_usage.request_count + 1, updated_at = NOW()`,
    [MUSO_PROVIDER, today]
  )
}

async function musoFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = getMusoApiKey()
  if (!apiKey) {
    throw new Error('MUSO_API_KEY is not configured')
  }
  const { used, limit } = await getMusoUsageSnapshot()
  if (used >= limit) {
    logWarning('Muso daily limit reached', { used, limit })
    throw new Error('MUSO_RATE_LIMIT')
  }
  await incrementUsage()
  const url = `${MUSO_API_BASE}${path}`
  const start = Date.now()
  const response = await fetch(url, {
    ...init,
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const durationMs = Date.now() - start
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    logError(new Error('Muso API request failed'), {
      provider: MUSO_PROVIDER,
      path,
      status: response.status,
      durationMs,
      errorText: text,
    })
    throw new Error(text || `Muso API error (${response.status})`)
  }
  logInfo('Muso API request completed', {
    provider: MUSO_PROVIDER,
    path,
    status: response.status,
    durationMs,
  })
  return response.json() as Promise<T>
}

export async function searchProfilesByName(
  name: string,
  options?: { limit?: number; offset?: number; debug?: boolean }
): Promise<{ items: MusoProfile[]; totalCount: number; raw?: unknown }> {
  const payload = await musoFetch<
    MusoResponse<{
      profiles?: { total?: number; items?: MusoProfile[] }
      items?: MusoProfile[]
      results?: MusoProfile[]
    }> | MusoProfile[]
  >('/search', {
    method: 'POST',
    body: JSON.stringify({
      keyword: name,
      type: ['profile'],
      limit: typeof options?.limit === 'number' ? options.limit : 5,
      offset: typeof options?.offset === 'number' ? options.offset : 0,
    }),
  })
  if (Array.isArray(payload)) {
    return { items: payload, totalCount: payload.length, raw: options?.debug ? payload : undefined }
  }
  const data = payload?.data
  if (Array.isArray(data)) {
    return { items: data, totalCount: data.length, raw: options?.debug ? payload : undefined }
  }
  if (Array.isArray(data?.profiles?.items)) {
    return {
      items: data.profiles.items,
      totalCount: typeof data.profiles.total === 'number' ? data.profiles.total : data.profiles.items.length,
      raw: options?.debug ? payload : undefined,
    }
  }
  const items = (data?.items || data?.results || []) as MusoProfile[]
  return { items, totalCount: items.length, raw: options?.debug ? payload : undefined }
}

export async function listProfileCredits(params: {
  profileId: string
  credits?: string[]
  limit?: number
  offset?: number
  keyword?: string
  sortKey?: string
  releaseDateStart?: string
  releaseDateEnd?: string
  debug?: boolean
}): Promise<{ items: MusoProfileCreditItem[]; totalCount: number; raw?: unknown }> {
  const search = new URLSearchParams()
  if (params.keyword) {
    search.set('keyword', params.keyword)
  }
  if (params.credits && params.credits.length > 0) {
    params.credits.forEach((credit) => search.append('credit', credit))
  }
  if (params.sortKey) {
    search.set('sortKey', params.sortKey)
  }
  if (params.releaseDateStart) {
    search.set('releaseDateStart', params.releaseDateStart)
  }
  if (params.releaseDateEnd) {
    search.set('releaseDateEnd', params.releaseDateEnd)
  }
  if (typeof params.limit === 'number') {
    search.set('limit', String(params.limit))
  }
  if (typeof params.offset === 'number') {
    search.set('offset', String(params.offset))
  }
  const payload = await musoFetch<MusoResponse<{ items?: MusoProfileCreditItem[]; totalCount?: number }>>(
    `/profile/${encodeURIComponent(params.profileId)}/credits?${search.toString()}`
  )
  const items = Array.isArray(payload?.data?.items) ? payload.data.items : []
  const totalCount = typeof payload?.data?.totalCount === 'number' ? payload.data.totalCount : items.length
  return { items, totalCount, raw: params.debug ? payload : undefined }
}

export async function getTrackDetailsByIsrc(isrc: string): Promise<MusoTrackDetails | null> {
  const payload = await musoFetch<MusoResponse<MusoTrackDetails>>(`/track/isrc/${encodeURIComponent(isrc)}`)
  return payload?.data ?? null
}

export async function getTrackDetailsById(params: {
  idKey: string
  idValue: string
}): Promise<MusoTrackDetails | null> {
  const payload = await musoFetch<MusoResponse<MusoTrackDetails>>(
    `/track/${encodeURIComponent(params.idKey)}/${encodeURIComponent(params.idValue)}`
  )
  return payload?.data ?? null
}

export type { MusoProfileCreditItem, MusoTrackDetails }
