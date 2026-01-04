import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { trackApiRequest, getCurrentUserId } from '@/lib/analytics'
import { logError, logInfo } from '@/lib/logger'

export const dynamic = 'force-dynamic'

interface CacheRecord {
  spotify_track_id: string
  isrc: string | null
  bpm: number | null
  bpm_raw: number | null
  source: string
  error: string | null
  updated_at: Date
  urls_tried?: string[] | null
  successful_url?: string | null
  isrc_mismatch: boolean
  key?: string | null
  scale?: string | null
  key_confidence?: number | null
}

// Cache TTL: 90 days
const CACHE_TTL_DAYS = 90

export async function POST(request: Request) {
  const userId = await getCurrentUserId()
  let trackIds: string[] | undefined
  
  try {
    const body = await request.json()
    trackIds = body.trackIds

    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      trackApiRequest(userId, '/api/bpm/batch', 'POST', 400).catch(() => {})
      return NextResponse.json(
        { error: 'trackIds array is required' },
        { status: 400 }
      )
    }

    // Limit batch size to prevent abuse
    const limitedTrackIds = trackIds.slice(0, 100)
    
    logInfo('Fetching BPM batch', {
      component: 'api.bpm.batch',
      userId: userId || 'anonymous',
      trackCount: limitedTrackIds.length,
      originalCount: trackIds.length,
    })

    // Query cache for all tracks at once
    const cacheResults = await query<CacheRecord>(
      `SELECT spotify_track_id, isrc, bpm, bpm_raw, source, error, updated_at, urls_tried, successful_url, isrc_mismatch, key, scale, key_confidence
       FROM track_bpm_cache 
       WHERE spotify_track_id = ANY($1)`,
      [limitedTrackIds]
    )

    // Build a map of all cached results (including errors)
    const cacheMap = new Map<string, CacheRecord>()
    const validCacheMap = new Map<string, CacheRecord>()
    const errorCacheMap = new Map<string, CacheRecord>() // Records with errors (even if expired)
    const now = Date.now()
    
    for (const record of cacheResults) {
      const ageDays = (now - new Date(record.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      cacheMap.set(record.spotify_track_id, record)
      // Only include valid cached results (not expired and not errors) for valid cache
      if (record.bpm !== null && ageDays < CACHE_TTL_DAYS) {
        validCacheMap.set(record.spotify_track_id, record)
      }
      // Also track records with errors (for showing error messages)
      if (record.error || record.source === 'computed_failed') {
        errorCacheMap.set(record.spotify_track_id, record)
      }
    }

    // Build response with cached results
    const results: Record<string, {
      bpm: number | null
      source?: string
      bpmRaw?: number
      error?: string
      urlsTried?: string[]
      successfulUrl?: string | null
      cached: boolean
      key?: string
      scale?: string
      keyConfidence?: number
    }> = {}

    // Helper to parse urls_tried from JSONB
    const parseUrlsTried = (urlsTried: any): string[] | undefined => {
      if (!urlsTried) return undefined
      try {
        return Array.isArray(urlsTried) ? urlsTried : JSON.parse(urlsTried)
      } catch (e) {
        return undefined
      }
    }

    for (const trackId of limitedTrackIds) {
      const cached = validCacheMap.get(trackId)
      const errorRecord = errorCacheMap.get(trackId)
      const allCached = cacheMap.get(trackId)
      
      if (cached) {
        // Valid cached result with BPM
        results[trackId] = {
          bpm: cached.bpm,
          source: cached.source,
          bpmRaw: cached.bpm_raw || undefined,
          urlsTried: parseUrlsTried(cached.urls_tried),
          successfulUrl: cached.successful_url || undefined,
          cached: true,
          key: cached.key || undefined,
          scale: cached.scale || undefined,
          keyConfidence: cached.key_confidence || undefined,
        }
      } else if (errorRecord) {
        // Has error record - return error info even if expired
        results[trackId] = {
          bpm: errorRecord.bpm,
          source: errorRecord.source,
          bpmRaw: errorRecord.bpm_raw || undefined,
          error: errorRecord.error || undefined,
          urlsTried: parseUrlsTried(errorRecord.urls_tried),
          successfulUrl: errorRecord.successful_url || undefined,
          cached: false, // Not valid cache, will need recalculation
          key: errorRecord.key || undefined,
          scale: errorRecord.scale || undefined,
          keyConfidence: errorRecord.key_confidence || undefined,
        }
      } else if (allCached) {
        // Cached but expired - return basic info
        results[trackId] = {
          bpm: allCached.bpm,
          source: allCached.source,
          bpmRaw: allCached.bpm_raw || undefined,
          urlsTried: parseUrlsTried(allCached.urls_tried),
          successfulUrl: allCached.successful_url || undefined,
          cached: false, // Not valid cache, will need recalculation
          key: allCached.key || undefined,
          scale: allCached.scale || undefined,
          keyConfidence: allCached.key_confidence || undefined,
        }
      } else {
        // Return null to indicate not cached (frontend can fetch individually if needed)
        results[trackId] = {
          bpm: null,
          cached: false,
        }
      }
    }

    logInfo('BPM batch fetch completed', {
      component: 'api.bpm.batch',
      userId: userId || 'anonymous',
      trackCount: limitedTrackIds.length,
      cachedCount: cacheMap.size,
    })
    trackApiRequest(userId, '/api/bpm/batch', 'POST', 200).catch(() => {})
    
    return NextResponse.json({ results })
  } catch (error) {
    logError(error, {
      component: 'api.bpm.batch',
      userId: userId || 'anonymous',
      trackCount: trackIds?.length || 0,
      status: 500,
    })
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch BPM batch'
    trackApiRequest(userId, '/api/bpm/batch', 'POST', 500).catch(() => {})
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}


