import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isAdminUser } from '@/lib/analytics'
import { withApiLogging } from '@/lib/logger'
import { probeSpotifyAudioFeatures } from '@/lib/spotifyAudioFeaturesProbe'

export const dynamic = 'force-dynamic'

const DEFAULT_TRACK_ID = '11dFghVXANMlKmJXsNCbNl'

async function getUserAccessToken(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get('access_token')?.value ?? null
}

export const GET = withApiLogging(async (request: Request) => {
  const isAdmin = await isAdminUser()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const url = new URL(request.url)
  const trackId = url.searchParams.get('trackId')?.trim() || DEFAULT_TRACK_ID
  const tokenPreference = url.searchParams.get('token')?.trim() || 'auto'

  let accessToken: string | null = null
  if (tokenPreference === 'user' || tokenPreference === 'auto') {
    accessToken = await getUserAccessToken()
  }

  const useUserToken = Boolean(accessToken) && tokenPreference !== 'client_credentials'
  const result = await probeSpotifyAudioFeatures({
    trackId,
    accessToken: useUserToken ? accessToken : null,
  })

  return NextResponse.json(result)
})
