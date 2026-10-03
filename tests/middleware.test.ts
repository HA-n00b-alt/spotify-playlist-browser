import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'
import { ACCESS_TOKEN_EXPIRY_MARGIN_SECONDS, REFRESH_TOKEN_MAX_AGE_SECONDS } from '@/lib/spotifyAuth'

const TOKEN_URL = 'https://accounts.spotify.com/api/token'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function pageRequest(cookie: string) {
  return new NextRequest('https://example.test/playlists', { headers: { cookie } })
}

// What the page render will see as its cookie header (Next forwards it via this header).
function renderCookieHeader(response: Response) {
  return response.headers.get('x-middleware-request-cookie') ?? ''
}

describe('middleware token refresh before page render', () => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('SPOTIFY_CLIENT_ID', 'client-id')
    vi.stubEnv('SPOTIFY_CLIENT_SECRET', 'client-secret')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('does nothing while the access token cookie is present', async () => {
    const response = await middleware(pageRequest('access_token=a; refresh_token=r'))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(response.cookies.getAll()).toHaveLength(0)
  })

  it('does nothing for signed-out users', async () => {
    const response = await middleware(pageRequest(''))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(response.cookies.getAll()).toHaveLength(0)
  })

  it('refreshes an expired access token and hands it to both the browser and the render', async () => {
    fetchMock.mockResolvedValueOnce(json({ access_token: 'fresh', expires_in: 3600, refresh_token: 'refresh-2' }))

    const response = await middleware(pageRequest('refresh_token=refresh-1'))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(TOKEN_URL)
    expect(String(init?.body)).toContain('refresh_token=refresh-1')
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`
    )

    const access = response.cookies.get('access_token')
    expect(access?.value).toBe('fresh')
    expect(access?.httpOnly).toBe(true)
    expect(access?.maxAge).toBe(3600 - ACCESS_TOKEN_EXPIRY_MARGIN_SECONDS)
    expect(response.cookies.get('refresh_token')?.value).toBe('refresh-2')
    expect(response.cookies.get('refresh_token')?.maxAge).toBe(REFRESH_TOKEN_MAX_AGE_SECONDS)

    expect(renderCookieHeader(response)).toContain('access_token=fresh')
    expect(renderCookieHeader(response)).toContain('refresh_token=refresh-2')
  })

  it('signs the user out when Spotify rejects the refresh token', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'invalid_grant' }, 400))

    const response = await middleware(pageRequest('refresh_token=dead'))

    expect(response.cookies.get('refresh_token')?.value).toBe('')
    expect(response.cookies.get('access_token')?.value).toBe('')
    expect(renderCookieHeader(response)).not.toContain('refresh_token')
  })

  it('leaves cookies alone on a transient failure', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'server_error' }, 503))

    const response = await middleware(pageRequest('refresh_token=refresh-1'))

    expect(response.cookies.getAll()).toHaveLength(0)
    expect(console.warn).toHaveBeenCalled()
  })
})
