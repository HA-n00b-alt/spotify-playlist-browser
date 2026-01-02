import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { trackApiRequest, getCurrentUserId } from '@/lib/analytics'

interface CacheRecord {
  spotify_track_id: string
  isrc: string | null
  bpm: number | null
  bpm_raw: number | null
  source: string
  error: string | null
  updated_at: Date
}

// Cache TTL: 90 days
const CACHE_TTL_DAYS = 90

export async function POST(request: Request) {
  const userId = await getCurrentUserId()
  
  try {
    const body = await request.json()
    const { trackIds } = body

    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      trackApiRequest(userId, '/api/bpm/batch', 'POST', 400).catch(() => {})
      return NextResponse.json(
        { error: 'trackIds array is required' },
        { status: 400 }
      )
    }

    // Limit batch size to prevent abuse
    const limitedTrackIds = trackIds.slice(0, 100)
    
    console.log(`[BPM Batch API] Fetching BPM for ${limitedTrackIds.length} tracks`)

    // Query cache for all tracks at once
    const cacheResults = await query<CacheRecord>(
      `SELECT spotify_track_id, isrc, bpm, bpm_raw, source, error, updated_at 
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
      isrc?: string
      bpmRaw?: number
      error?: string
      cached: boolean
    }> = {}

    for (const trackId of limitedTrackIds) {
      const cached = validCacheMap.get(trackId)
      const errorRecord = errorCacheMap.get(trackId)
      const allCached = cacheMap.get(trackId)
      
      if (cached) {
        // Valid cached result with BPM
        results[trackId] = {
          bpm: cached.bpm,
          source: cached.source,
          isrc: cached.isrc || undefined,
          bpmRaw: cached.bpm_raw || undefined,
          cached: true,
        }
      } else if (errorRecord) {
        // Has error record - return error info even if expired
        results[trackId] = {
          bpm: errorRecord.bpm,
          source: errorRecord.source,
          isrc: errorRecord.isrc || undefined,
          bpmRaw: errorRecord.bpm_raw || undefined,
          error: errorRecord.error || undefined,
          cached: false, // Not valid cache, will need recalculation
        }
      } else if (allCached) {
        // Cached but expired - return basic info
        results[trackId] = {
          bpm: allCached.bpm,
          source: allCached.source,
          isrc: allCached.isrc || undefined,
          bpmRaw: allCached.bpm_raw || undefined,
          cached: false, // Not valid cache, will need recalculation
        }
      } else {
        // Return null to indicate not cached (frontend can fetch individually if needed)
        results[trackId] = {
          bpm: null,
          cached: false,
        }
      }
    }

    console.log(`[BPM Batch API] Found ${cacheMap.size} cached results out of ${limitedTrackIds.length} tracks`)
    trackApiRequest(userId, '/api/bpm/batch', 'POST', 200).catch(() => {})
    
    return NextResponse.json({ results })
  } catch (error) {
    console.error(`[BPM Batch API] Error:`, error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch BPM batch'
    trackApiRequest(userId, '/api/bpm/batch', 'POST', 500).catch(() => {})
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}


