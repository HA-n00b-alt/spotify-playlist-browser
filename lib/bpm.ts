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
 * Uses the new /analyze/batch endpoint (with single URL in array)
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
  const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout
  
  console.log(`[BPM Module] Sending preview URL to BPM service:`, previewUrl)
  console.log(`[BPM Module] URL details:`, {
    isDeezer: previewUrl.includes('deezer') || previewUrl.includes('cdn-preview') || previewUrl.includes('cdnt-preview'),
    hasHdnea: previewUrl.includes('hdnea'),
    urlLength: previewUrl.length,
  })
  
  try {
    const response = await fetch(`${serviceUrl}/analyze/batch`, {
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
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`BPM service returned ${response.status}: ${errorText}`)
    }
    
    const responseData = await response.json()
    console.log(`[BPM Module] BPM service raw response:`, {
      type: typeof responseData,
      isArray: Array.isArray(responseData),
      hasResults: responseData && typeof responseData === 'object' && 'results' in responseData,
      hasData: responseData && typeof responseData === 'object' && 'data' in responseData,
      keys: responseData && typeof responseData === 'object' ? Object.keys(responseData) : [],
      preview: JSON.stringify(responseData).substring(0, 200),
    })
    
    // Handle different response formats
    let results: Array<{
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
    }>
    
    if (Array.isArray(responseData)) {
      results = responseData
    } else if (responseData && typeof responseData === 'object' && 'results' in responseData && Array.isArray(responseData.results)) {
      results = responseData.results
    } else if (responseData && typeof responseData === 'object' && 'data' in responseData && Array.isArray(responseData.data)) {
      results = responseData.data
    } else {
      throw new Error(`BPM service returned unexpected response format: ${JSON.stringify(responseData).substring(0, 500)}`)
    }
    
    if (!results || results.length === 0) {
      throw new Error('BPM service returned empty results')
    }
    
    const data = results[0]
    
    if (!data || typeof data !== 'object') {
      console.error(`[BPM Module] Invalid result data:`, {
        data,
        dataType: typeof data,
        resultsLength: results.length,
        resultsPreview: results.map((r, i) => ({ index: i, type: typeof r, keys: r && typeof r === 'object' ? Object.keys(r) : [] })),
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
              
              // Get updated selected values
              const updatedSelectedBpm = getSelectedBpm(cached)
              const updatedSelectedKey = getSelectedKey(cached)
              
              return {
                bpm: updatedSelectedBpm,
                source: cached.source,
                bpmRaw: (cached.bpm_selected === 'librosa' && cached.bpm_raw_librosa) ? cached.bpm_raw_librosa : (cached.bpm_raw_essentia || undefined),
                urlsTried: previewResult.urlsTried,
                successfulUrl: previewResult.successfulUrl || cached.successful_url || undefined,
                key: updatedSelectedKey.key || undefined,
                scale: updatedSelectedKey.scale || undefined,
                keyConfidence: (cached.key_selected === 'librosa' && cached.keyscale_confidence_librosa) ? cached.keyscale_confidence_librosa : (cached.keyscale_confidence_essentia || undefined),
                bpmConfidence: (cached.bpm_selected === 'librosa' && cached.bpm_confidence_librosa) ? cached.bpm_confidence_librosa : (cached.bpm_confidence_essentia || undefined),
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
          return {
            bpm: null,
            source: cached.source,
            error: cached.error || 'ISRC mismatch: Found preview URL but ISRC does not match Spotify track (wrong audio file)',
            urlsTried,
            successfulUrl: cached.successful_url || undefined,
          }
        }
        
        const finalSelectedBpm = getSelectedBpm(cached)
        const finalSelectedKey = getSelectedKey(cached)
        
        return {
          bpm: finalSelectedBpm,
          source: cached.source,
          bpmRaw: (cached.bpm_selected === 'librosa' && cached.bpm_raw_librosa) ? cached.bpm_raw_librosa : (cached.bpm_raw_essentia || undefined),
          urlsTried,
          successfulUrl: cached.successful_url || undefined,
          key: finalSelectedKey.key || undefined,
          scale: finalSelectedKey.scale || undefined,
          keyConfidence: (cached.key_selected === 'librosa' && cached.keyscale_confidence_librosa) ? cached.keyscale_confidence_librosa : (cached.keyscale_confidence_essentia || undefined),
          bpmConfidence: (cached.bpm_selected === 'librosa' && cached.bpm_confidence_librosa) ? cached.bpm_confidence_librosa : (cached.bpm_confidence_essentia || undefined),
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
        return {
          bpm: null,
          source: cached.source,
          error: cached.error || undefined,
          urlsTried,
          successfulUrl: cached.successful_url || undefined,
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
        
        return {
          bpm: null,
          source: previewResult.source,
          error: errorMessage,
          urlsTried: previewResult.urlsTried,
          successfulUrl: previewResult.successfulUrl,
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
        
        return {
          bpm: finalBpm,
          source: previewResult.source,
          bpmRaw: finalBpmRaw || undefined,
          urlsTried: previewResult.urlsTried,
          successfulUrl: previewResult.successfulUrl,
          key: finalKey || undefined,
          scale: finalScale || undefined,
          keyConfidence: finalKeyConfidence || undefined,
          bpmConfidence: finalBpmConfidence || undefined,
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
