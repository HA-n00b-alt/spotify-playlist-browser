import { query } from './db'
import { getTrack } from './spotify'
import { GoogleAuth } from 'google-auth-library'
import { isValidSpotifyTrackId } from './spotify-validation'

interface PreviewUrlResult {
  url: string | null
  source: string
  urlsTried: string[] // URLs that were attempted
  successfulUrl: string | null // URL that succeeded (or null if all failed)
}

interface BpmResult {
  bpm: number | null
  source: string
  upc?: string
  bpmRaw?: number
  error?: string
  urlsTried?: string[]
  successfulUrl?: string | null
}

interface CacheRecord {
  id: number
  isrc: string | null // Note: DB column name is 'isrc' but we use it to store UPC
  spotify_track_id: string
  artist: string | null
  title: string | null
  bpm: number | null
  bpm_raw: number | null
  source: string
  updated_at: Date
  error: string | null
  urls_tried?: string[] | null
  successful_url?: string | null
}

// In-flight computation locks to prevent duplicate work
const inFlightComputations = new Map<string, Promise<BpmResult>>()

// Cache TTL: 90 days
const CACHE_TTL_DAYS = 90

/**
 * Extract identifiers from Spotify track
 */
async function extractSpotifyIdentifiers(spotifyTrackId: string): Promise<{
  upc: string | null
  title: string
  artists: string
  spotifyPreviewUrl: string | null
}> {
  console.log(`[BPM Module] Fetching track data from Spotify for: ${spotifyTrackId}`)
  const track = await getTrack(spotifyTrackId)
  console.log(`[BPM Module] Track data received:`, {
    name: track.name,
    hasUPC: !!track.album?.external_ids?.upc,
    upc: track.album?.external_ids?.upc,
    hasPreview: !!track.preview_url,
    artists: track.artists?.map((a: any) => a.name).join(', '),
  })
  
  return {
    upc: track.album?.external_ids?.upc || null,
    title: track.name,
    artists: track.artists.map((a: any) => a.name).join(' '),
    spotifyPreviewUrl: track.preview_url || null,
  }
}

/**
 * Check cache for existing BPM data
 */
