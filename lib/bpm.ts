import { query } from './db'
import { getTrack } from './spotify'
import { GoogleAuth } from 'google-auth-library'
import { isValidSpotifyTrackId } from './spotify-validation'

interface PreviewUrlResult {
  url: string | null
  source: string
  urlsTried: string[] // URLs that were attempted
  successfulUrl: string | null // URL that succeeded (or null if all failed)
  isrcMismatch?: boolean // True when ISRC from search results doesn't match Spotify ISRC
}

export interface StreamingPreviewMeta {
  source: string
  urlsTried?: string[]
  successfulUrl?: string | null
  isrcMismatch?: boolean
}

interface BpmResult {
  bpm: number | null
  source: string
  upc?: string
  bpmRaw?: number
  error?: string
  urlsTried?: string[]
  successfulUrl?: string | null
  key?: string
  scale?: string
  keyConfidence?: number
  bpmConfidence?: number
  // Full details for modal
  bpmEssentia?: number | null
  bpmRawEssentia?: number | null
  bpmConfidenceEssentia?: number | null
  bpmLibrosa?: number | null
  bpmRawLibrosa?: number | null
  bpmConfidenceLibrosa?: number | null
  keyEssentia?: string | null
  scaleEssentia?: string | null
  keyscaleConfidenceEssentia?: number | null
  keyLibrosa?: string | null
  scaleLibrosa?: string | null
  keyscaleConfidenceLibrosa?: number | null
  bpmSelected?: 'essentia' | 'librosa' | 'manual'
  keySelected?: 'essentia' | 'librosa' | 'manual'
  bpmManual?: number | null
  keyManual?: string | null
  scaleManual?: string | null
  debugTxt?: string | null
}

interface CacheRecord {
  id: number
  spotify_track_id: string
  isrc: string | null
  artist: string | null
  title: string | null
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
  updated_at: Date
  error: string | null
  urls_tried?: string[] | null
  successful_url?: string | null
  isrc_mismatch: boolean
  debug_txt: string | null
}

// In-flight computation locks to prevent duplicate work
const inFlightComputations = new Map<string, Promise<BpmResult>>()

// Cache TTL: 90 days
const CACHE_TTL_DAYS = 90

/**
 * Extract identifiers from Spotify track
 */
async function extractSpotifyIdentifiers(spotifyTrackId: string): Promise<{
  isrc: string | null
  title: string
  artists: string
  spotifyPreviewUrl: string | null
}> {
  console.log(`[BPM Module] Fetching track data from Spotify for: ${spotifyTrackId}`)
  const track = await getTrack(spotifyTrackId)
  console.log(`[BPM Module] Track data received:`, {
    name: track.name,
    hasISRC: !!track.external_ids?.isrc,
    isrc: track.external_ids?.isrc,
    hasPreview: !!track.preview_url,
    artists: track.artists?.map((a: any) => a.name).join(', '),
  })
  
  return {
    isrc: track.external_ids?.isrc || null,
    title: track.name,
    artists: track.artists.map((a: any) => a.name).join(' '),
    spotifyPreviewUrl: track.preview_url || null,
  }
}

/**
 * Helper function to get the selected BPM value from a cache record
 */
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

/**
 * Helper function to get the selected key/scale from a cache record
 */
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

/**
 * Check cache for existing BPM data
 * Tries ISRC first if available, then falls back to spotify_track_id
 */
async function checkCache(
  spotifyTrackId: string,
  isrc: string | null
): Promise<CacheRecord | null> {
  console.log(`[BPM Module] Checking cache for track: ${spotifyTrackId}, ISRC: ${isrc || 'none'}`)
  
  // Try ISRC first if available (more accurate cross-platform matching)
  if (isrc) {
    const isrcResults = await query<CacheRecord>(
      `SELECT * FROM track_bpm_cache WHERE isrc = $1 LIMIT 1`,
      [isrc]
    )
      console.log(`[BPM Module] ISRC cache query result: ${isrcResults.length} records`)
      if (isrcResults.length > 0) {
        const record = isrcResults[0]
        const ageDays = (Date.now() - new Date(record.updated_at).getTime()) / (1000 * 60 * 60 * 24)
        const selectedBpm = getSelectedBpm(record)
        console.log(`[BPM Module] ISRC cache record age: ${ageDays.toFixed(2)} days, BPM: ${selectedBpm}, ISRC mismatch: ${record.isrc_mismatch}, valid: ${selectedBpm !== null && ageDays < CACHE_TTL_DAYS && !record.isrc_mismatch}`)
        // Return valid BPM records (not expired and no ISRC mismatch), or records with null BPM (for error info)
        // ISRC mismatches are treated as errors, so exclude them from valid cache
        if (selectedBpm !== null && ageDays < CACHE_TTL_DAYS && !record.isrc_mismatch) {
          return record
        } else if (selectedBpm === null || record.isrc_mismatch) {
          // Return null BPM records or ISRC mismatch records to get error information
          return record
        }
      }
  }
  
  // Fallback to spotify_track_id
  const trackResults = await query<CacheRecord>(
    `SELECT * FROM track_bpm_cache WHERE spotify_track_id = $1 LIMIT 1`,
    [spotifyTrackId]
  )
  console.log(`[BPM Module] Track ID cache query result: ${trackResults.length} records`)
  if (trackResults.length > 0) {
    const record = trackResults[0]
    const ageDays = (Date.now() - new Date(record.updated_at).getTime()) / (1000 * 60 * 60 * 24)
    const selectedBpm = getSelectedBpm(record)
    console.log(`[BPM Module] Track ID cache record age: ${ageDays.toFixed(2)} days, BPM: ${selectedBpm}, ISRC mismatch: ${record.isrc_mismatch}, valid: ${selectedBpm !== null && ageDays < CACHE_TTL_DAYS && !record.isrc_mismatch}`)
    // Return valid BPM records (not expired and no ISRC mismatch), or records with null BPM (for error info)
    // ISRC mismatches are treated as errors, so exclude them from valid cache
    if (selectedBpm !== null && ageDays < CACHE_TTL_DAYS && !record.isrc_mismatch) {
      return record
    } else if (selectedBpm === null || record.isrc_mismatch) {
      // Return null BPM records or ISRC mismatch records to get error information
      return record
    }
  }
  
  console.log(`[BPM Module] No valid cache found`)
  return null
}

/**
 * Get country code from request header override, IP address, Accept-Language header, or default to US
 */
function getCountryCodeFromRequest(request?: Request): string {
  if (!request) {
    console.log('[BPM Module] No request provided, defaulting to US')
  return 'us'
}

function getPreviewUrlToReturn(
  successfulUrl: string | null | undefined,
  urlsTried: string[] | undefined
): string | null | undefined {
  let previewUrlToReturn = successfulUrl || undefined
  if (urlsTried && Array.isArray(urlsTried) && urlsTried.length > 0) {
    const deezerPreviewUrls = urlsTried.filter((url: string) => {
      const isDeezerUrl = url.includes('deezer.com') || url.includes('cdn-preview') || url.includes('cdnt-preview')
      const isAudioFile = url.includes('.mp3') || url.includes('cdn-preview') || url.includes('cdnt-preview') || url.includes('/preview')
      const isNotApiEndpoint = !url.includes('api.deezer.com/search') && !url.includes('api.deezer.com/album') && !url.includes('api.deezer.com/track')
      return isDeezerUrl && isAudioFile && isNotApiEndpoint
    })
    if (deezerPreviewUrls.length > 0) {
      previewUrlToReturn = deezerPreviewUrls[deezerPreviewUrls.length - 1]
    }
  }
  return previewUrlToReturn
}
  
  try {
    // Check for manual override first (this is set by the API route when country param is provided)
    const override = request.headers.get('x-country-override')
    if (override) {
      const country = override.toLowerCase()
      console.log(`[BPM Module] Using country override from header: ${country}`)
      return country
    }
    
    const acceptLanguage = request.headers.get('accept-language')
    if (acceptLanguage) {
      // Parse Accept-Language header (e.g., "en-US,en;q=0.9,it;q=0.8")
      const languages = acceptLanguage.split(',')
      for (const lang of languages) {
        const parts = lang.split(';')[0].trim().toLowerCase()
        // Map common language codes to iTunes country codes
        const langToCountry: Record<string, string> = {
          'en-us': 'us',
          'en-gb': 'gb',
          'en': 'us',
          'it': 'it',
          'it-it': 'it',
          'fr': 'fr',
          'fr-fr': 'fr',
          'de': 'de',
          'de-de': 'de',
          'es': 'es',
          'es-es': 'es',
          'ja': 'jp',
          'ja-jp': 'jp',
        }
        if (langToCountry[parts]) {
          return langToCountry[parts]
        }
        // Extract country code if format is like "en-US"
        const countryMatch = parts.match(/-([a-z]{2})$/)
        if (countryMatch) {
          return countryMatch[1]
        }
      }
    }
  } catch (error) {
    console.warn('[BPM Module] Error parsing Accept-Language header:', error)
  }
  
  return 'us' // Default to US
}

