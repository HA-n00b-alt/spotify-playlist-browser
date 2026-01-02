import { query } from './db'
import { exec } from 'child_process'
import { promisify } from 'util'
import { unlinkSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getTrack } from './spotify'

const execAsync = promisify(exec)

interface PreviewUrlResult {
  url: string | null
  source: string
}

interface BpmResult {
  bpm: number | null
  source: string
  isrc?: string
  bpmRaw?: number
}

interface CacheRecord {
  id: number
  isrc: string | null
  spotify_track_id: string
  artist: string | null
  title: string | null
  bpm: number | null
  bpm_raw: number | null
  source: string
  updated_at: Date
  error: string | null
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
 * Check cache for existing BPM data
 */
async function checkCache(
  spotifyTrackId: string,
  isrc: string | null
): Promise<CacheRecord | null> {
  console.log(`[BPM Module] Checking cache for track: ${spotifyTrackId}, ISRC: ${isrc || 'none'}`)
  
  // Try ISRC first if available
  if (isrc) {
    const isrcResults = await query<CacheRecord>(
      `SELECT * FROM track_bpm_cache WHERE isrc = $1 LIMIT 1`,
      [isrc]
    )
    console.log(`[BPM Module] ISRC cache query result: ${isrcResults.length} records`)
    if (isrcResults.length > 0) {
      const record = isrcResults[0]
      // Check if cache is still valid
      const ageDays = (Date.now() - new Date(record.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      console.log(`[BPM Module] ISRC cache record age: ${ageDays.toFixed(2)} days, BPM: ${record.bpm}, valid: ${record.bpm !== null && ageDays < CACHE_TTL_DAYS}`)
      if (record.bpm !== null && ageDays < CACHE_TTL_DAYS) {
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
    if (record.bpm !== null && ageDays < CACHE_TTL_DAYS) {
      return record
    }
  }
  
  console.log(`[BPM Module] No valid cache found`)
  return null
}

/**
 * Resolve preview URL from multiple sources
 */
async function resolvePreviewUrl(params: {
  isrc: string | null
  title: string
  artists: string
  spotifyPreviewUrl: string | null
}): Promise<PreviewUrlResult> {
  const { isrc, title, artists, spotifyPreviewUrl } = params
  
  console.log(`[BPM Module] Resolving preview URL for: "${title}" by "${artists}" (ISRC: ${isrc || 'none'})`)
  
  // 1. Try Spotify preview first
  if (spotifyPreviewUrl) {
    console.log(`[BPM Module] Using Spotify preview URL`)
    return { url: spotifyPreviewUrl, source: 'spotify_preview' }
  }
  console.log(`[BPM Module] No Spotify preview URL, trying other sources...`)
  
  // 2. Try iTunes lookup by ISRC
  if (isrc) {
    try {
      console.log(`[BPM Module] Trying iTunes ISRC lookup for: ${isrc}`)
      const itunesLookupUrl = `https://itunes.apple.com/lookup?isrc=${encodeURIComponent(isrc)}`
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      try {
        const response = await fetch(itunesLookupUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        
        if (response.ok) {
          const data = await response.json() as any
          console.log(`[BPM Module] iTunes ISRC lookup result: ${data.resultCount} results`)
          if (data.resultCount > 0 && data.results[0]?.previewUrl) {
            console.log(`[BPM Module] Found iTunes preview URL via ISRC`)
            return { url: data.results[0].previewUrl, source: 'itunes_isrc' }
          }
        } else {
          console.log(`[BPM Module] iTunes ISRC lookup failed with status: ${response.status}`)
        }
      } catch (error) {
        clearTimeout(timeoutId)
        throw error
      }
    } catch (error) {
      console.warn(`[BPM Module] iTunes ISRC lookup error:`, error)
    }
  }
  
  // 3. Try iTunes search by artist + title
  try {
    console.log(`[BPM Module] Trying iTunes search for: "${artists} ${title}"`)
    const searchTerm = `${artists} ${title}`
    const itunesSearchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=song&limit=1`
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
        if (data.resultCount > 0 && data.results[0]?.previewUrl) {
          console.log(`[BPM Module] Found iTunes preview URL via search`)
          return { url: data.results[0].previewUrl, source: 'itunes_search' }
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
  
  // 4. Try Deezer search
  try {
    console.log(`[BPM Module] Trying Deezer search for: "${artists}" - "${title}"`)
    const deezerQuery = `artist:"${artists}" track:"${title}"`
    const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(deezerQuery)}`
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
        if (data.data && data.data.length > 0 && data.data[0]?.preview) {
          console.log(`[BPM Module] Found Deezer preview URL`)
          return { url: data.data[0].preview, source: 'deezer' }
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
  return { url: null, source: 'computed_failed' }
}

/**
 * Get ffmpeg binary path
 * Handles different ways ffmpeg-static can export the path
 * Works in both local and Vercel serverless environments
 */
function getFfmpegPath(): string {
  const fs = require('fs')
  const path = require('path')
  
  try {
    // Method 1: Direct require (CommonJS) - this is the standard way
    let ffmpegPath: string | undefined
    
    try {
      const ffmpegStatic = require('ffmpeg-static')
      
      // ffmpeg-static exports the path directly as a string
      if (typeof ffmpegStatic === 'string') {
        ffmpegPath = ffmpegStatic
      } else if (ffmpegStatic && typeof ffmpegStatic === 'object') {
        // Sometimes it's an object with a default export
        ffmpegPath = (ffmpegStatic as any).default || (ffmpegStatic as any).path || (ffmpegStatic as any).ffmpegPath
      }
      
      console.log(`[BPM Module] ffmpeg-static require result type: ${typeof ffmpegStatic}`)
      console.log(`[BPM Module] ffmpeg-static require result: ${JSON.stringify(ffmpegStatic).substring(0, 200)}`)
    } catch (e) {
      console.error('[BPM Module] Error requiring ffmpeg-static:', e)
      throw new Error(`Cannot require ffmpeg-static: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
    
    if (!ffmpegPath) {
      throw new Error('ffmpeg-static did not return a valid path')
    }
    
    // Resolve to absolute path if it's relative
    if (!path.isAbsolute(ffmpegPath)) {
      ffmpegPath = path.resolve(ffmpegPath)
    }
    
    console.log(`[BPM Module] Resolved ffmpeg path: ${ffmpegPath}`)
    
    // Verify the path exists
    if (!fs.existsSync(ffmpegPath)) {
      console.error(`[BPM Module] ffmpeg path does not exist: ${ffmpegPath}`)
      
      // Try to find it in node_modules as a fallback
      try {
        const ffmpegStaticModulePath = require.resolve('ffmpeg-static')
        console.log(`[BPM Module] ffmpeg-static module resolved to: ${ffmpegStaticModulePath}`)
        
        // ffmpeg-static v5+ stores binaries differently
        // Check if the resolved path is the binary itself
        if (fs.existsSync(ffmpegStaticModulePath)) {
          const stats = fs.statSync(ffmpegStaticModulePath)
          if (stats.isFile() && (ffmpegStaticModulePath.includes('ffmpeg') || stats.mode & 0o111)) {
            // This might be the binary
            console.log(`[BPM Module] Trying resolved module path as binary: ${ffmpegStaticModulePath}`)
            if (fs.existsSync(ffmpegStaticModulePath)) {
              ffmpegPath = ffmpegStaticModulePath
            }
          }
        }
      } catch (e) {
        console.error(`[BPM Module] Could not resolve ffmpeg-static module:`, e)
      }
      
      // Final check
      if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
        throw new Error(`ffmpeg binary not found at: ${ffmpegPath || 'undefined'}. This might be a Vercel deployment issue - ffmpeg-static binaries may not be included in serverless bundles.`)
      }
    }
    
    // At this point, ffmpegPath is guaranteed to be a string and exist
    if (!ffmpegPath) {
      throw new Error('ffmpeg path is undefined after all resolution attempts')
    }
    
    // Make sure it's executable (on Unix systems)
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(ffmpegPath, 0o755)
      } catch (e) {
        // Ignore chmod errors - might not have permission or might already be executable
        console.warn(`[BPM Module] Could not set executable permissions:`, e)
      }
    }
    
    console.log(`[BPM Module] Using ffmpeg at: ${ffmpegPath}`)
    return ffmpegPath
  } catch (error) {
    console.error('[BPM Module] Error getting ffmpeg path:', error)
    throw new Error(`Failed to locate ffmpeg-static: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Download audio preview and convert to WAV for analysis
 */
async function downloadAndConvertAudio(
  previewUrl: string,
  outputPath: string
): Promise<void> {
  const ffmpegPath = getFfmpegPath()
  console.log(`[BPM Module] Using ffmpeg at: ${ffmpegPath}`)
  
  // Download the audio file
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout
  
  try {
    console.log(`[BPM Module] Downloading audio from: ${previewUrl.substring(0, 100)}...`)
    const response = await fetch(previewUrl, {
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.status} ${response.statusText}`)
    }
    
    const buffer = await response.arrayBuffer()
    console.log(`[BPM Module] Downloaded ${buffer.byteLength} bytes`)
    const tempInputPath = join(tmpdir(), `bpm-input-${Date.now()}.tmp`)
    
    try {
      // Write input file
      writeFileSync(tempInputPath, Buffer.from(buffer))
      console.log(`[BPM Module] Wrote input file to: ${tempInputPath}`)
      
      // Convert to mono WAV at 44.1kHz using ffmpeg
      // Escape paths properly for shell execution
      const escapePath = (p: string) => p.replace(/ /g, '\\ ') // Basic escaping for spaces
      const ffmpegCommand = `${escapePath(ffmpegPath)} -i ${escapePath(tempInputPath)} -acodec pcm_s16le -ac 1 -ar 44100 -y ${escapePath(outputPath)}`
      console.log(`[BPM Module] Running ffmpeg command (truncated): ${ffmpegCommand.substring(0, 200)}...`)
      
      const { stdout, stderr } = await execAsync(ffmpegCommand, {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        timeout: 30000, // 30 second timeout
      })
      
      if (stdout) console.log(`[BPM Module] ffmpeg stdout: ${stdout.substring(0, 200)}`)
      if (stderr && !stderr.includes('Stream mapping')) {
        console.warn(`[BPM Module] ffmpeg stderr: ${stderr.substring(0, 200)}`)
      }
      
      console.log(`[BPM Module] ffmpeg conversion completed: ${outputPath}`)
      
      // Verify output file exists
      if (!require('fs').existsSync(outputPath)) {
        throw new Error(`Output file was not created: ${outputPath}`)
      }
      
      // Clean up input file
      try {
        unlinkSync(tempInputPath)
      } catch (e) {
        // Ignore cleanup errors
      }
    } catch (error) {
      console.error(`[BPM Module] Error during ffmpeg conversion:`, error)
      // Clean up on error
      try {
        unlinkSync(tempInputPath)
      } catch (e) {
        // Ignore cleanup errors
      }
      throw error
    }
  } catch (error) {
    clearTimeout(timeoutId)
    console.error(`[BPM Module] Error downloading audio:`, error)
    throw error
  }
}

/**
 * Compute BPM from audio file
 */
async function computeBpm(audioFilePath: string): Promise<{ bpm: number; bpmRaw: number }> {
  // Read audio file
  const audioBuffer = readFileSync(audioFilePath)
  
  // Use autocorrelation-based tempo detection
  // Note: This library expects an AudioBuffer, but we can work with raw PCM data
  // For simplicity, we'll use a different approach with a simpler BPM detector
  
  // Alternative: Use a simpler tempo detection algorithm
  // For now, we'll use a basic autocorrelation-based approach
  
  // Convert buffer to Float32Array (assuming 16-bit PCM)
  const samples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2)
  const floatSamples = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    floatSamples[i] = samples[i] / 32768.0
  }
  
  // Simple BPM detection using autocorrelation
  const sampleRate = 44100
  const bpmRaw = detectTempo(floatSamples, sampleRate)
  
  // Normalize BPM (handle half/double time)
  let bpm = bpmRaw
  while (bpm < 70 && bpm > 0) {
    bpm *= 2
  }
  while (bpm > 200) {
    bpm /= 2
  }
  
  // Round to 1 decimal place
  bpm = Math.round(bpm * 10) / 10
  
  return { bpm, bpmRaw }
}

/**
 * Improved tempo detection using autocorrelation with energy-based preprocessing
 * This implementation works reasonably well for most pop/EDM tracks
 */
function detectTempo(samples: Float32Array, sampleRate: number): number {
  // Normalize samples
  const normalized = new Float32Array(samples.length)
  let max = 0
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i])
    if (abs > max) max = abs
  }
  if (max === 0) return 0
  
  for (let i = 0; i < samples.length; i++) {
    normalized[i] = samples[i] / max
  }
  
  // Apply high-pass filter (simple difference) to emphasize beats
  const filtered = new Float32Array(normalized.length - 1)
  for (let i = 0; i < filtered.length; i++) {
    filtered[i] = Math.abs(normalized[i + 1] - normalized[i])
  }
  
  // Autocorrelation on filtered signal
  const minPeriod = Math.floor(sampleRate / 200) // 200 BPM max
  const maxPeriod = Math.floor(sampleRate / 60)   // 60 BPM min
  
  let maxCorrelation = 0
  let bestPeriod = 0
  
  // Sample autocorrelation at intervals for performance
  const step = Math.max(1, Math.floor((maxPeriod - minPeriod) / 200))
  
  for (let period = minPeriod; period < maxPeriod && period < filtered.length / 2; period += step) {
    let correlation = 0
    const numSamples = Math.min(filtered.length - period, 15000) // Limit for performance
    
    for (let i = 0; i < numSamples; i += 10) { // Sample every 10th point for speed
      correlation += filtered[i] * filtered[i + period]
    }
    
    correlation /= (numSamples / 10)
    
    // Weight by period (prefer common BPM ranges)
    const bpm = (sampleRate / period) * 60
    const weight = (bpm >= 80 && bpm <= 160) ? 1.2 : 1.0
    correlation *= weight
    
    if (correlation > maxCorrelation) {
      maxCorrelation = correlation
      bestPeriod = period
    }
  }
  
  // Refine around best period
  if (bestPeriod > 0) {
    const refineRange = Math.max(2, Math.floor(step / 2))
    for (let period = bestPeriod - refineRange; period <= bestPeriod + refineRange; period++) {
      if (period < minPeriod || period >= maxPeriod || period >= filtered.length / 2) continue
      
      let correlation = 0
      const numSamples = Math.min(filtered.length - period, 15000)
      
      for (let i = 0; i < numSamples; i += 5) {
        correlation += filtered[i] * filtered[i + period]
      }
      
      correlation /= (numSamples / 5)
      
      const bpm = (sampleRate / period) * 60
      const weight = (bpm >= 80 && bpm <= 160) ? 1.2 : 1.0
      correlation *= weight
      
      if (correlation > maxCorrelation) {
        maxCorrelation = correlation
        bestPeriod = period
      }
    }
  }
  
  if (bestPeriod === 0 || maxCorrelation < 0.1) {
    return 0
  }
  
  // Convert period to BPM
  const bpm = (sampleRate / bestPeriod) * 60
  return bpm
}

/**
 * Store BPM result in cache
 */
async function storeInCache(params: {
  spotifyTrackId: string
  isrc: string | null
  artist: string
  title: string
  bpm: number | null
  bpmRaw: number | null
  source: string
  error: string | null
}): Promise<void> {
  const { spotifyTrackId, isrc, artist, title, bpm, bpmRaw, source, error } = params
  
  // Check if record exists
  const existing = await query<CacheRecord>(
    `SELECT id FROM track_bpm_cache WHERE spotify_track_id = $1 LIMIT 1`,
    [spotifyTrackId]
  )
  
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
           updated_at = NOW()
       WHERE spotify_track_id = $8`,
      [isrc, artist, title, bpm, bpmRaw, source, error, spotifyTrackId]
    )
  } else {
    // Insert new record
    await query(
      `INSERT INTO track_bpm_cache 
       (isrc, spotify_track_id, artist, title, bpm, bpm_raw, source, error, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (spotify_track_id) DO UPDATE SET
         isrc = COALESCE(EXCLUDED.isrc, track_bpm_cache.isrc),
         artist = EXCLUDED.artist,
         title = EXCLUDED.title,
         bpm = EXCLUDED.bpm,
         bpm_raw = EXCLUDED.bpm_raw,
         source = EXCLUDED.source,
         error = EXCLUDED.error,
         updated_at = NOW()`,
      [isrc, spotifyTrackId, artist, title, bpm, bpmRaw, source, error]
    )
  }
}

/**
 * Main function to get BPM for a Spotify track
 */
export async function getBpmForSpotifyTrack(
  spotifyTrackId: string
): Promise<BpmResult> {
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
      if (cached && cached.bpm !== null) {
        console.log(`[BPM Module] Cache hit! Returning cached BPM: ${cached.bpm} (source: ${cached.source})`)
        return {
          bpm: cached.bpm,
          source: cached.source,
          isrc: cached.isrc || undefined,
          bpmRaw: cached.bpm_raw || undefined,
        }
      }
      console.log(`[BPM Module] Cache miss or null BPM. Cached record:`, cached)
      
      // 3. Resolve preview URL
      console.log(`[BPM Module] Step 3: Resolving preview URL...`)
      const previewResult = await resolvePreviewUrl({
        isrc: identifiers.isrc,
        title: identifiers.title,
        artists: identifiers.artists,
        spotifyPreviewUrl: identifiers.spotifyPreviewUrl,
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
          isrc: identifiers.isrc,
          artist: identifiers.artists,
          title: identifiers.title,
          bpm: null,
          bpmRaw: null,
          source: previewResult.source,
          error: 'No preview URL found',
        })
        
        return {
          bpm: null,
          source: previewResult.source,
          isrc: identifiers.isrc || undefined,
        }
      }
      
      // 4. Download and convert audio
      console.log(`[BPM Module] Step 4: Downloading and converting audio...`)
      const outputPath = join(tmpdir(), `bpm-output-${Date.now()}.wav`)
      try {
        await downloadAndConvertAudio(previewResult.url, outputPath)
        console.log(`[BPM Module] Audio downloaded and converted to: ${outputPath}`)
        
        // 5. Compute BPM
        console.log(`[BPM Module] Step 5: Computing BPM from audio...`)
        const { bpm, bpmRaw } = await computeBpm(outputPath)
        console.log(`[BPM Module] BPM computed:`, { bpm, bpmRaw })
        
        // 6. Store in cache
        console.log(`[BPM Module] Step 6: Storing in cache...`)
        await storeInCache({
          spotifyTrackId,
          isrc: identifiers.isrc,
          artist: identifiers.artists,
          title: identifiers.title,
          bpm,
          bpmRaw,
          source: previewResult.source,
          error: null,
        })
        console.log(`[BPM Module] Successfully cached BPM for ${spotifyTrackId}`)
        
        // Clean up audio file
        try {
          unlinkSync(outputPath)
        } catch (e) {
          // Ignore cleanup errors
        }
        
        return {
          bpm,
          source: previewResult.source,
          isrc: identifiers.isrc || undefined,
          bpmRaw,
        }
      } catch (error) {
        // Clean up on error
        try {
          unlinkSync(outputPath)
        } catch (e) {
          // Ignore cleanup errors
        }
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[BPM Module] Error during BPM computation:`, errorMessage)
        if (error instanceof Error) {
          console.error(`[BPM Module] Error stack:`, error.stack)
        }
        
        // Cache the error (with short TTL - retry after 1 day)
        await storeInCache({
          spotifyTrackId,
          isrc: identifiers.isrc,
          artist: identifiers.artists,
          title: identifiers.title,
          bpm: null,
          bpmRaw: null,
          source: previewResult.source,
          error: errorMessage,
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