async function checkCache(
  spotifyTrackId: string,
  upc: string | null
): Promise<CacheRecord | null> {
  console.log(`[BPM Module] Checking cache for track: ${spotifyTrackId}, UPC: ${upc || 'none'}`)
  
  // Try UPC first if available (stored in isrc column for backward compatibility)
  if (upc) {
    const upcResults = await query<CacheRecord>(
      `SELECT * FROM track_bpm_cache WHERE isrc = $1 LIMIT 1`,
      [upc]
    )
    console.log(`[BPM Module] UPC cache query result: ${upcResults.length} records`)
    if (upcResults.length > 0) {
      const record = upcResults[0]
      // Check if cache is still valid
      const ageDays = (Date.now() - new Date(record.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      console.log(`[BPM Module] UPC cache record age: ${ageDays.toFixed(2)} days, BPM: ${record.bpm}, valid: ${record.bpm !== null && ageDays < CACHE_TTL_DAYS}`)
      // Return valid BPM records, or records with null BPM (for error info)
      if (record.bpm !== null && ageDays < CACHE_TTL_DAYS) {
        return record
      } else if (record.bpm === null) {
        // Return null BPM records to get error information
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
    console.log(`[BPM Module] Track ID cache record age: ${ageDays.toFixed(2)} days, BPM: ${record.bpm}, valid: ${record.bpm !== null && ageDays < CACHE_TTL_DAYS}`)
    // Return valid BPM records, or records with null BPM (for error info)
    if (record.bpm !== null && ageDays < CACHE_TTL_DAYS) {
      return record
    } else if (record.bpm === null) {
      // Return null BPM records to get error information
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
 * Resolve preview URL from multiple sources
 * Stops at first successful source
 */
async function resolvePreviewUrl(params: {
  upc: string | null
  title: string
  artists: string
  countryCode?: string
}): Promise<PreviewUrlResult> {
  const { upc, title, artists, countryCode = 'us' } = params
  
  console.log(`[BPM Module] Resolving preview URL for: "${title}" by "${artists}" (UPC: ${upc || 'none'}, Country: ${countryCode})`)
  
  const urlsTried: string[] = []
  const limit = 1 // Limit results to 1
  
  // 1. Try iTunes UPC lookup
  if (upc) {
    try {
      console.log(`[BPM Module] Trying iTunes UPC lookup for: ${upc}`)
      const itunesUpcUrl = `https://itunes.apple.com/lookup?upc=${encodeURIComponent(upc)}&entity=song&country=${countryCode}&limit=${limit}`
      urlsTried.push(itunesUpcUrl)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      try {
        const response = await fetch(itunesUpcUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        
        if (response.ok) {
          const data = await response.json() as any
          console.log(`[BPM Module] iTunes UPC lookup result: ${data.resultCount} results`)
          if (data.resultCount > 0 && data.results) {
            // Filter to items where kind === "song" and previewUrl exists
            const tracks = data.results.filter((r: any) => 
              (r.kind === 'song' || r.wrapperType === 'track') && r.previewUrl
            )
            if (tracks.length > 0 && tracks[0].previewUrl) {
              console.log(`[BPM Module] Found iTunes preview URL via UPC`)
              return { 
                url: tracks[0].previewUrl, 
                source: 'itunes_upc', 
                urlsTried,
                successfulUrl: tracks[0].previewUrl
              }
            }
          }
        } else {
          console.log(`[BPM Module] iTunes UPC lookup failed with status: ${response.status}`)
        }
      } catch (error) {
        clearTimeout(timeoutId)
        throw error
      }
    } catch (error) {
      console.warn(`[BPM Module] iTunes UPC lookup error:`, error)
    }
  }
  
  // 2. Try iTunes search by artist + title
  try {
    console.log(`[BPM Module] Trying iTunes search for: "${artists} ${title}"`)
    const searchTerm = `${artists} ${title}`
    const itunesSearchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&media=music&entity=song&country=${countryCode}&limit=${limit}`
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
          if (tracks.length > 0 && tracks[0].previewUrl) {
            console.log(`[BPM Module] Found iTunes preview URL via search`)
            return { 
              url: tracks[0].previewUrl, 
              source: 'itunes_search', 
              urlsTried,
              successfulUrl: tracks[0].previewUrl
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
  
  // 3. Try Deezer UPC lookup (requires two API calls)
  if (upc) {
    try {
      console.log(`[BPM Module] Trying Deezer UPC lookup for: ${upc}`)
      // Step 1: Get album by UPC
      const deezerAlbumUrl = `https://api.deezer.com/album/upc:${encodeURIComponent(upc)}`
      urlsTried.push(deezerAlbumUrl)
      const controller1 = new AbortController()
      const timeoutId1 = setTimeout(() => controller1.abort(), 5000)
      
      try {
        const albumResponse = await fetch(deezerAlbumUrl, {
          signal: controller1.signal,
        })
        clearTimeout(timeoutId1)
        
        if (albumResponse.ok) {
          const albumData = await albumResponse.json() as any
          console.log(`[BPM Module] Deezer album lookup result:`, albumData.id ? 'found' : 'not found')
          
          if (albumData.id && albumData.tracklist) {
            // Step 2: Get tracklist
            const tracklistUrl = albumData.tracklist
            urlsTried.push(tracklistUrl)
            const controller2 = new AbortController()
            const timeoutId2 = setTimeout(() => controller2.abort(), 5000)
            
            try {
              const tracklistResponse = await fetch(tracklistUrl, {
                signal: controller2.signal,
              })
              clearTimeout(timeoutId2)
              
              if (tracklistResponse.ok) {
                const tracklistData = await tracklistResponse.json() as any
                console.log(`[BPM Module] Deezer tracklist result: ${tracklistData.data?.length || 0} tracks`)
                
                if (tracklistData.data && Array.isArray(tracklistData.data)) {
                  // Filter out items missing preview
                  const tracksWithPreview = tracklistData.data.filter((t: any) => t.preview)
                  if (tracksWithPreview.length > 0 && tracksWithPreview[0].preview) {
                    console.log(`[BPM Module] Found Deezer preview URL via UPC`)
                    return { 
                      url: tracksWithPreview[0].preview, 
                      source: 'deezer_upc', 
                      urlsTried,
                      successfulUrl: tracksWithPreview[0].preview
                    }
                  }
                }
              } else {
                console.log(`[BPM Module] Deezer tracklist failed with status: ${tracklistResponse.status}`)
              }
            } catch (error) {
              clearTimeout(timeoutId2)
              throw error
            }
          }
        } else {
          console.log(`[BPM Module] Deezer album lookup failed with status: ${albumResponse.status}`)
        }
      } catch (error) {
        clearTimeout(timeoutId1)
        throw error
      }
    } catch (error) {
      console.warn(`[BPM Module] Deezer UPC lookup error:`, error)
    }
  }
  
  // 4. Try Deezer search
  try {
    console.log(`[BPM Module] Trying Deezer search for: "${artists} ${title}"`)
    const deezerQuery = `${artists} ${title}`
    const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(deezerQuery)}&limit=${limit}`
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
          if (tracksWithPreview.length > 0 && tracksWithPreview[0].preview) {
            console.log(`[BPM Module] Found Deezer preview URL`)
            return { 
              url: tracksWithPreview[0].preview, 
              source: 'deezer', 
              urlsTried,
              successfulUrl: tracksWithPreview[0].preview
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
  return { url: null, source: 'computed_failed', urlsTried, successfulUrl: null }
}

/**
 * Get Google Cloud Identity Token for authenticating with Cloud Run service
 */
async function getIdentityToken(serviceUrl: string): Promise<string> {
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
 */
async function computeBpmFromService(previewUrl: string): Promise<{ bpm: number; bpmRaw: number; confidence?: number }> {
  const serviceUrl = process.env.BPM_SERVICE_URL || 'https://bpm-service-340051416180.europe-west3.run.app'
  
  console.log(`[BPM Module] Calling external BPM service at: ${serviceUrl}`)
  
  // Get identity token for authentication
  const idToken = await getIdentityToken(serviceUrl)
  
  // Call the service
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout
  
  console.log(`[BPM Module] Sending preview URL to BPM service:`, previewUrl)
  console.log(`[BPM Module] URL details:`, {
    isDeezer: previewUrl.includes('deezer') || previewUrl.includes('cdn-preview') || previewUrl.includes('cdnt-preview'),
    hasHdnea: previewUrl.includes('hdnea'),
    urlLength: previewUrl.length,
  })
  
  try {
    const response = await fetch(`${serviceUrl}/bpm`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: previewUrl }),
      // Log the URL being sent to BPM service
      // Note: This is the same URL that gets stored in successful_url in the database
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`BPM service returned ${response.status}: ${errorText}`)
    }
    
    const data = await response.json() as {
      bpm: number
      bpm_raw: number
      confidence?: number
      key?: string
      scale?: string
      key_confidence?: number
      source_url_host?: string
    }
    
    console.log(`[BPM Module] BPM service response:`, {
      bpm: data.bpm,
      bpm_raw: data.bpm_raw,
      confidence: data.confidence,
      key: data.key,
      scale: data.scale,
      key_confidence: data.key_confidence,
      source: data.source_url_host,
    })
    
    return {
      bpm: data.bpm,
      bpmRaw: data.bpm_raw,
      confidence: data.confidence,
      // Note: key, scale, key_confidence are parsed but not yet used
      // They will be added to the response later
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
 * Store BPM result in cache
 */
async function storeInCache(params: {
  spotifyTrackId: string
  upc: string | null
  artist: string
  title: string
  bpm: number | null
  bpmRaw: number | null
  source: string
  error: string | null
  urlsTried?: string[]
  successfulUrl?: string | null
}): Promise<void> {
  const { spotifyTrackId, upc, artist, title, bpm, bpmRaw, source, error, urlsTried, successfulUrl } = params
  
  // Check if record exists
  const existing = await query<CacheRecord>(
    `SELECT id FROM track_bpm_cache WHERE spotify_track_id = $1 LIMIT 1`,
    [spotifyTrackId]
  )
  
  // Convert urlsTried array to JSON for storage
  const urlsTriedJson = urlsTried && urlsTried.length > 0 ? JSON.stringify(urlsTried) : null

  if (existing.length > 0) {
    // Update existing record
    await query(
      `UPDATE track_bpm_cache 
       SET isrc = COALESCE($1, isrc), 
           artist = $2, 
           title = $3, 
           bpm = $4, 
           bpm_raw = $5, 
           source = $6, 
           error = $7,
           urls_tried = COALESCE($8::jsonb, urls_tried),
           successful_url = COALESCE($9, successful_url),
           updated_at = NOW()
       WHERE spotify_track_id = $10`,
      [upc, artist, title, bpm, bpmRaw, source, error, urlsTriedJson, successfulUrl, spotifyTrackId]
    )
  } else {
    // Insert new record
    await query(
      `INSERT INTO track_bpm_cache 
       (isrc, spotify_track_id, artist, title, bpm, bpm_raw, source, error, urls_tried, successful_url, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, NOW())
       ON CONFLICT (spotify_track_id) DO UPDATE SET
         isrc = COALESCE(EXCLUDED.isrc, track_bpm_cache.isrc),
         artist = EXCLUDED.artist,
         title = EXCLUDED.title,
         bpm = EXCLUDED.bpm,
         bpm_raw = EXCLUDED.bpm_raw,
         source = EXCLUDED.source,
         error = EXCLUDED.error,
         urls_tried = COALESCE(EXCLUDED.urls_tried, track_bpm_cache.urls_tried),
         successful_url = COALESCE(EXCLUDED.successful_url, track_bpm_cache.successful_url),
         updated_at = NOW()`,
      [upc, spotifyTrackId, artist, title, bpm, bpmRaw, source, error, urlsTriedJson, successfulUrl]
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
  // Validate track ID format
  if (!isValidSpotifyTrackId(spotifyTrackId)) {
    const errorMessage = `Invalid Spotify track ID format: ${spotifyTrackId}`
    console.error(`[BPM Module] ${errorMessage}`)
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
        upc: identifiers.upc,
        title: identifiers.title,
        artists: identifiers.artists,
        hasSpotifyPreview: !!identifiers.spotifyPreviewUrl,
      })
      
      // 2. Check cache
      console.log(`[BPM Module] Step 2: Checking cache...`)
      const cached = await checkCache(spotifyTrackId, identifiers.upc)
      if (cached && cached.bpm !== null) {
        console.log(`[BPM Module] Cache hit! Returning cached BPM: ${cached.bpm} (source: ${cached.source})`)
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
          bpm: cached.bpm,
          source: cached.source,
          upc: cached.isrc || undefined, // Note: UPC stored in isrc column
          bpmRaw: cached.bpm_raw || undefined,
          urlsTried,
          successfulUrl: cached.successful_url || undefined,
        }
      }
      // If cached but bpm is null, return the error if available
      if (cached && cached.bpm === null) {
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
          upc: cached.isrc || undefined, // Note: UPC stored in isrc column
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
        upc: identifiers.upc,
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
        await storeInCache({
          spotifyTrackId,
          upc: identifiers.upc,
          artist: identifiers.artists,
          title: identifiers.title,
          bpm: null,
          bpmRaw: null,
          source: previewResult.source,
          error: 'No preview URL found',
          urlsTried: previewResult.urlsTried,
          successfulUrl: previewResult.successfulUrl,
        })
        
        // Generate descriptive error message based on source
        let errorMessage = 'No preview URL found'
        if (previewResult.source === 'computed_failed') {
          errorMessage = 'No preview audio available from any source (iTunes, Deezer)'
        } else if (previewResult.source === 'itunes_upc' || previewResult.source === 'itunes_search') {
          errorMessage = 'No preview available on iTunes/Apple Music'
        } else if (previewResult.source === 'deezer_upc' || previewResult.source === 'deezer') {
          errorMessage = 'No preview available on Deezer'
        }
        
        return {
          bpm: null,
          source: previewResult.source,
          upc: identifiers.upc || undefined,
          error: errorMessage,
          urlsTried: previewResult.urlsTried,
          successfulUrl: previewResult.successfulUrl,
        }
      }
      
      // 4. Call external BPM service (only if we have a preview URL)
      console.log(`[BPM Module] Step 4: Calling external BPM service...`)
      try {
        const { bpm, bpmRaw } = await computeBpmFromService(previewResult.url)
        console.log(`[BPM Module] BPM computed by external service:`, { bpm, bpmRaw })
        
        // 5. Store in cache
        console.log(`[BPM Module] Step 5: Storing in cache...`)
        await storeInCache({
          spotifyTrackId,
          upc: identifiers.upc,
          artist: identifiers.artists,
          title: identifiers.title,
          bpm,
          bpmRaw,
          source: previewResult.source,
          error: null,
          urlsTried: previewResult.urlsTried,
          successfulUrl: previewResult.successfulUrl,
        })
        console.log(`[BPM Module] Successfully cached BPM for ${spotifyTrackId}`)
        
        return {
          bpm,
          source: previewResult.source,
          upc: identifiers.upc || undefined,
          bpmRaw,
          urlsTried: previewResult.urlsTried,
          successfulUrl: previewResult.successfulUrl,
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[BPM Module] Error during BPM computation:`, errorMessage)
        if (error instanceof Error) {
          console.error(`[BPM Module] Error stack:`, error.stack)
        }
        
        // Cache the error (with short TTL - retry after 1 day)
        await storeInCache({
          spotifyTrackId,
          upc: identifiers.upc,
          artist: identifiers.artists,
          title: identifiers.title,
          bpm: null,
          bpmRaw: null,
          source: previewResult.source,
          error: errorMessage,
          urlsTried: previewResult.urlsTried,
          successfulUrl: previewResult.successfulUrl,
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
