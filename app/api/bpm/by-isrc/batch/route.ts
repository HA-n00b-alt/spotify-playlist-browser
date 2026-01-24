import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getCurrentUserId, trackApiRequest } from '@/lib/analytics'
import { withApiLogging } from '@/lib/logger'

export const dynamic = 'force-dynamic'

interface CacheRecord {
  spotify_track_id: string
  isrc: string | null
  bpm_essentia: number | null
  bpm_raw_essentia: number | null
  bpm_confidence_essentia: number | null
  bpm_librosa: number | null
  bpm_raw_librosa: number | null
  bpm_confidence_librosa: number | null
  key_essentia: string | null
  scale_essentia: string | null
  keyscale_confidence_essentia: number | null
  key_librosa: string | null
  scale_librosa: string | null
  keyscale_confidence_librosa: number | null
  bpm_selected: string | null
  bpm_manual: number | null
  key_selected: string | null
  key_manual: string | null
  scale_manual: string | null
  source: string
  error: string | null
  updated_at: Date
  urls?: Array<{ url: string; successful?: boolean; isrc?: string }> | null
  isrc_mismatch: boolean
  isrc_mismatch_review_status: string | null
  debug_txt: string | null
}

function getSelectedBpm(record: CacheRecord): number | null {
  if (record.bpm_selected === 'manual' && record.bpm_manual != null) {
    return record.bpm_manual
  }
  if (record.bpm_selected === 'librosa' && record.bpm_librosa != null) {
    return record.bpm_librosa
  }
  if (record.bpm_essentia != null) {
    return record.bpm_essentia
  }
  if (record.bpm_librosa != null) {
    return record.bpm_librosa
  }
  return null
}

function getSelectedKey(record: CacheRecord): { key: string | null; scale: string | null } {
  if (record.key_selected === 'manual') {
    return { key: record.key_manual, scale: record.scale_manual }
  }
  if (record.key_selected === 'librosa' && record.key_librosa != null) {
    return { key: record.key_librosa, scale: record.scale_librosa }
  }
  if (record.key_essentia != null) {
    return { key: record.key_essentia, scale: record.scale_essentia }
  }
  if (record.key_librosa != null) {
    return { key: record.key_librosa, scale: record.scale_librosa }
  }
  return { key: null, scale: null }
}

const CACHE_TTL_DAYS = 90

export const POST = withApiLogging(async (request: Request) => {
  const userId = await getCurrentUserId()
  const body = await request.json().catch(() => ({}))
  const isrcs = Array.isArray(body?.isrcs) ? body.isrcs.filter((value: any) => typeof value === 'string') : []

  if (isrcs.length === 0) {
    trackApiRequest(userId, '/api/bpm/by-isrc/batch', 'POST', 400).catch(() => {})
    return NextResponse.json({ error: 'isrcs array is required' }, { status: 400 })
  }

  const limitedIsrcs = isrcs.slice(0, 200)
  const rows = await query<CacheRecord>(
    `
      SELECT DISTINCT ON (isrc)
        spotify_track_id,
        isrc,
        bpm_essentia, bpm_raw_essentia, bpm_confidence_essentia,
        bpm_librosa, bpm_raw_librosa, bpm_confidence_librosa,
        key_essentia, scale_essentia, keyscale_confidence_essentia,
        key_librosa, scale_librosa, keyscale_confidence_librosa,
        bpm_selected, bpm_manual, key_selected, key_manual, scale_manual,
        source, error, updated_at, urls, isrc_mismatch, isrc_mismatch_review_status,
        debug_txt
      FROM track_bpm_cache
      WHERE isrc = ANY($1)
      ORDER BY isrc, updated_at DESC
    `,
    [limitedIsrcs]
  )

  const recordMap = new Map<string, CacheRecord>()
  rows.forEach((row) => {
    if (row.isrc) {
      recordMap.set(row.isrc, row)
    }
  })

  const results: Record<string, any> = {}
  const now = Date.now()
  const mismatchErrorMessage = 'ISRC mismatch: Found preview URL but ISRC does not match Spotify track (wrong audio file)'
  const parseUrls = (urls: any): Array<{ url: string; successful?: boolean; isrc?: string }> | undefined => {
    if (!urls) return undefined
    try {
      return Array.isArray(urls) ? urls : JSON.parse(urls)
    } catch {
      return undefined
    }
  }

  for (const isrc of limitedIsrcs) {
    const record = recordMap.get(isrc)
    if (!record) {
      results[isrc] = { bpm: null, cached: false }
      continue
    }

    const ageDays = (now - new Date(record.updated_at).getTime()) / (1000 * 60 * 60 * 24)
    const isMismatchResolved = record.isrc_mismatch_review_status === 'match'
    const isMismatch = record.isrc_mismatch && !isMismatchResolved
    const selectedBpm = isMismatch ? null : getSelectedBpm(record)
    const selectedKey = getSelectedKey(record)
    const errorMessage = isMismatch && !record.error ? mismatchErrorMessage : record.error
    const cached = Boolean(selectedBpm != null && ageDays < CACHE_TTL_DAYS && !isMismatch && !record.error)
    const parsedUrls = parseUrls(record.urls)

    results[isrc] = {
      spotifyTrackId: record.spotify_track_id,
      bpm: selectedBpm,
      source: record.source,
      error: errorMessage || undefined,
      urls: parsedUrls,
      cached,
      key: selectedKey.key || undefined,
      scale: selectedKey.scale || undefined,
      keyConfidence: (record.key_selected === 'librosa' && record.keyscale_confidence_librosa)
        ? record.keyscale_confidence_librosa
        : record.keyscale_confidence_essentia || undefined,
      bpmConfidence: (record.bpm_selected === 'librosa' && record.bpm_confidence_librosa)
        ? record.bpm_confidence_librosa
        : record.bpm_confidence_essentia || undefined,
      bpmEssentia: record.bpm_essentia,
      bpmRawEssentia: record.bpm_raw_essentia,
      bpmConfidenceEssentia: record.bpm_confidence_essentia,
      bpmLibrosa: record.bpm_librosa,
      bpmRawLibrosa: record.bpm_raw_librosa,
      bpmConfidenceLibrosa: record.bpm_confidence_librosa,
      keyEssentia: record.key_essentia,
      scaleEssentia: record.scale_essentia,
      keyscaleConfidenceEssentia: record.keyscale_confidence_essentia,
      keyLibrosa: record.key_librosa,
      scaleLibrosa: record.scale_librosa,
      keyscaleConfidenceLibrosa: record.keyscale_confidence_librosa,
      bpmSelected: (record.bpm_selected as 'essentia' | 'librosa' | 'manual') || 'essentia',
      keySelected: (record.key_selected as 'essentia' | 'librosa' | 'manual') || 'essentia',
      bpmManual: record.bpm_manual,
      keyManual: record.key_manual,
      scaleManual: record.scale_manual,
      debugTxt: record.debug_txt,
    }
  }

  trackApiRequest(userId, '/api/bpm/by-isrc/batch', 'POST', 200).catch(() => {})
  return NextResponse.json({ results })
})
