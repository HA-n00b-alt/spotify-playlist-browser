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
  const track = await getTrack(spotifyTrackId)
  
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
  // Try ISRC first if available
  if (isrc) {
    const isrcResults = await query<CacheRecord>(
      `SELECT * FROM track_bpm_cache WHERE isrc = $1 LIMIT 1`,
      [isrc]
    )
    if (isrcResults.length > 0) {
      const record = isrcResults[0]
      // Check if cache is still valid
      const ageDays = (Date.now() - new Date(record.updated_at).getTime()) / (1000 * 60 * 60 * 24)
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
  if (trackResults.length > 0) {
    const record = trackResults[0]
    const ageDays = (Date.now() - new Date(record.updated_at).getTime()) / (1000 * 60 * 60 * 24)
    if (record.bpm !== null && ageDays < CACHE_TTL_DAYS) {
      return record
    }
  }
  
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
  
  // 1. Try Spotify preview first
  if (spotifyPreviewUrl) {
    return { url: spotifyPreviewUrl, source: 'spotify_preview' }
  }
  
  // 2. Try iTunes lookup by ISRC
  if (isrc) {
    try {
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
          if (data.resultCount > 0 && data.results[0]?.previewUrl) {
            return { url: data.results[0].previewUrl, source: 'itunes_isrc' }
          }
        }
      } catch (error) {
        clearTimeout(timeoutId)
        throw error
      }
    } catch (error) {
      console.warn('iTunes ISRC lookup failed:', error)
    }
  }
  
  // 3. Try iTunes search by artist + title
  try {
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
        if (data.resultCount > 0 && data.results[0]?.previewUrl) {
          return { url: data.results[0].previewUrl, source: 'itunes_search' }
        }
      }
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  } catch (error) {
    console.warn('iTunes search failed:', error)
  }
  
  // 4. Try Deezer search
  try {
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
        if (data.data && data.data.length > 0 && data.data[0]?.preview) {
          return { url: data.data[0].preview, source: 'deezer' }
        }
      }
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  } catch (error) {
    console.warn('Deezer search failed:', error)
  }
  
  // No preview URL found
  return { url: null, source: 'computed_failed' }
}

/**
 * Download audio preview and convert to WAV for analysis
 */
async function downloadAndConvertAudio(
  previewUrl: string,
  outputPath: string
): Promise<void> {
  const ffmpegPath = require('ffmpeg-static')
  if (!ffmpegPath) {
    throw new Error('ffmpeg-static not found')
  }
  
  // Download the audio file
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout
  
  try {
    const response = await fetch(previewUrl, {
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.statusText}`)
    }
    
    const buffer = await response.arrayBuffer()
    const tempInputPath = join(tmpdir(), `bpm-input-${Date.now()}.tmp`)
    
    try {
      // Write input file
      writeFileSync(tempInputPath, Buffer.from(buffer))
      
      // Convert to mono WAV at 44.1kHz using ffmpeg
      const ffmpegCommand = `"${ffmpegPath}" -i "${tempInputPath}" -acodec pcm_s16le -ac 1 -ar 44100 -y "${outputPath}"`
      await execAsync(ffmpegCommand)
      
      // Clean up input file
      try {
        unlinkSync(tempInputPath)
      } catch (e) {
        // Ignore cleanup errors
      }
    } catch (error) {
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
      // 1. Extract identifiers from Spotify
      const identifiers = await extractSpotifyIdentifiers(spotifyTrackId)
      
      // 2. Check cache
      const cached = await checkCache(spotifyTrackId, identifiers.isrc)
      if (cached && cached.bpm !== null) {
        return {
          bpm: cached.bpm,
          source: cached.source,
          isrc: cached.isrc || undefined,
          bpmRaw: cached.bpm_raw || undefined,
        }
      }
      
      // 3. Resolve preview URL
      const previewResult = await resolvePreviewUrl({
        isrc: identifiers.isrc,
        title: identifiers.title,
        artists: identifiers.artists,
        spotifyPreviewUrl: identifiers.spotifyPreviewUrl,
      })
      
      if (!previewResult.url) {
        // No preview available - cache failure
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
      const outputPath = join(tmpdir(), `bpm-output-${Date.now()}.wav`)
      try {
        await downloadAndConvertAudio(previewResult.url, outputPath)
        
        // 5. Compute BPM
        const { bpm, bpmRaw } = await computeBpm(outputPath)
        
        // 6. Store in cache
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

