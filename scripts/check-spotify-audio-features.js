#!/usr/bin/env node
const { loadEnvLocal } = require('./lib/env')

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1'
const DEFAULT_PROBE_TRACK_ID = '11dFghVXANMlKmJXsNCbNl'
const PROBE_TIMEOUT_MS = 8_000
const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function clientIdHint(clientId) {
  if (!clientId || clientId.length < 6) return null
  return `…${clientId.slice(-6)}`
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function getSpotifyClientCredentialsToken(clientId, clientSecret) {
  const response = await fetchWithTimeout('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  })
  if (!response.ok) return null
  const data = await response.json()
  return typeof data.access_token === 'string' ? data.access_token : null
}

async function probeEndpoint(token, path) {
  const response = await fetchWithTimeout(`${SPOTIFY_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await response.json().catch(() => undefined)
  if (response.ok) {
    return { probe: { status: response.status, accessible: true }, body }
  }
  const message =
    body &&
    typeof body === 'object' &&
    body.error &&
    typeof body.error.message === 'string'
      ? body.error.message
      : undefined
  return {
    probe: {
      status: response.status,
      accessible: false,
      error: message ?? `HTTP ${response.status}`,
    },
    body,
  }
}

function formatKeyScale(key, mode) {
  if (key == null || key < 0 || key > 11) return null
  const scale = mode === 1 ? 'major' : mode === 0 ? 'minor' : 'unknown'
  return { key: KEY_NAMES[key], scale }
}

async function main() {
  const env = loadEnvLocal()
  const clientId = env.SPOTIFY_CLIENT_ID
  const clientSecret = env.SPOTIFY_CLIENT_SECRET
  const trackId = process.argv[2]?.trim() || DEFAULT_PROBE_TRACK_ID

  const token = await getSpotifyClientCredentialsToken(clientId, clientSecret)
  if (!token) {
    console.error('Failed to obtain Spotify client credentials token.')
    process.exit(1)
  }

  const [tracksResult, audioFeaturesResult] = await Promise.all([
    probeEndpoint(token, `/tracks/${encodeURIComponent(trackId)}`),
    probeEndpoint(token, `/audio-features/${encodeURIComponent(trackId)}`),
  ])

  let verdict = 'error'
  let note
  let sample = null

  if (audioFeaturesResult.probe.accessible) {
    verdict = 'accessible'
    note =
      'This Client ID can access the deprecated Audio Features endpoint (Extended Quota or grandfathered access).'
    const payload = audioFeaturesResult.body
    const keyScale = formatKeyScale(payload?.key, payload?.mode)
    if (payload?.tempo != null) {
      sample = {
        tempo: payload.tempo,
        key: keyScale?.key ?? 'unknown',
        scale: keyScale?.scale ?? 'unknown',
        danceability: payload.danceability,
        energy: payload.energy,
      }
    }
  } else if (audioFeaturesResult.probe.status === 403 && tracksResult.probe.accessible) {
    verdict = 'blocked'
    note =
      'Audio Features returns 403 while Tracks works. This Client ID is restricted from the deprecated endpoint (typical for Development Mode apps since Nov 2024).'
  } else {
    note = audioFeaturesResult.probe.error ?? 'Audio Features probe failed.'
  }

  let summary
  if (verdict === 'accessible' && sample) {
    summary = `Audio Features accessible — sample: ${Math.round(sample.tempo)} BPM, ${sample.key} ${sample.scale}.`
  } else if (verdict === 'blocked') {
    summary = 'Audio Features blocked (403) for this Client ID; use the app BPM pipeline instead.'
  } else {
    summary = note ?? 'Audio Features probe failed.'
  }

  const result = {
    checkedAt: new Date().toISOString(),
    clientIdHint: clientIdHint(clientId),
    tokenSource: 'client_credentials',
    trackId,
    tracks: tracksResult.probe,
    audioFeatures: {
      ...audioFeaturesResult.probe,
      verdict,
      note,
      sample,
    },
    summary,
  }

  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
