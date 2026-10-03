const SPOTIFY_API_BASE = 'https://api.spotify.com/v1'
const DEFAULT_PROBE_TRACK_ID = '11dFghVXANMlKmJXsNCbNl'
const PROBE_TIMEOUT_MS = 8_000

const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export type SpotifyEndpointProbe = {
  status: number
  accessible: boolean
  error?: string
}

export type SpotifyAudioFeaturesSample = {
  tempo: number
  key: string
  scale: string
  danceability?: number
  energy?: number
}

export type SpotifyAudioFeaturesProbeResult = {
  checkedAt: string
  clientIdHint: string | null
  tokenSource: 'user_session' | 'client_credentials' | 'none'
  trackId: string
  tracks: SpotifyEndpointProbe
  audioFeatures: SpotifyEndpointProbe & {
    verdict: 'accessible' | 'blocked' | 'error'
    note?: string
    sample?: SpotifyAudioFeaturesSample | null
  }
  summary: string
}

type AudioFeaturesResponse = {
  tempo?: number
  key?: number
  mode?: number
  danceability?: number
  energy?: number
}

function clientIdHint(clientId: string | undefined): string | null {
  if (!clientId || clientId.length < 6) return null
  return `…${clientId.slice(-6)}`
}

function formatKeyScale(key: number | undefined, mode: number | undefined): { key: string; scale: string } | null {
  if (key == null || key < 0 || key > 11) return null
  const scale = mode === 1 ? 'major' : mode === 0 ? 'minor' : 'unknown'
  return { key: KEY_NAMES[key], scale }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function getSpotifyClientCredentialsToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  try {
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
  } catch {
    return null
  }
}

async function probeEndpoint(
  token: string,
  path: string
): Promise<{ probe: SpotifyEndpointProbe; body?: unknown }> {
  try {
    const response = await fetchWithTimeout(`${SPOTIFY_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = response.ok
      ? await response.json().catch(() => undefined)
      : await response.json().catch(() => undefined)

    if (response.ok) {
      return { probe: { status: response.status, accessible: true }, body }
    }

    const message =
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof (body as { error?: { message?: string } }).error?.message === 'string'
        ? (body as { error: { message: string } }).error.message
        : undefined

    return {
      probe: {
        status: response.status,
        accessible: false,
        error: message ?? `HTTP ${response.status}`,
      },
      body,
    }
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError'
    return {
      probe: {
        status: 0,
        accessible: false,
        error: isTimeout ? 'Request timed out' : 'Request failed',
      },
    }
  }
}

export async function probeSpotifyAudioFeatures(options?: {
  trackId?: string
  accessToken?: string | null
}): Promise<SpotifyAudioFeaturesProbeResult> {
  const trackId = options?.trackId?.trim() || DEFAULT_PROBE_TRACK_ID
  const tokenSource = options?.accessToken ? 'user_session' : 'client_credentials'
  const token = options?.accessToken ?? (await getSpotifyClientCredentialsToken())

  if (!token) {
    return {
      checkedAt: new Date().toISOString(),
      clientIdHint: clientIdHint(process.env.SPOTIFY_CLIENT_ID),
      tokenSource: 'none',
      trackId,
      tracks: { status: 0, accessible: false, error: 'No Spotify access token available' },
      audioFeatures: {
        status: 0,
        accessible: false,
        verdict: 'error',
        note: 'Missing Spotify credentials or user session token.',
        sample: null,
      },
      summary: 'Cannot probe Spotify: no access token.',
    }
  }

  const [tracksResult, audioFeaturesResult] = await Promise.all([
    probeEndpoint(token, `/tracks/${encodeURIComponent(trackId)}`),
    probeEndpoint(token, `/audio-features/${encodeURIComponent(trackId)}`),
  ])

  let verdict: 'accessible' | 'blocked' | 'error' = 'error'
  let note: string | undefined
  let sample: SpotifyAudioFeaturesSample | null = null

  if (audioFeaturesResult.probe.accessible) {
    verdict = 'accessible'
    note = 'This Client ID can access the deprecated Audio Features endpoint (Extended Quota or grandfathered access).'
    const payload = audioFeaturesResult.body as AudioFeaturesResponse | undefined
    const keyScale = formatKeyScale(payload?.key, payload?.mode)
    if (payload?.tempo != null && keyScale) {
      sample = {
        tempo: payload.tempo,
        key: keyScale.key,
        scale: keyScale.scale,
        danceability: payload.danceability,
        energy: payload.energy,
      }
    } else if (payload?.tempo != null) {
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
  } else if (audioFeaturesResult.probe.status === 429) {
    verdict = 'error'
    note = 'Spotify rate limited the Audio Features probe.'
  } else if (!tracksResult.probe.accessible) {
    verdict = 'error'
    note = 'Baseline Tracks endpoint failed; authentication or track access may be broken.'
  } else {
    verdict = 'error'
    note = audioFeaturesResult.probe.error ?? 'Audio Features probe failed for an unexpected reason.'
  }

  let summary: string
  if (verdict === 'accessible' && sample) {
    summary = `Audio Features accessible — sample: ${Math.round(sample.tempo)} BPM, ${sample.key} ${sample.scale}.`
  } else if (verdict === 'accessible') {
    summary = 'Audio Features accessible for this Client ID.'
  } else if (verdict === 'blocked') {
    summary = 'Audio Features blocked (403) for this Client ID; use the app BPM pipeline instead.'
  } else {
    summary = note ?? 'Audio Features probe failed.'
  }

  return {
    checkedAt: new Date().toISOString(),
    clientIdHint: clientIdHint(process.env.SPOTIFY_CLIENT_ID),
    tokenSource: options?.accessToken ? tokenSource : token ? 'client_credentials' : 'none',
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
}
