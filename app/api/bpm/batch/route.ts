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

    // Build a map of cached results
    const cacheMap = new Map<string, CacheRecord>()
    const now = Date.now()
    
    for (const record of cacheResults) {
      const ageDays = (now - new Date(record.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      // Only include valid cached results (not expired and not errors)
      if (record.bpm !== null && ageDays < CACHE_TTL_DAYS) {
        cacheMap.set(record.spotify_track_id, record)
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
      const cached = cacheMap.get(trackId)
      if (cached) {
        results[trackId] = {
          bpm: cached.bpm,
          source: cached.source,
          isrc: cached.isrc || undefined,
          bpmRaw: cached.bpm_raw || undefined,
          cached: true,
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

