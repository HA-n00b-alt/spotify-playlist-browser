import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { withApiLogging, logError } from '@/lib/logger'
import { getMusoUsageSnapshot } from '@/lib/muso'
import { MB_BASE_URL, USER_AGENT } from '@/lib/musicbrainz'

export const dynamic = 'force-dynamic'

type HealthStatus = 'ok' | 'throttled' | 'error'

type HealthEntry = {
  status: HealthStatus
  label: string
}

async function getSpotifyHealth(): Promise<HealthEntry> {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('access_token')?.value
  const refreshToken = cookieStore.get('refresh_token')?.value
  let tokenToUse = accessToken

  if (!tokenToUse && refreshToken) {
    const clientId = process.env.SPOTIFY_CLIENT_ID
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
    if (clientId && clientSecret) {
      try {
        const refreshResponse = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }),
        })
        if (refreshResponse.ok) {
          const data = await refreshResponse.json()
          tokenToUse = data.access_token
        }
      } catch (error) {
        logError(error, { component: 'health.spotify', action: 'refresh' })
      }
    }
  }

  if (!tokenToUse) {
    return { status: 'error', label: 'Not authenticated' }
  }

  try {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${tokenToUse}` },
    })
    if (response.ok) {
      return { status: 'ok', label: 'OK' }
    }
    if (response.status === 429) {
      return { status: 'throttled', label: 'Rate limited' }
    }
    if (response.status === 403) {
      return { status: 'error', label: 'Access denied' }
    }
    return { status: 'error', label: 'Unavailable' }
  } catch (error) {
    logError(error, { component: 'health.spotify', action: 'request' })
    return { status: 'error', label: 'Unavailable' }
  }
}

async function getMusoHealth(): Promise<HealthEntry> {
  const snapshot = await getMusoUsageSnapshot()
  if (!snapshot.enabled) {
    return { status: 'error', label: 'Not configured' }
  }
  if (snapshot.remaining <= 0) {
    return { status: 'error', label: 'Limit reached' }
  }
  const warningThreshold = Math.max(50, Math.round(snapshot.limit * 0.1))
  if (snapshot.remaining <= warningThreshold) {
    return { status: 'throttled', label: `Low (${snapshot.remaining} left)` }
  }
  return { status: 'ok', label: 'OK' }
}

async function getMusicBrainzHealth(): Promise<HealthEntry> {
  try {
    const response = await fetch(`${MB_BASE_URL}/artist?query=artist:radiohead&limit=1&fmt=json`, {
      headers: { 'User-Agent': USER_AGENT },
    })
    if (response.ok) {
      return { status: 'ok', label: 'OK' }
    }
    if (response.status === 429 || response.status === 503) {
      return { status: 'throttled', label: 'Rate limited' }
    }
    return { status: 'error', label: 'Unavailable' }
  } catch (error) {
    logError(error, { component: 'health.musicbrainz' })
    return { status: 'error', label: 'Unavailable' }
  }
}

export const GET = withApiLogging(async () => {
  const [spotify, muso, musicbrainz] = await Promise.all([
    getSpotifyHealth(),
    getMusoHealth(),
    getMusicBrainzHealth(),
  ])

  return NextResponse.json({ spotify, muso, musicbrainz })
})
