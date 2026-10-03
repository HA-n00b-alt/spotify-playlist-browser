import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestCookies } from 'next/dist/compiled/@edge-runtime/cookies'
import { RequestCookiesAdapter } from 'next/dist/server/web/spec-extension/adapters/request-cookies'

// The cookie store a Server Component sees in Next 14: Next's own sealed adapter, whose set/delete
// throw "Cookies can only be modified in a Server Action or Route Handler".
let cookieStore: ReturnType<typeof RequestCookiesAdapter.seal>

vi.mock('next/headers', () => ({ cookies: async () => cookieStore }))
vi.mock('@/lib/db', () => ({ query: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarning: vi.fn(), logInfo: vi.fn() }))
vi.mock('@/lib/externalApiUsage', () => ({ incrementExternalApiUsage: vi.fn() }))

import { makeSpotifyRequest } from '@/lib/spotify'
import { logError } from '@/lib/logger'

const TOKEN_URL = 'https://accounts.spotify.com/api/token'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderCookies(cookieHeader: string) {
  return RequestCookiesAdapter.seal(new RequestCookies(new Headers({ cookie: cookieHeader })))
}

describe('token refresh while a page renders (read-only cookies)', () => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

  beforeEach(() => {
    vi.mocked(logError).mockClear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('SPOTIFY_CLIENT_ID', 'client-id')
    vi.stubEnv('SPOTIFY_CLIENT_SECRET', 'client-secret')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('uses the refreshed token for this render when the access token cookie has expired', async () => {
    cookieStore = renderCookies('refresh_token=refresh-1')
    fetchMock
      .mockResolvedValueOnce(json({ access_token: 'fresh', expires_in: 3600 }))
      .mockResolvedValueOnce(json({ id: 'me' }))

    await expect(makeSpotifyRequest('/me')).resolves.toEqual({ id: 'me' })

    expect(fetchMock.mock.calls[0][0]).toBe(TOKEN_URL)
    expect((fetchMock.mock.calls[1][1]?.headers as Record<string, string>).Authorization).toBe('Bearer fresh')
    expect(logError).not.toHaveBeenCalled()
  })

  it('uses the refreshed token for this render after a 401', async () => {
    cookieStore = renderCookies('access_token=old-access; refresh_token=refresh-1')
    fetchMock
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ access_token: 'fresh', expires_in: 3600 }))
      .mockResolvedValueOnce(json({ id: 'me' }))

    await expect(makeSpotifyRequest('/me')).resolves.toEqual({ id: 'me' })

    expect((fetchMock.mock.calls[2][1]?.headers as Record<string, string>).Authorization).toBe('Bearer fresh')
  })
})