/**
 * Resolve preview URL from multiple sources using ISRC
 * Priority: 1. Deezer ISRC, 2. iTunes search with ISRC matching, 3. Deezer search
 * Stops at first successful source
 */
async function resolvePreviewUrl(params: {
  isrc: string | null
  title: string
  artists: string
  countryCode?: string
}): Promise<PreviewUrlResult> {
  const { isrc, title, artists, countryCode = 'us' } = params
  
  console.log(`[BPM Module] Resolving preview URL for: "${title}" by "${artists}" (ISRC: ${isrc || 'none'}, Country: ${countryCode})`)
  
  const urlsTried: string[] = []
  
  // 1. Try Deezer ISRC lookup (most accurate)
  if (isrc) {
    try {
      console.log(`[BPM Module] Trying Deezer ISRC lookup for: ${isrc}`)
      const deezerIsrcUrl = `https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`
      urlsTried.push(deezerIsrcUrl)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      try {
        const response = await fetch(deezerIsrcUrl, {
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        
        if (response.ok) {
          const trackData = await response.json() as any
          if (trackData.id && trackData.preview) {
            console.log(`[BPM Module] Found Deezer preview URL via ISRC`)
            return { 
              url: trackData.preview, 
              source: 'deezer_isrc', 
              urlsTried,
              successfulUrl: trackData.preview,
              isrcMismatch: false // ISRC lookup is always accurate
            }
          }
        } else if (response.status !== 404) {
          console.log(`[BPM Module] Deezer ISRC lookup failed with status: ${response.status}`)
        }
      } catch (error) {
        clearTimeout(timeoutId)
        throw error
      }
    } catch (error) {
      console.warn(`[BPM Module] Deezer ISRC lookup error:`, error)
    }
  }
  
  // 2. Try iTunes search by artist + title, then match ISRC
  try {
    console.log(`[BPM Module] Trying iTunes search for: "${artists} ${title}"`)
    const searchTerm = `${artists} ${title}`
    const itunesSearchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&media=music&entity=song&country=${countryCode}&limit=20`
    urlsTried.push(itunesSearchUrl)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    try {
      const response = await fetch(itunesSearchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      
      if (response.ok) {
        const data = await response.json() as any
        console.log(`[BPM Module] iTunes search result: ${data.resultCount} results`)
        if (data.resultCount > 0 && data.results) {
          // Filter to items where kind === "song" and previewUrl exists
          const tracks = data.results.filter((r: any) => 
            (r.kind === 'song' || r.wrapperType === 'track') && r.previewUrl
          )
          
            if (tracks.length > 0) {
            let selectedTrack = tracks[0]
            let isrcMismatch = false
            
            // If we have ISRC from Spotify, try to match it
            if (isrc) {
              const matchingTrack = tracks.find((t: any) => t.isrc === isrc)
              if (matchingTrack) {
                console.log(`[BPM Module] Found iTunes track with matching ISRC`)
                selectedTrack = matchingTrack
                isrcMismatch = false
              } else {
                console.log(`[BPM Module] No iTunes track with matching ISRC - treating as error`)
                isrcMismatch = true
                // Don't return the URL if ISRC doesn't match - treat as error
                return { 
                  url: null, 
                  source: 'computed_failed', 
                  urlsTried,
                  successfulUrl: null,
                  isrcMismatch: true
                }
              }
            }
            
            console.log(`[BPM Module] Found iTunes preview URL via search (ISRC mismatch: ${isrcMismatch})`)
            return { 
              url: selectedTrack.previewUrl, 
              source: 'itunes_search', 
              urlsTried,
              successfulUrl: selectedTrack.previewUrl,
              isrcMismatch
            }
          }
        }
      } else {
        console.log(`[BPM Module] iTunes search failed with status: ${response.status}`)
      }
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  } catch (error) {
    console.warn(`[BPM Module] iTunes search error:`, error)
  }
  
  // 3. Try Deezer search (fallback)
  try {
    console.log(`[BPM Module] Trying Deezer search for: "${artists} ${title}"`)
    const deezerQuery = `${artists} ${title}`
    const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(deezerQuery)}&limit=10`
    urlsTried.push(deezerUrl)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    try {
      const response = await fetch(deezerUrl, {
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      
      if (response.ok) {
        const data = await response.json() as any
        console.log(`[BPM Module] Deezer search result: ${data.data?.length || 0} results`)
        if (data.data && Array.isArray(data.data)) {
          // Filter out items missing preview
          const tracksWithPreview = data.data.filter((t: any) => t.preview)
          
          if (tracksWithPreview.length > 0) {
            let selectedTrack = tracksWithPreview[0]
            let isrcMismatch = false
            
            // If we have ISRC from Spotify, try to match it
            if (isrc) {
              const matchingTrack = tracksWithPreview.find((t: any) => t.isrc === isrc)
              if (matchingTrack) {
                console.log(`[BPM Module] Found Deezer track with matching ISRC`)
                selectedTrack = matchingTrack
                isrcMismatch = false
              } else {
                console.log(`[BPM Module] No Deezer track with matching ISRC - treating as error`)
                isrcMismatch = true
                // Don't return the URL if ISRC doesn't match - treat as error
                return { 
                  url: null, 
                  source: 'computed_failed', 
                  urlsTried,
                  successfulUrl: null,
                  isrcMismatch: true
                }
              }
            }
            
            console.log(`[BPM Module] Found Deezer preview URL (ISRC mismatch: ${isrcMismatch})`)
            return { 
              url: selectedTrack.preview, 
              source: 'deezer_search', 
              urlsTried,
              successfulUrl: selectedTrack.preview,
              isrcMismatch
            }
          }
        }
      } else {
        console.log(`[BPM Module] Deezer search failed with status: ${response.status}`)
      }
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  } catch (error) {
    console.warn(`[BPM Module] Deezer search error:`, error)
  }
  
  // No preview URL found
  console.log(`[BPM Module] No preview URL found from any source`)
  return { url: null, source: 'computed_failed', urlsTried, successfulUrl: null, isrcMismatch: false }
}

/**
 * Get Google Cloud Identity Token for authenticating with Cloud Run service
 */
export async function getIdentityToken(serviceUrl: string): Promise<string> {
  const serviceAccountKeyJson = process.env.GCP_SERVICE_ACCOUNT_KEY
  
  if (!serviceAccountKeyJson) {
    throw new Error('GCP_SERVICE_ACCOUNT_KEY environment variable is not set')
  }
  
  let serviceAccountKey: any
  try {
    serviceAccountKey = JSON.parse(serviceAccountKeyJson)
  } catch (error) {
    throw new Error(`Failed to parse GCP_SERVICE_ACCOUNT_KEY: ${error instanceof Error ? error.message : 'Invalid JSON'}`)
  }
  
  // For Cloud Run identity tokens, we only need credentials, not scopes
  // The audience (serviceUrl) is set when getting the ID token client
  const auth = new GoogleAuth({
    credentials: serviceAccountKey,
  })
  
  const client = await auth.getIdTokenClient(serviceUrl)
  const idToken = await client.idTokenProvider.fetchIdToken(serviceUrl)
  
  if (!idToken) {
    throw new Error('Failed to obtain identity token')
  }
  
  return idToken
}

/**
 * Call external BPM service to compute BPM from preview URL
 * Uses the async batch pattern:
 * 1. POST /analyze/batch to submit and get batch_id
 * 2. Poll GET /batch/{batch_id} until status is "completed"
 * 3. Extract first result from results object
 */
async function computeBpmFromService(previewUrl: string): Promise<{ 
  bpmEssentia?: number
  bpmRawEssentia?: number
  bpmConfidenceEssentia?: number
  bpmLibrosa?: number | null
  bpmRawLibrosa?: number | null
  bpmConfidenceLibrosa?: number | null
  keyEssentia?: string
  scaleEssentia?: string
  keyscaleConfidenceEssentia?: number
  keyLibrosa?: string | null
  scaleLibrosa?: string | null
  keyscaleConfidenceLibrosa?: number | null
  debugTxt?: string
}> {
  const serviceUrl = process.env.BPM_SERVICE_URL || 'https://bpm-service-340051416180.europe-west3.run.app'
  
  console.log(`[BPM Module] Calling external BPM service at: ${serviceUrl}`)
  
  // Get identity token for authentication
  const idToken = await getIdentityToken(serviceUrl)
  
  // Call the service using batch endpoint (with single URL)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120000) // 120s timeout (2 minutes)
  
  console.log(`[BPM Module] Sending preview URL to BPM service:`, previewUrl)
  console.log(`[BPM Module] URL details:`, {
    isDeezer: previewUrl.includes('deezer') || previewUrl.includes('cdn-preview') || previewUrl.includes('cdnt-preview'),
    hasHdnea: previewUrl.includes('hdnea'),
    urlLength: previewUrl.length,
  })
  
  try {
    // Step 1: Submit batch and get batch_id
    const batchResponse = await fetch(`${serviceUrl}/analyze/batch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        urls: [previewUrl],
        max_confidence: 0.65,
        debug_level: 'normal'
      }),
      signal: controller.signal,
    })
    
    if (!batchResponse.ok) {
      const errorText = await batchResponse.text()
      throw new Error(`BPM service returned ${batchResponse.status}: ${errorText}`)
    }
    
    const batchData = await batchResponse.json()
    console.log(`[BPM Module] Batch submitted:`, {
      batch_id: batchData.batch_id,
      total_urls: batchData.total_urls,
      status: batchData.status,
    })
    
    if (!batchData.batch_id) {
      throw new Error(`BPM service did not return batch_id: ${JSON.stringify(batchData)}`)
    }
    
    const batchId = batchData.batch_id
    
    // Step 2: Poll /batch/{batch_id} until completed
    const maxWaitTime = 120000 // 120 seconds max (2 minutes, matching timeout)
    const pollInterval = 1000 // Poll every 1 second
    const startTime = Date.now()
    
    let batchStatus: {
      batch_id: string
      status: string
      total_urls: number
      processed: number
      results?: {
        [key: string]: {
          index: number
          url: string
          bpm_essentia: number
          bpm_raw_essentia: number
          bpm_confidence_essentia: number
          bpm_librosa: number | null
          bpm_raw_librosa: number | null
          bpm_confidence_librosa: number | null
          key_essentia: string
          scale_essentia: string
          keyscale_confidence_essentia: number
          key_librosa: string | null
          scale_librosa: string | null
          keyscale_confidence_librosa: number | null
          debug_txt?: string
        }
      }
    } | null = null
    
    while (Date.now() - startTime < maxWaitTime) {
      const statusResponse = await fetch(`${serviceUrl}/batch/${batchId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
        signal: controller.signal,
      })
      
      if (!statusResponse.ok) {
        const errorText = await statusResponse.text()
        throw new Error(`BPM service batch status returned ${statusResponse.status}: ${errorText}`)
      }
      
      batchStatus = await statusResponse.json()
      
      if (batchStatus && batchStatus.status === 'completed' && batchStatus.results) {
        break
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }
    
    clearTimeout(timeoutId)
    
    if (!batchStatus || batchStatus.status !== 'completed' || !batchStatus.results) {
      throw new Error(`BPM service batch did not complete within ${maxWaitTime}ms. Status: ${batchStatus?.status || 'unknown'}`)
    }
    
    // Step 3: Extract first result from results object
    // Results are keyed by index as strings: {"0": {...}, "1": {...}}
    const resultKeys = Object.keys(batchStatus.results).sort((a, b) => parseInt(a) - parseInt(b))
    
    if (resultKeys.length === 0) {
      throw new Error('BPM service returned no results')
    }
    
    const firstResultKey = resultKeys[0]
    const data = batchStatus.results[firstResultKey]
    
    if (!data || typeof data !== 'object') {
      console.error(`[BPM Module] Invalid result data:`, {
        data,
        dataType: typeof data,
        resultKeys,
      })
      throw new Error(`BPM service returned invalid result: ${JSON.stringify(data)}`)
    }
    
    console.log(`[BPM Module] BPM service response:`, {
      bpm_essentia: data.bpm_essentia,
      bpm_raw_essentia: data.bpm_raw_essentia,
      bpm_confidence_essentia: data.bpm_confidence_essentia,
      bpm_librosa: data.bpm_librosa,
      bpm_confidence_librosa: data.bpm_confidence_librosa,
      key_essentia: data.key_essentia,
      scale_essentia: data.scale_essentia,
      keyscale_confidence_essentia: data.keyscale_confidence_essentia,
      key_librosa: data.key_librosa,
      scale_librosa: data.scale_librosa,
      keyscale_confidence_librosa: data.keyscale_confidence_librosa,
    })
    
    return {
      bpmEssentia: data.bpm_essentia,
      bpmRawEssentia: data.bpm_raw_essentia,
      bpmConfidenceEssentia: data.bpm_confidence_essentia,
      bpmLibrosa: data.bpm_librosa ?? null,
      bpmRawLibrosa: data.bpm_raw_librosa ?? null,
      bpmConfidenceLibrosa: data.bpm_confidence_librosa ?? null,
      keyEssentia: data.key_essentia,
      scaleEssentia: data.scale_essentia,
      keyscaleConfidenceEssentia: data.keyscale_confidence_essentia,
      keyLibrosa: data.key_librosa ?? null,
      scaleLibrosa: data.scale_librosa ?? null,
      keyscaleConfidenceLibrosa: data.keyscale_confidence_librosa ?? null,
      debugTxt: data.debug_txt,
    }
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('BPM service request timed out')
    }
    throw error
  }
}

/**
 * Helper function to determine which BPM/key to use based on confidence
 * Returns 'essentia', 'librosa', or 'essentia' (default if librosa is null)
 */
function selectBestBpm(
  bpmEssentia: number | null | undefined,
  bpmConfidenceEssentia: number | null | undefined,
  bpmLibrosa: number | null | undefined,
  bpmConfidenceLibrosa: number | null | undefined
): 'essentia' | 'librosa' {
  if (bpmLibrosa == null) return 'essentia'
  if (bpmEssentia == null) return 'librosa'
  // Use Librosa if it has higher confidence, otherwise Essentia
  const essentiaConf = bpmConfidenceEssentia ?? 0
  const librosaConf = bpmConfidenceLibrosa ?? 0
  return librosaConf > essentiaConf ? 'librosa' : 'essentia'
}

function selectBestKey(
  keyEssentia: string | null | undefined,
  keyscaleConfidenceEssentia: number | null | undefined,
  keyLibrosa: string | null | undefined,
  keyscaleConfidenceLibrosa: number | null | undefined
): 'essentia' | 'librosa' {
  if (keyLibrosa == null) return 'essentia'
  if (keyEssentia == null) return 'librosa'
  // Use Librosa if it has higher confidence, otherwise Essentia
  const essentiaConf = keyscaleConfidenceEssentia ?? 0
  const librosaConf = keyscaleConfidenceLibrosa ?? 0
  return librosaConf > essentiaConf ? 'librosa' : 'essentia'
}

/**
 * Store BPM result in cache
 */
async function storeInCache(params: {
  spotifyTrackId: string
  isrc: string | null
  artist: string
  title: string
  bpmEssentia?: number | null
  bpmRawEssentia?: number | null
  bpmConfidenceEssentia?: number | null
  bpmLibrosa?: number | null
  bpmRawLibrosa?: number | null
  bpmConfidenceLibrosa?: number | null
  keyEssentia?: string | null
  scaleEssentia?: string | null
  keyscaleConfidenceEssentia?: number | null
  keyLibrosa?: string | null
  scaleLibrosa?: string | null
  keyscaleConfidenceLibrosa?: number | null
  source: string
  error: string | null
  urlsTried?: string[]
  successfulUrl?: string | null
  isrcMismatch?: boolean
  debugTxt?: string | null
  bpmSelected?: 'essentia' | 'librosa' | 'manual' | null
  bpmManual?: number | null
  keySelected?: 'essentia' | 'librosa' | 'manual' | null
  keyManual?: string | null
  scaleManual?: string | null
}): Promise<void> {
  const { 
    spotifyTrackId, isrc, artist, title, 
    bpmEssentia, bpmRawEssentia, bpmConfidenceEssentia,
    bpmLibrosa, bpmRawLibrosa, bpmConfidenceLibrosa,
    keyEssentia, scaleEssentia, keyscaleConfidenceEssentia,
    keyLibrosa, scaleLibrosa, keyscaleConfidenceLibrosa,
    source, error, urlsTried, successfulUrl, isrcMismatch = false,
    debugTxt,
    bpmSelected, bpmManual, keySelected, keyManual, scaleManual
  } = params
  
  // Determine which values to use if not explicitly set
  const finalBpmSelected = bpmSelected ?? (bpmEssentia != null || bpmLibrosa != null 
    ? selectBestBpm(bpmEssentia, bpmConfidenceEssentia, bpmLibrosa, bpmConfidenceLibrosa)
    : null)
  const finalKeySelected = keySelected ?? (keyEssentia != null || keyLibrosa != null
    ? selectBestKey(keyEssentia, keyscaleConfidenceEssentia, keyLibrosa, keyscaleConfidenceLibrosa)
    : null)
  
  // Check if record exists
  const existing = await query<CacheRecord>(
    `SELECT id FROM track_bpm_cache WHERE spotify_track_id = $1 LIMIT 1`,
    [spotifyTrackId]
  )
  
  // Convert urlsTried array to JSON for storage
  const urlsTriedJson = urlsTried && urlsTried.length > 0 ? JSON.stringify(urlsTried) : null

  if (existing.length > 0) {
    // Update existing record - preserve manual overrides and selected values unless explicitly updating
    await query(
      `UPDATE track_bpm_cache 
       SET isrc = COALESCE($1, isrc),
           artist = $2, 
           title = $3, 
           bpm_essentia = COALESCE($4, bpm_essentia),
           bpm_raw_essentia = COALESCE($5, bpm_raw_essentia),
           bpm_confidence_essentia = COALESCE($6, bpm_confidence_essentia),
           bpm_librosa = COALESCE($7, bpm_librosa),
           bpm_raw_librosa = COALESCE($8, bpm_raw_librosa),
           bpm_confidence_librosa = COALESCE($9, bpm_confidence_librosa),
           key_essentia = COALESCE($10, key_essentia),
           scale_essentia = COALESCE($11, scale_essentia),
           keyscale_confidence_essentia = COALESCE($12, keyscale_confidence_essentia),
           key_librosa = COALESCE($13, key_librosa),
           scale_librosa = COALESCE($14, scale_librosa),
           keyscale_confidence_librosa = COALESCE($15, keyscale_confidence_librosa),
           bpm_selected = COALESCE($16, bpm_selected, 'essentia'),
           key_selected = COALESCE($17, key_selected, 'essentia'),
           source = $18, 
           error = $19,
           urls_tried = COALESCE($20::jsonb, urls_tried),
           successful_url = COALESCE($21, successful_url),
           isrc_mismatch = $22,
           debug_txt = COALESCE($23, debug_txt),
           updated_at = NOW()
       WHERE spotify_track_id = $24`,
      [
        isrc, artist, title,
        bpmEssentia, bpmRawEssentia, bpmConfidenceEssentia,
        bpmLibrosa, bpmRawLibrosa, bpmConfidenceLibrosa,
        keyEssentia, scaleEssentia, keyscaleConfidenceEssentia,
        keyLibrosa, scaleLibrosa, keyscaleConfidenceLibrosa,
        finalBpmSelected, finalKeySelected,
        source, error, urlsTriedJson, successfulUrl, isrcMismatch,
        debugTxt,
        spotifyTrackId
      ]
    )
  } else {
    // Insert new record
    await query(
      `INSERT INTO track_bpm_cache 
       (spotify_track_id, isrc, artist, title, 
        bpm_essentia, bpm_raw_essentia, bpm_confidence_essentia,
        bpm_librosa, bpm_raw_librosa, bpm_confidence_librosa,
        key_essentia, scale_essentia, keyscale_confidence_essentia,
        key_librosa, scale_librosa, keyscale_confidence_librosa,
        bpm_selected, bpm_manual, key_selected, key_manual, scale_manual,
        source, error, urls_tried, successful_url, isrc_mismatch, 
        debug_txt, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24::jsonb, $25, $26, $27, NOW())
       ON CONFLICT (spotify_track_id) DO UPDATE SET
         isrc = COALESCE(EXCLUDED.isrc, track_bpm_cache.isrc),
         artist = EXCLUDED.artist,
         title = EXCLUDED.title,
         bpm_essentia = COALESCE(EXCLUDED.bpm_essentia, track_bpm_cache.bpm_essentia),
         bpm_raw_essentia = COALESCE(EXCLUDED.bpm_raw_essentia, track_bpm_cache.bpm_raw_essentia),
         bpm_confidence_essentia = COALESCE(EXCLUDED.bpm_confidence_essentia, track_bpm_cache.bpm_confidence_essentia),
         bpm_librosa = COALESCE(EXCLUDED.bpm_librosa, track_bpm_cache.bpm_librosa),
         bpm_raw_librosa = COALESCE(EXCLUDED.bpm_raw_librosa, track_bpm_cache.bpm_raw_librosa),
         bpm_confidence_librosa = COALESCE(EXCLUDED.bpm_confidence_librosa, track_bpm_cache.bpm_confidence_librosa),
         key_essentia = COALESCE(EXCLUDED.key_essentia, track_bpm_cache.key_essentia),
         scale_essentia = COALESCE(EXCLUDED.scale_essentia, track_bpm_cache.scale_essentia),
         keyscale_confidence_essentia = COALESCE(EXCLUDED.keyscale_confidence_essentia, track_bpm_cache.keyscale_confidence_essentia),
         key_librosa = COALESCE(EXCLUDED.key_librosa, track_bpm_cache.key_librosa),
         scale_librosa = COALESCE(EXCLUDED.scale_librosa, track_bpm_cache.scale_librosa),
         keyscale_confidence_librosa = COALESCE(EXCLUDED.keyscale_confidence_librosa, track_bpm_cache.keyscale_confidence_librosa),
         bpm_selected = COALESCE(EXCLUDED.bpm_selected, track_bpm_cache.bpm_selected, 'essentia'),
         key_selected = COALESCE(EXCLUDED.key_selected, track_bpm_cache.key_selected, 'essentia'),
         source = EXCLUDED.source,
         error = EXCLUDED.error,
         urls_tried = COALESCE(EXCLUDED.urls_tried, track_bpm_cache.urls_tried),
         successful_url = COALESCE(EXCLUDED.successful_url, track_bpm_cache.successful_url),
         isrc_mismatch = EXCLUDED.isrc_mismatch,
         debug_txt = COALESCE(EXCLUDED.debug_txt, track_bpm_cache.debug_txt),
         updated_at = NOW()`,
      [
        spotifyTrackId, isrc, artist, title,
        bpmEssentia, bpmRawEssentia, bpmConfidenceEssentia,
        bpmLibrosa, bpmRawLibrosa, bpmConfidenceLibrosa,
        keyEssentia, scaleEssentia, keyscaleConfidenceEssentia,
        keyLibrosa, scaleLibrosa, keyscaleConfidenceLibrosa,
        finalBpmSelected, bpmManual, finalKeySelected, keyManual, scaleManual,
        source, error, urlsTriedJson, successfulUrl, isrcMismatch,
        debugTxt
      ]
    )
  }
}

export async function prepareBpmStreamingBatch(params: {
  spotifyTrackIds: string[]
  request?: Request
  countryCode?: string
}): Promise<{
  urls: string[]
  indexToTrackId: Record<number, string>
  previewMeta: Record<string, StreamingPreviewMeta>
  immediateResults: Record<string, {
    source: string
    error: string
    urlsTried?: string[]
    successfulUrl?: string | null
    isrcMismatch?: boolean
  }>
}> {
  const { spotifyTrackIds, request, countryCode } = params
  const resolvedCountryCode = countryCode || getCountryCodeFromRequest(request)
  const urls: string[] = []
  const indexToTrackId: Record<number, string> = {}
  const previewMeta: Record<string, StreamingPreviewMeta> = {}
  const immediateResults: Record<string, {
    source: string
    error: string
    urlsTried?: string[]
    successfulUrl?: string | null
    isrcMismatch?: boolean
  }> = {}

  const batchSize = 5
  for (let i = 0; i < spotifyTrackIds.length; i += batchSize) {
    const batch = spotifyTrackIds.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(async (spotifyTrackId) => {
        if (!isValidSpotifyTrackId(spotifyTrackId)) {
          return {
            spotifyTrackId,
            error: `Invalid Spotify track ID format: ${spotifyTrackId}`,
            source: 'computed_failed',
          }
        }

        try {
          const identifiers = await extractSpotifyIdentifiers(spotifyTrackId)
          const previewResult = await resolvePreviewUrl({
            isrc: identifiers.isrc,
            title: identifiers.title,
            artists: identifiers.artists,
            countryCode: resolvedCountryCode,
          })

          if (!previewResult.url) {
            let errorMessage = 'No preview URL found'
            if (previewResult.isrcMismatch) {
              errorMessage = 'ISRC mismatch: Found preview URL but ISRC does not match Spotify track (wrong audio file)'
            } else if (previewResult.source === 'computed_failed') {
              errorMessage = 'No preview audio available from any source (iTunes, Deezer)'
            } else if (previewResult.source === 'itunes_search') {
              errorMessage = 'No preview available on iTunes/Apple Music'
            } else if (previewResult.source === 'deezer_isrc' || previewResult.source === 'deezer_search') {
              errorMessage = 'No preview available on Deezer'
            }

            const previewUrlToReturn = getPreviewUrlToReturn(
              previewResult.successfulUrl,
              previewResult.urlsTried
            )

            await storeInCache({
              spotifyTrackId,
              isrc: identifiers.isrc,
              artist: identifiers.artists,
              title: identifiers.title,
              source: previewResult.source,
              error: errorMessage,
              urlsTried: previewResult.urlsTried,
              successfulUrl: previewUrlToReturn ?? null,
              isrcMismatch: previewResult.isrcMismatch || false,
            })

            return {
              spotifyTrackId,
              error: errorMessage,
              source: previewResult.source,
              urlsTried: previewResult.urlsTried,
              successfulUrl: previewUrlToReturn ?? null,
              isrcMismatch: previewResult.isrcMismatch,
            }
          }

          const previewUrlToReturn = getPreviewUrlToReturn(
            previewResult.successfulUrl,
            previewResult.urlsTried
          )

          return {
            spotifyTrackId,
            previewUrl: previewResult.url,
            previewMeta: {
              source: previewResult.source,
              urlsTried: previewResult.urlsTried,
              successfulUrl: previewUrlToReturn ?? null,
              isrcMismatch: previewResult.isrcMismatch,
            },
          }
        } catch (error) {
          return {
            spotifyTrackId,
            error: error instanceof Error ? error.message : 'Failed to resolve preview URL',
            source: 'computed_failed',
          }
        }
      })
    )

    for (const result of batchResults) {
      if ('previewUrl' in result && result.previewUrl) {
        indexToTrackId[urls.length] = result.spotifyTrackId
        urls.push(result.previewUrl)
        if (result.previewMeta) {
          previewMeta[result.spotifyTrackId] = result.previewMeta
        }
      } else if (result.error) {
        immediateResults[result.spotifyTrackId] = {
          source: result.source || 'computed_failed',
          error: result.error,
          urlsTried: 'urlsTried' in result ? result.urlsTried : undefined,
          successfulUrl: 'successfulUrl' in result ? result.successfulUrl : undefined,
          isrcMismatch: 'isrcMismatch' in result ? result.isrcMismatch : undefined,
        }
      }
    }
  }

  return { urls, indexToTrackId, previewMeta, immediateResults }
}

export async function storeStreamingBpmResult(params: {
  spotifyTrackId: string
  previewMeta: StreamingPreviewMeta
  result: {
    bpm_essentia?: number | null
    bpm_raw_essentia?: number | null
    bpm_confidence_essentia?: number | null
    bpm_librosa?: number | null
    bpm_raw_librosa?: number | null
    bpm_confidence_librosa?: number | null
    key_essentia?: string | null
    scale_essentia?: string | null
    keyscale_confidence_essentia?: number | null
    key_librosa?: string | null
    scale_librosa?: string | null
    keyscale_confidence_librosa?: number | null
    debug_txt?: string | null
  }
}): Promise<void> {
  const { spotifyTrackId, previewMeta, result } = params
  const identifiers = await extractSpotifyIdentifiers(spotifyTrackId)

  await storeInCache({
    spotifyTrackId,
    isrc: identifiers.isrc,
    artist: identifiers.artists,
    title: identifiers.title,
    bpmEssentia: result.bpm_essentia ?? null,
    bpmRawEssentia: result.bpm_raw_essentia ?? null,
    bpmConfidenceEssentia: result.bpm_confidence_essentia ?? null,
    bpmLibrosa: result.bpm_librosa ?? null,
    bpmRawLibrosa: result.bpm_raw_librosa ?? null,
    bpmConfidenceLibrosa: result.bpm_confidence_librosa ?? null,
    keyEssentia: result.key_essentia ?? null,
    scaleEssentia: result.scale_essentia ?? null,
    keyscaleConfidenceEssentia: result.keyscale_confidence_essentia ?? null,
    keyLibrosa: result.key_librosa ?? null,
    scaleLibrosa: result.scale_librosa ?? null,
    keyscaleConfidenceLibrosa: result.keyscale_confidence_librosa ?? null,
    source: previewMeta.source,
    error: null,
    urlsTried: previewMeta.urlsTried,
    successfulUrl: previewMeta.successfulUrl ?? null,
    isrcMismatch: previewMeta.isrcMismatch || false,
    debugTxt: result.debug_txt ?? null,
  })
}

/**
 * Main function to get BPM for a Spotify track
 */
export async function getBpmForSpotifyTrack(
  spotifyTrackId: string,
  request?: Request
): Promise<BpmResult> {
  // Import logger dynamically to avoid circular dependencies
  const { logError, logInfo } = await import('./logger')
  
  // Validate track ID format
  if (!isValidSpotifyTrackId(spotifyTrackId)) {
    const errorMessage = `Invalid Spotify track ID format: ${spotifyTrackId}`
    const error = new Error(errorMessage)
    logError(error, {
      component: 'bpm.getBpmForSpotifyTrack',
      spotifyTrackId,
      errorType: 'ValidationError',
    })
    return {
      bpm: null,
      source: 'computed_failed',
      error: errorMessage,
    }
  }
  
  // Check in-flight computations to avoid duplicate work
  const cacheKey = spotifyTrackId
  if (inFlightComputations.has(cacheKey)) {
    return inFlightComputations.get(cacheKey)!
  }
  
  // Create computation promise
  const computationPromise = (async (): Promise<BpmResult> => {
    try {
      console.log(`[BPM Module] Starting BPM computation for track: ${spotifyTrackId}`)
      
      // 1. Extract identifiers from Spotify
      console.log(`[BPM Module] Step 1: Extracting identifiers from Spotify...`)
      const identifiers = await extractSpotifyIdentifiers(spotifyTrackId)
      console.log(`[BPM Module] Identifiers extracted:`, {
        isrc: identifiers.isrc,
        title: identifiers.title,
        artists: identifiers.artists,
        hasSpotifyPreview: !!identifiers.spotifyPreviewUrl,
      })
      
      // 2. Check cache
      console.log(`[BPM Module] Step 2: Checking cache...`)
      const cached = await checkCache(spotifyTrackId, identifiers.isrc)
      const selectedBpm = cached ? getSelectedBpm(cached) : null
      if (cached && selectedBpm !== null) {
        console.log(`[BPM Module] Cache hit! Returning cached BPM: ${selectedBpm} (source: ${cached.source})`)
        // Parse urls_tried from JSONB if present
        let urlsTried: string[] | undefined
        if (cached.urls_tried) {
          try {
            urlsTried = Array.isArray(cached.urls_tried) ? cached.urls_tried : JSON.parse(cached.urls_tried as any)
          } catch (e) {
            console.warn('[BPM Module] Error parsing urls_tried:', e)
          }
        }
        
        const selectedKey = getSelectedKey(cached)
        // If we have BPM but no key/scale, re-run preview URL search with new ISRC logic and fetch key/scale
        if (!selectedKey.key || !selectedKey.scale) {
          console.log(`[BPM Module] Cache has BPM but missing key/scale. Re-running preview URL search with new ISRC logic...`)
          try {
            // Re-run preview URL resolution with new ISRC logic
            const countryCode = getCountryCodeFromRequest(request)
            const previewResult = await resolvePreviewUrl({
              isrc: identifiers.isrc,
              title: identifiers.title,
              artists: identifiers.artists,
              countryCode,
            })
            
            if (previewResult.url) {
              console.log(`[BPM Module] Preview URL resolved: ${previewResult.source}, fetching key/scale...`)
              const bpmResult = await computeBpmFromService(previewResult.url)
              console.log(`[BPM Module] Key/scale fetched: key=${bpmResult.keyEssentia || bpmResult.keyLibrosa}, scale=${bpmResult.scaleEssentia || bpmResult.scaleLibrosa}`)
              
              // Update cache with key/scale and potentially new successful_url
              await storeInCache({
                spotifyTrackId,
                isrc: identifiers.isrc,
                artist: cached.artist || identifiers.artists,
                title: cached.title || identifiers.title,
                bpmEssentia: cached.bpm_essentia,
                bpmRawEssentia: cached.bpm_raw_essentia,
                bpmConfidenceEssentia: cached.bpm_confidence_essentia,
                bpmLibrosa: cached.bpm_librosa,
                bpmRawLibrosa: cached.bpm_raw_librosa,
                bpmConfidenceLibrosa: cached.bpm_confidence_librosa,
                keyEssentia: bpmResult.keyEssentia || cached.key_essentia,
                scaleEssentia: bpmResult.scaleEssentia || cached.scale_essentia,
                keyscaleConfidenceEssentia: bpmResult.keyscaleConfidenceEssentia || cached.keyscale_confidence_essentia,
                keyLibrosa: bpmResult.keyLibrosa || cached.key_librosa,
                scaleLibrosa: bpmResult.scaleLibrosa || cached.scale_librosa,
                keyscaleConfidenceLibrosa: bpmResult.keyscaleConfidenceLibrosa || cached.keyscale_confidence_librosa,
                source: cached.source,
                error: cached.error,
                urlsTried: previewResult.urlsTried,
                successfulUrl: previewResult.successfulUrl || cached.successful_url,
                isrcMismatch: previewResult.isrcMismatch || cached.isrc_mismatch,
                debugTxt: bpmResult.debugTxt || cached.debug_txt,
                bpmSelected: cached.bpm_selected as 'essentia' | 'librosa' | 'manual' | null,
                keySelected: cached.key_selected as 'essentia' | 'librosa' | 'manual' | null,
              })
              
              // Get updated selected values (using values we just stored)
              const updatedSelectedBpm = bpmResult.keyEssentia || bpmResult.keyLibrosa ? 
                (bpmResult.bpmLibrosa != null && bpmResult.bpmConfidenceLibrosa != null && 
                 bpmResult.bpmConfidenceLibrosa > (bpmResult.bpmConfidenceEssentia || 0)) ? bpmResult.bpmLibrosa : (bpmResult.bpmEssentia || getSelectedBpm(cached))
                : getSelectedBpm(cached)
              const updatedSelectedKey = bpmResult.keyEssentia || bpmResult.keyLibrosa ?
                (bpmResult.keyLibrosa != null && bpmResult.keyscaleConfidenceLibrosa != null && 
                 bpmResult.keyscaleConfidenceLibrosa > (bpmResult.keyscaleConfidenceEssentia || 0)) 
                  ? { key: bpmResult.keyLibrosa, scale: bpmResult.scaleLibrosa }
                  : { key: bpmResult.keyEssentia, scale: bpmResult.scaleEssentia }
                : getSelectedKey(cached)
              
              // For Deezer URLs, prefer a URL from urls_tried instead of successful_url
              let previewUrlToReturn = previewResult.successfulUrl || cached.successful_url || undefined
              if (previewResult.urlsTried && Array.isArray(previewResult.urlsTried) && previewResult.urlsTried.length > 0) {
                const deezerPreviewUrls = previewResult.urlsTried.filter((url: string) => {
                  const isDeezerUrl = url.includes('deezer.com') || url.includes('cdn-preview') || url.includes('cdnt-preview')
                  const isAudioFile = url.includes('.mp3') || url.includes('cdn-preview') || url.includes('cdnt-preview') || url.includes('/preview')
                  const isNotApiEndpoint = !url.includes('api.deezer.com/search') && !url.includes('api.deezer.com/album') && !url.includes('api.deezer.com/track')
                  return isDeezerUrl && isAudioFile && isNotApiEndpoint
                })
                if (deezerPreviewUrls.length > 0) {
                  previewUrlToReturn = deezerPreviewUrls[deezerPreviewUrls.length - 1]
                  console.log(`[BPM Module] Using Deezer preview URL from urls_tried for key/scale backfill: ${previewUrlToReturn.substring(0, 100)}...`)
                }
              }
              
              return {
                bpm: updatedSelectedBpm,
                source: cached.source,
                bpmRaw: (cached.bpm_selected === 'librosa' && cached.bpm_raw_librosa) ? cached.bpm_raw_librosa : (cached.bpm_raw_essentia || undefined),
                urlsTried: previewResult.urlsTried,
                successfulUrl: previewUrlToReturn,
                key: updatedSelectedKey.key || undefined,
                scale: updatedSelectedKey.scale || undefined,
                keyConfidence: (cached.key_selected === 'librosa' && cached.keyscale_confidence_librosa) ? cached.keyscale_confidence_librosa : (cached.keyscale_confidence_essentia || undefined),
                bpmConfidence: (cached.bpm_selected === 'librosa' && cached.bpm_confidence_librosa) ? cached.bpm_confidence_librosa : (cached.bpm_confidence_essentia || undefined),
                // Full details for modal - use values we just stored
                bpmEssentia: cached.bpm_essentia ?? undefined,
                bpmRawEssentia: cached.bpm_raw_essentia ?? undefined,
                bpmConfidenceEssentia: cached.bpm_confidence_essentia ?? undefined,
                bpmLibrosa: cached.bpm_librosa ?? undefined,
                bpmRawLibrosa: cached.bpm_raw_librosa ?? undefined,
                bpmConfidenceLibrosa: cached.bpm_confidence_librosa ?? undefined,
                keyEssentia: bpmResult.keyEssentia || (cached.key_essentia ?? undefined),
                scaleEssentia: bpmResult.scaleEssentia || (cached.scale_essentia ?? undefined),
                keyscaleConfidenceEssentia: bpmResult.keyscaleConfidenceEssentia || (cached.keyscale_confidence_essentia ?? undefined),
                keyLibrosa: bpmResult.keyLibrosa || (cached.key_librosa ?? undefined),
                scaleLibrosa: bpmResult.scaleLibrosa || (cached.scale_librosa ?? undefined),
                keyscaleConfidenceLibrosa: bpmResult.keyscaleConfidenceLibrosa || (cached.keyscale_confidence_librosa ?? undefined),
                bpmSelected: (cached.bpm_selected as 'essentia' | 'librosa' | 'manual') || undefined,
                keySelected: (cached.key_selected as 'essentia' | 'librosa' | 'manual') || undefined,
                bpmManual: cached.bpm_manual ?? undefined,
                keyManual: cached.key_manual ?? undefined,
                scaleManual: cached.scale_manual ?? undefined,
                debugTxt: bpmResult.debugTxt || (cached.debug_txt ?? undefined),
              }
            } else {
              console.warn(`[BPM Module] Could not resolve preview URL for key/scale backfill`)
            }
          } catch (error) {
            console.warn(`[BPM Module] Failed to fetch key/scale from BPM service:`, error)
            // Continue with cached result without key/scale
          }
        }
        
        // If cached record has ISRC mismatch, treat as error
        if (cached.isrc_mismatch) {
        // For Deezer URLs, prefer a URL from urls_tried instead of successful_url
        let previewUrlToReturn = cached.successful_url || undefined
        if (urlsTried && Array.isArray(urlsTried) && urlsTried.length > 0) {
          const deezerPreviewUrls = urlsTried.filter((url: string) => {
            const isDeezerUrl = url.includes('deezer.com') || url.includes('cdn-preview') || url.includes('cdnt-preview')
            const isAudioFile = url.includes('.mp3') || url.includes('cdn-preview') || url.includes('cdnt-preview') || url.includes('/preview')
            const isNotApiEndpoint = !url.includes('api.deezer.com/search') && !url.includes('api.deezer.com/album') && !url.includes('api.deezer.com/track')
            return isDeezerUrl && isAudioFile && isNotApiEndpoint
          })
          if (deezerPreviewUrls.length > 0) {
            previewUrlToReturn = deezerPreviewUrls[deezerPreviewUrls.length - 1]
          }
        }
        
        return {
          bpm: null,
          source: cached.source,
          error: cached.error || 'ISRC mismatch: Found preview URL but ISRC does not match Spotify track (wrong audio file)',
          urlsTried,
          successfulUrl: previewUrlToReturn,
        }
        }
        
        const finalSelectedBpm = getSelectedBpm(cached)
        const finalSelectedKey = getSelectedKey(cached)
        
        // For Deezer URLs, prefer a URL from urls_tried instead of successful_url
        // because successful_url might be expired (403 error)
        let previewUrlToReturn = cached.successful_url || undefined
        if (urlsTried && Array.isArray(urlsTried) && urlsTried.length > 0) {
          // Find Deezer preview URLs in urls_tried (not API endpoints)
          const deezerPreviewUrls = urlsTried.filter((url: string) => {
            const isDeezerUrl = url.includes('deezer.com') || url.includes('cdn-preview') || url.includes('cdnt-preview')
            const isAudioFile = url.includes('.mp3') || url.includes('cdn-preview') || url.includes('cdnt-preview') || url.includes('/preview')
            const isNotApiEndpoint = !url.includes('api.deezer.com/search') && !url.includes('api.deezer.com/album') && !url.includes('api.deezer.com/track')
            return isDeezerUrl && isAudioFile && isNotApiEndpoint
          })
          if (deezerPreviewUrls.length > 0) {
            // Use the last Deezer preview URL from urls_tried (most recent)
            previewUrlToReturn = deezerPreviewUrls[deezerPreviewUrls.length - 1]
            console.log(`[BPM Module] Using Deezer preview URL from urls_tried instead of successful_url: ${previewUrlToReturn.substring(0, 100)}...`)
          }
        }
        
        return {
          bpm: finalSelectedBpm,
          source: cached.source,
          bpmRaw: (cached.bpm_selected === 'librosa' && cached.bpm_raw_librosa) ? cached.bpm_raw_librosa : (cached.bpm_raw_essentia || undefined),
          urlsTried,
          successfulUrl: previewUrlToReturn,
          key: finalSelectedKey.key || undefined,
          scale: finalSelectedKey.scale || undefined,
          keyConfidence: (cached.key_selected === 'librosa' && cached.keyscale_confidence_librosa) ? cached.keyscale_confidence_librosa : (cached.keyscale_confidence_essentia || undefined),
          bpmConfidence: (cached.bpm_selected === 'librosa' && cached.bpm_confidence_librosa) ? cached.bpm_confidence_librosa : (cached.bpm_confidence_essentia || undefined),
          // Full details for modal
          bpmEssentia: cached.bpm_essentia ?? undefined,
          bpmRawEssentia: cached.bpm_raw_essentia ?? undefined,
          bpmConfidenceEssentia: cached.bpm_confidence_essentia ?? undefined,
          bpmLibrosa: cached.bpm_librosa ?? undefined,
          bpmRawLibrosa: cached.bpm_raw_librosa ?? undefined,
          bpmConfidenceLibrosa: cached.bpm_confidence_librosa ?? undefined,
          keyEssentia: cached.key_essentia ?? undefined,
          scaleEssentia: cached.scale_essentia ?? undefined,
          keyscaleConfidenceEssentia: cached.keyscale_confidence_essentia ?? undefined,
          keyLibrosa: cached.key_librosa ?? undefined,
          scaleLibrosa: cached.scale_librosa ?? undefined,
          keyscaleConfidenceLibrosa: cached.keyscale_confidence_librosa ?? undefined,
          bpmSelected: (cached.bpm_selected as 'essentia' | 'librosa' | 'manual') || undefined,
          keySelected: (cached.key_selected as 'essentia' | 'librosa' | 'manual') || undefined,
          bpmManual: cached.bpm_manual ?? undefined,
          keyManual: cached.key_manual ?? undefined,
          scaleManual: cached.scale_manual ?? undefined,
          debugTxt: cached.debug_txt ?? undefined,
        }
      }
      // If cached but bpm is null, return the error if available
      if (cached && selectedBpm === null) {
        console.log(`[BPM Module] Cache hit with null BPM. Source: ${cached.source}, Error: ${cached.error}`)
        // Parse urls_tried from JSONB if present
        let urlsTried: string[] | undefined
        if (cached.urls_tried) {
          try {
            urlsTried = Array.isArray(cached.urls_tried) ? cached.urls_tried : JSON.parse(cached.urls_tried as any)
          } catch (e) {
            console.warn('[BPM Module] Error parsing urls_tried:', e)
          }
        }
        // For Deezer URLs, prefer a URL from urls_tried instead of successful_url
        let previewUrlToReturn = cached.successful_url || undefined
        if (urlsTried && Array.isArray(urlsTried) && urlsTried.length > 0) {
          const deezerPreviewUrls = urlsTried.filter((url: string) => {
            const isDeezerUrl = url.includes('deezer.com') || url.includes('cdn-preview') || url.includes('cdnt-preview')
            const isAudioFile = url.includes('.mp3') || url.includes('cdn-preview') || url.includes('cdnt-preview') || url.includes('/preview')
            const isNotApiEndpoint = !url.includes('api.deezer.com/search') && !url.includes('api.deezer.com/album') && !url.includes('api.deezer.com/track')
            return isDeezerUrl && isAudioFile && isNotApiEndpoint
          })
          if (deezerPreviewUrls.length > 0) {
            previewUrlToReturn = deezerPreviewUrls[deezerPreviewUrls.length - 1]
          }
        }
        
        return {
          bpm: null,
          source: cached.source,
          error: cached.error || undefined,
          urlsTried,
          successfulUrl: previewUrlToReturn,
        }
      }
      console.log(`[BPM Module] Cache miss. Cached record:`, cached)
      
      // 3. Resolve preview URL (stops at first successful source)
      console.log(`[BPM Module] Step 3: Resolving preview URL...`)
      const countryCode = getCountryCodeFromRequest(request)
      const previewResult = await resolvePreviewUrl({
        isrc: identifiers.isrc,
        title: identifiers.title,
        artists: identifiers.artists,
        countryCode,
      })
      console.log(`[BPM Module] Preview URL resolved:`, {
        hasUrl: !!previewResult.url,
        source: previewResult.source,
        url: previewResult.url?.substring(0, 100) + '...' || 'null',
      })
      
      if (!previewResult.url) {
        // No preview available - cache failure
        console.log(`[BPM Module] No preview URL found. Caching failure.`)
        
        // Generate descriptive error message based on source and ISRC mismatch
        let errorMessage = 'No preview URL found'
        if (previewResult.isrcMismatch) {
          errorMessage = 'ISRC mismatch: Found preview URL but ISRC does not match Spotify track (wrong audio file)'
        } else if (previewResult.source === 'computed_failed') {
          errorMessage = 'No preview audio available from any source (iTunes, Deezer)'
        } else if (previewResult.source === 'itunes_search') {
          errorMessage = 'No preview available on iTunes/Apple Music'
        } else if (previewResult.source === 'deezer_isrc' || previewResult.source === 'deezer_search') {
          errorMessage = 'No preview available on Deezer'
        }
        
        await storeInCache({
          spotifyTrackId,
          isrc: identifiers.isrc,
          artist: identifiers.artists,
          title: identifiers.title,
          source: previewResult.source,
          error: errorMessage,
          urlsTried: previewResult.urlsTried,
          successfulUrl: previewResult.successfulUrl,
          isrcMismatch: previewResult.isrcMismatch || false,
        })
        
        // For Deezer URLs, prefer a URL from urls_tried instead of successful_url
        let previewUrlToReturn = previewResult.successfulUrl
        if (previewResult.urlsTried && Array.isArray(previewResult.urlsTried) && previewResult.urlsTried.length > 0) {
          const deezerPreviewUrls = previewResult.urlsTried.filter((url: string) => {
            const isDeezerUrl = url.includes('deezer.com') || url.includes('cdn-preview') || url.includes('cdnt-preview')
            const isAudioFile = url.includes('.mp3') || url.includes('cdn-preview') || url.includes('cdnt-preview') || url.includes('/preview')
            const isNotApiEndpoint = !url.includes('api.deezer.com/search') && !url.includes('api.deezer.com/album') && !url.includes('api.deezer.com/track')
            return isDeezerUrl && isAudioFile && isNotApiEndpoint
          })
          if (deezerPreviewUrls.length > 0) {
            previewUrlToReturn = deezerPreviewUrls[deezerPreviewUrls.length - 1]
          }
        }
        
        return {
          bpm: null,
          source: previewResult.source,
          error: errorMessage,
          urlsTried: previewResult.urlsTried,
          successfulUrl: previewUrlToReturn,
        }
      }
      
      // 4. Call external BPM service (only if we have a preview URL)
      console.log(`[BPM Module] Step 4: Calling external BPM service...`)
      try {
        const bpmResult = await computeBpmFromService(previewResult.url)
        console.log(`[BPM Module] BPM computed by external service:`, bpmResult)
        
        // 5. Store in cache
        console.log(`[BPM Module] Step 5: Storing in cache...`)
        await storeInCache({
          spotifyTrackId,
          isrc: identifiers.isrc,
          artist: identifiers.artists,
          title: identifiers.title,
          bpmEssentia: bpmResult.bpmEssentia || null,
          bpmRawEssentia: bpmResult.bpmRawEssentia || null,
          bpmConfidenceEssentia: bpmResult.bpmConfidenceEssentia || null,
          bpmLibrosa: bpmResult.bpmLibrosa || null,
          bpmRawLibrosa: bpmResult.bpmRawLibrosa || null,
          bpmConfidenceLibrosa: bpmResult.bpmConfidenceLibrosa || null,
          keyEssentia: bpmResult.keyEssentia || null,
          scaleEssentia: bpmResult.scaleEssentia || null,
          keyscaleConfidenceEssentia: bpmResult.keyscaleConfidenceEssentia || null,
          keyLibrosa: bpmResult.keyLibrosa || null,
          scaleLibrosa: bpmResult.scaleLibrosa || null,
          keyscaleConfidenceLibrosa: bpmResult.keyscaleConfidenceLibrosa || null,
          source: previewResult.source,
          error: null,
          urlsTried: previewResult.urlsTried,
          successfulUrl: previewResult.successfulUrl,
          isrcMismatch: previewResult.isrcMismatch || false,
          debugTxt: bpmResult.debugTxt || null,
        })
        console.log(`[BPM Module] Successfully cached BPM for ${spotifyTrackId}`)
        
        // Determine which values to return based on confidence
        const finalBpm = (bpmResult.bpmLibrosa != null && bpmResult.bpmConfidenceLibrosa != null && 
                          bpmResult.bpmConfidenceLibrosa > (bpmResult.bpmConfidenceEssentia || 0))
          ? bpmResult.bpmLibrosa
          : (bpmResult.bpmEssentia || null)
        const finalBpmRaw = (bpmResult.bpmLibrosa != null && bpmResult.bpmConfidenceLibrosa != null && 
                             bpmResult.bpmConfidenceLibrosa > (bpmResult.bpmConfidenceEssentia || 0))
          ? bpmResult.bpmRawLibrosa
          : (bpmResult.bpmRawEssentia || null)
        const finalBpmConfidence = (bpmResult.bpmLibrosa != null && bpmResult.bpmConfidenceLibrosa != null && 
                                    bpmResult.bpmConfidenceLibrosa > (bpmResult.bpmConfidenceEssentia || 0))
          ? bpmResult.bpmConfidenceLibrosa
          : (bpmResult.bpmConfidenceEssentia || null)
        const finalKey = (bpmResult.keyLibrosa != null && bpmResult.keyscaleConfidenceLibrosa != null && 
                         bpmResult.keyscaleConfidenceLibrosa > (bpmResult.keyscaleConfidenceEssentia || 0))
          ? bpmResult.keyLibrosa
          : (bpmResult.keyEssentia || null)
        const finalScale = (bpmResult.scaleLibrosa != null && bpmResult.keyscaleConfidenceLibrosa != null && 
                           bpmResult.keyscaleConfidenceLibrosa > (bpmResult.keyscaleConfidenceEssentia || 0))
          ? bpmResult.scaleLibrosa
          : (bpmResult.scaleEssentia || null)
        const finalKeyConfidence = (bpmResult.keyLibrosa != null && bpmResult.keyscaleConfidenceLibrosa != null && 
                                   bpmResult.keyscaleConfidenceLibrosa > (bpmResult.keyscaleConfidenceEssentia || 0))
          ? bpmResult.keyscaleConfidenceLibrosa
          : (bpmResult.keyscaleConfidenceEssentia || null)
        
        // For Deezer URLs, prefer a URL from urls_tried instead of successful_url
        let previewUrlToReturn = previewResult.successfulUrl
        if (previewResult.urlsTried && Array.isArray(previewResult.urlsTried) && previewResult.urlsTried.length > 0) {
          const deezerPreviewUrls = previewResult.urlsTried.filter((url: string) => {
            const isDeezerUrl = url.includes('deezer.com') || url.includes('cdn-preview') || url.includes('cdnt-preview')
            const isAudioFile = url.includes('.mp3') || url.includes('cdn-preview') || url.includes('cdnt-preview') || url.includes('/preview')
            const isNotApiEndpoint = !url.includes('api.deezer.com/search') && !url.includes('api.deezer.com/album') && !url.includes('api.deezer.com/track')
            return isDeezerUrl && isAudioFile && isNotApiEndpoint
          })
          if (deezerPreviewUrls.length > 0) {
            previewUrlToReturn = deezerPreviewUrls[deezerPreviewUrls.length - 1]
            console.log(`[BPM Module] Using Deezer preview URL from urls_tried for new computation: ${previewUrlToReturn.substring(0, 100)}...`)
          }
        }
        
        return {
          bpm: finalBpm,
          source: previewResult.source,
          bpmRaw: finalBpmRaw || undefined,
          urlsTried: previewResult.urlsTried,
          successfulUrl: previewUrlToReturn,
          key: finalKey || undefined,
          scale: finalScale || undefined,
          keyConfidence: finalKeyConfidence || undefined,
          bpmConfidence: finalBpmConfidence || undefined,
          // Full details for modal
          bpmEssentia: bpmResult.bpmEssentia ?? undefined,
          bpmRawEssentia: bpmResult.bpmRawEssentia ?? undefined,
          bpmConfidenceEssentia: bpmResult.bpmConfidenceEssentia ?? undefined,
          bpmLibrosa: bpmResult.bpmLibrosa ?? undefined,
          bpmRawLibrosa: bpmResult.bpmRawLibrosa ?? undefined,
          bpmConfidenceLibrosa: bpmResult.bpmConfidenceLibrosa ?? undefined,
          keyEssentia: bpmResult.keyEssentia ?? undefined,
          scaleEssentia: bpmResult.scaleEssentia ?? undefined,
          keyscaleConfidenceEssentia: bpmResult.keyscaleConfidenceEssentia ?? undefined,
          keyLibrosa: bpmResult.keyLibrosa ?? undefined,
          scaleLibrosa: bpmResult.scaleLibrosa ?? undefined,
          keyscaleConfidenceLibrosa: bpmResult.keyscaleConfidenceLibrosa ?? undefined,
          bpmSelected: (bpmResult.bpmLibrosa != null && bpmResult.bpmConfidenceLibrosa != null && 
                        bpmResult.bpmConfidenceLibrosa > (bpmResult.bpmConfidenceEssentia || 0)) ? 'librosa' : 'essentia',
          keySelected: (bpmResult.keyLibrosa != null && bpmResult.keyscaleConfidenceLibrosa != null && 
                       bpmResult.keyscaleConfidenceLibrosa > (bpmResult.keyscaleConfidenceEssentia || 0)) ? 'librosa' : 'essentia',
          debugTxt: bpmResult.debugTxt ?? undefined,
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const { logError: logErrorUtil } = await import('./logger')
        logErrorUtil(error, {
          component: 'bpm.getBpmForSpotifyTrack',
          spotifyTrackId,
          action: 'compute_bpm',
          source: previewResult.source,
          hasPreviewUrl: !!previewResult.url,
          errorType: 'BpmComputationError',
        })
        
        // Cache the error (with short TTL - retry after 1 day)
        await storeInCache({
          spotifyTrackId,
          isrc: identifiers.isrc,
          artist: identifiers.artists,
          title: identifiers.title,
          source: previewResult.source,
          error: errorMessage,
          urlsTried: previewResult.urlsTried,
          successfulUrl: previewResult.successfulUrl,
          isrcMismatch: previewResult.isrcMismatch || false,
        })
        
        throw error
      }
    } finally {
      // Remove from in-flight computations
      inFlightComputations.delete(cacheKey)
    }
  })()
  
  // Store promise in map
  inFlightComputations.set(cacheKey, computationPromise)
  
  return computationPromise
}
