import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { ensureSuccessfulPreviewUrlForTrack } from '@/lib/bpm'
import { trackApiRequest, getCurrentUserId } from '@/lib/analytics'
import { logError, logInfo } from '@/lib/logger'

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
  urls?: Array<{ url: string; successful?: boolean }> | null
  isrc_mismatch: boolean
  debug_txt: string | null
}

// Helper function to get the selected BPM value from a cache record
function getSelectedBpm(record: CacheRecord): number | null {
  if (record.bpm_selected === 'manual' && record.bpm_manual != null) {
    return record.bpm_manual
  } else if (record.bpm_selected === 'librosa' && record.bpm_librosa != null) {
    return record.bpm_librosa
  } else if (record.bpm_essentia != null) {
    return record.bpm_essentia
  } else if (record.bpm_librosa != null) {
    return record.bpm_librosa
  }
  return null
}

// Helper function to get the selected key/scale from a cache record
function getSelectedKey(record: CacheRecord): { key: string | null; scale: string | null } {
  if (record.key_selected === 'manual') {
    return { key: record.key_manual, scale: record.scale_manual }
  } else if (record.key_selected === 'librosa' && record.key_librosa != null) {
    return { key: record.key_librosa, scale: record.scale_librosa }
  } else if (record.key_essentia != null) {
    return { key: record.key_essentia, scale: record.scale_essentia }
  } else if (record.key_librosa != null) {
    return { key: record.key_librosa, scale: record.scale_librosa }
  }
  return { key: null, scale: null }
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
      `SELECT spotify_track_id, isrc, 
        bpm_essentia, bpm_raw_essentia, bpm_confidence_essentia,
        bpm_librosa, bpm_raw_librosa, bpm_confidence_librosa,
        key_essentia, scale_essentia, keyscale_confidence_essentia,
        key_librosa, scale_librosa, keyscale_confidence_librosa,
        bpm_selected, bpm_manual, key_selected, key_manual, scale_manual,
        source, error, updated_at, urls, isrc_mismatch,
        debug_txt
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
      const selectedBpm = getSelectedBpm(record)
      // Only include valid cached results (not expired and not errors) for valid cache
      // Exclude records with ISRC mismatches as they are treated as errors
      if (selectedBpm !== null && ageDays < CACHE_TTL_DAYS && !record.isrc_mismatch) {
        validCacheMap.set(record.spotify_track_id, record)
      }
      // Also track records with errors (for showing error messages)
      // ISRC mismatches are treated as errors
      if (record.error || record.source === 'computed_failed' || record.isrc_mismatch) {
        errorCacheMap.set(record.spotify_track_id, record)
      }
    }

    // Build response with cached results
    const results: Record<string, {
      bpm: number | null
      source?: string
      bpmRaw?: number
      error?: string
      urls?: Array<{ url: string; successful?: boolean }>
      cached: boolean
      key?: string
      scale?: string
      keyConfidence?: number
      bpmConfidence?: number
      // Essentia fields
      bpmEssentia?: number | null
      bpmRawEssentia?: number | null
      bpmConfidenceEssentia?: number | null
      keyEssentia?: string | null
      scaleEssentia?: string | null
      keyscaleConfidenceEssentia?: number | null
      // Librosa fields
      bpmLibrosa?: number | null
      bpmRawLibrosa?: number | null
      bpmConfidenceLibrosa?: number | null
      keyLibrosa?: string | null
      scaleLibrosa?: string | null
      keyscaleConfidenceLibrosa?: number | null
      // Selection info
      bpmSelected?: 'essentia' | 'librosa' | 'manual'
      keySelected?: 'essentia' | 'librosa' | 'manual'
      bpmManual?: number | null
      keyManual?: string | null
      scaleManual?: string | null
      debugTxt?: string | null
    }> = {}

    // Helper to parse urls from JSONB
    const parseUrls = (urls: any): Array<{ url: string; successful?: boolean }> | undefined => {
      if (!urls) return undefined
      try {
        return Array.isArray(urls) ? urls : JSON.parse(urls)
      } catch (e) {
        return undefined
      }
    }

    const ensureUrls = async (
      trackId: string,
      urls: Array<{ url: string; successful?: boolean }> | undefined,
      errorMessage?: string | null
    ) => {
      if (!urls || urls.length === 0 || urls.some((entry) => entry.successful)) {
        return { urls, error: errorMessage }
      }
      return await ensureSuccessfulPreviewUrlForTrack({
        spotifyTrackId: trackId,
        urls,
        error: errorMessage,
        allowProbe: false,
      })
    }

    for (const trackId of limitedTrackIds) {
      const cached = validCacheMap.get(trackId)
      const errorRecord = errorCacheMap.get(trackId)
      const allCached = cacheMap.get(trackId)
      
      if (cached) {
        // Valid cached result with BPM
        const selectedBpm = getSelectedBpm(cached)
        const selectedKey = getSelectedKey(cached)
        const selectedBpmRaw = (cached.bpm_selected === 'librosa' && cached.bpm_raw_librosa) 
          ? cached.bpm_raw_librosa 
          : (cached.bpm_selected === 'manual' && cached.bpm_manual)
            ? cached.bpm_manual
            : cached.bpm_raw_essentia
        const selectedKeyConfidence = (cached.key_selected === 'librosa' && cached.keyscale_confidence_librosa) 
          ? cached.keyscale_confidence_librosa 
          : cached.keyscale_confidence_essentia
        const selectedBpmConfidence = (cached.bpm_selected === 'librosa' && cached.bpm_confidence_librosa) 
          ? cached.bpm_confidence_librosa 
          : cached.bpm_confidence_essentia
        const parsedUrls = parseUrls(cached.urls)
        const ensured = await ensureUrls(trackId, parsedUrls, null)
        
        results[trackId] = {
          bpm: selectedBpm,
          source: cached.source,
          bpmRaw: selectedBpmRaw || undefined,
          urls: ensured.urls,
          cached: true,
          key: selectedKey.key || undefined,
          scale: selectedKey.scale || undefined,
          keyConfidence: selectedKeyConfidence || undefined,
          bpmConfidence: selectedBpmConfidence || undefined,
          // Include all fields for modal
          bpmEssentia: cached.bpm_essentia,
          bpmRawEssentia: cached.bpm_raw_essentia,
          bpmConfidenceEssentia: cached.bpm_confidence_essentia,
          bpmLibrosa: cached.bpm_librosa,
          bpmRawLibrosa: cached.bpm_raw_librosa,
          bpmConfidenceLibrosa: cached.bpm_confidence_librosa,
          keyEssentia: cached.key_essentia,
          scaleEssentia: cached.scale_essentia,
          keyscaleConfidenceEssentia: cached.keyscale_confidence_essentia,
          keyLibrosa: cached.key_librosa,
          scaleLibrosa: cached.scale_librosa,
          keyscaleConfidenceLibrosa: cached.keyscale_confidence_librosa,
          bpmSelected: (cached.bpm_selected as 'essentia' | 'librosa' | 'manual') || 'essentia',
          keySelected: (cached.key_selected as 'essentia' | 'librosa' | 'manual') || 'essentia',
          bpmManual: cached.bpm_manual,
          keyManual: cached.key_manual,
          scaleManual: cached.scale_manual,
          debugTxt: cached.debug_txt,
        }
      } else if (errorRecord) {
        // Has error record - return error info even if expired
        // If ISRC mismatch, ensure error message is set
        let errorMessage = errorRecord.error
        if (errorRecord.isrc_mismatch && !errorMessage) {
          errorMessage = 'ISRC mismatch: Found preview URL but ISRC does not match Spotify track (wrong audio file)'
        }
        const selectedBpm = getSelectedBpm(errorRecord)
        const selectedKey = getSelectedKey(errorRecord)
        const parsedUrls = parseUrls(errorRecord.urls)
        const ensured = await ensureUrls(trackId, parsedUrls, errorMessage || null)
        results[trackId] = {
          bpm: selectedBpm,
          source: errorRecord.source,
          bpmRaw: (errorRecord.bpm_selected === 'librosa' && errorRecord.bpm_raw_librosa) 
            ? errorRecord.bpm_raw_librosa 
            : errorRecord.bpm_raw_essentia || undefined,
          error: ensured.error || errorMessage || undefined,
          urls: ensured.urls,
          cached: false, // Not valid cache, will need recalculation
          key: selectedKey.key || undefined,
          scale: selectedKey.scale || undefined,
          keyConfidence: (errorRecord.key_selected === 'librosa' && errorRecord.keyscale_confidence_librosa) 
            ? errorRecord.keyscale_confidence_librosa 
            : errorRecord.keyscale_confidence_essentia || undefined,
          bpmConfidence: (errorRecord.bpm_selected === 'librosa' && errorRecord.bpm_confidence_librosa) 
            ? errorRecord.bpm_confidence_librosa 
            : errorRecord.bpm_confidence_essentia || undefined,
          // Include all fields
          bpmEssentia: errorRecord.bpm_essentia,
          bpmRawEssentia: errorRecord.bpm_raw_essentia,
          bpmConfidenceEssentia: errorRecord.bpm_confidence_essentia,
          bpmLibrosa: errorRecord.bpm_librosa,
          bpmRawLibrosa: errorRecord.bpm_raw_librosa,
          bpmConfidenceLibrosa: errorRecord.bpm_confidence_librosa,
          keyEssentia: errorRecord.key_essentia,
          scaleEssentia: errorRecord.scale_essentia,
          keyscaleConfidenceEssentia: errorRecord.keyscale_confidence_essentia,
          keyLibrosa: errorRecord.key_librosa,
          scaleLibrosa: errorRecord.scale_librosa,
          keyscaleConfidenceLibrosa: errorRecord.keyscale_confidence_librosa,
          bpmSelected: (errorRecord.bpm_selected as 'essentia' | 'librosa' | 'manual') || 'essentia',
          keySelected: (errorRecord.key_selected as 'essentia' | 'librosa' | 'manual') || 'essentia',
          bpmManual: errorRecord.bpm_manual,
          keyManual: errorRecord.key_manual,
          scaleManual: errorRecord.scale_manual,
          debugTxt: errorRecord.debug_txt,
        }
      } else if (allCached) {
        // Cached but expired or has ISRC mismatch - return basic info
        // If ISRC mismatch, ensure error message is set
        let errorMessage = allCached.error
        if (allCached.isrc_mismatch && !errorMessage) {
          errorMessage = 'ISRC mismatch: Found preview URL but ISRC does not match Spotify track (wrong audio file)'
        }
        const selectedBpm = allCached.isrc_mismatch ? null : getSelectedBpm(allCached)
        const selectedKey = getSelectedKey(allCached)
        const parsedUrls = parseUrls(allCached.urls)
        const ensured = await ensureUrls(trackId, parsedUrls, errorMessage || null)
        results[trackId] = {
          bpm: selectedBpm, // Treat ISRC mismatch as null BPM
          source: allCached.source,
          bpmRaw: (allCached.bpm_selected === 'librosa' && allCached.bpm_raw_librosa) 
            ? allCached.bpm_raw_librosa 
            : allCached.bpm_raw_essentia || undefined,
          error: ensured.error || errorMessage || undefined,
          urls: ensured.urls,
          cached: false, // Not valid cache, will need recalculation
          key: selectedKey.key || undefined,
          scale: selectedKey.scale || undefined,
          keyConfidence: (allCached.key_selected === 'librosa' && allCached.keyscale_confidence_librosa) 
            ? allCached.keyscale_confidence_librosa 
            : allCached.keyscale_confidence_essentia || undefined,
          bpmConfidence: (allCached.bpm_selected === 'librosa' && allCached.bpm_confidence_librosa) 
            ? allCached.bpm_confidence_librosa 
            : allCached.bpm_confidence_essentia || undefined,
          // Include all fields
          bpmEssentia: allCached.bpm_essentia,
          bpmRawEssentia: allCached.bpm_raw_essentia,
          bpmConfidenceEssentia: allCached.bpm_confidence_essentia,
          bpmLibrosa: allCached.bpm_librosa,
          bpmRawLibrosa: allCached.bpm_raw_librosa,
          bpmConfidenceLibrosa: allCached.bpm_confidence_librosa,
          keyEssentia: allCached.key_essentia,
          scaleEssentia: allCached.scale_essentia,
          keyscaleConfidenceEssentia: allCached.keyscale_confidence_essentia,
          keyLibrosa: allCached.key_librosa,
          scaleLibrosa: allCached.scale_librosa,
          keyscaleConfidenceLibrosa: allCached.keyscale_confidence_librosa,
          bpmSelected: (allCached.bpm_selected as 'essentia' | 'librosa' | 'manual') || 'essentia',
          keySelected: (allCached.key_selected as 'essentia' | 'librosa' | 'manual') || 'essentia',
          bpmManual: allCached.bpm_manual,
          keyManual: allCached.key_manual,
          scaleManual: allCached.scale_manual,
          debugTxt: allCached.debug_txt,
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
