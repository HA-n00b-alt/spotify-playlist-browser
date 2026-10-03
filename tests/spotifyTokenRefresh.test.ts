import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cookieJar = new Map<string, string>()
const cookieStore = {
  get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined),
  set: vi.fn((name: string, value: string, _options?: { maxAge?: number }) => {
    cookieJar.set(name, value)
  }),
  delete: vi.fn((name: string) => {
    cookieJar.delete(name)
  }),
}

vi.mock('next/headers', () => ({ cookies: async () => cookieStore }))
vi.mock('@/lib/db', () => ({ query: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarning: vi.fn(), logInfo: vi.fn() }))
vi.mock('@/lib/externalApiUsage', () => ({ incrementExternalApiUsage: vi.fn() }))

import { makeSpotifyRequest } from '@/lib/spotify'
import { AuthenticationError } from '@/lib/errors'
import { logError, logWarning } from '@/lib/logger'
import { REFRESH_TOKEN_MAX_AGE_SECONDS } from '@/lib/spotifyAuth'

const TOKEN_URL = 'https://accounts.spotify.com/api/token'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('makeSpotifyRequest token refresh handling', () => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

  beforeEach(() => {
    cookieJar.clear()
    cookieStore.set.mockClear()
    cookieStore.delete.mockClear()
    vi.mocked(logError).mockClear()
    vi.mocked(logWarning).mockClear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('SPOTIFY_CLIENT_ID', 'client-id')
    vi.stubEnv('SPOTIFY_CLIENT_SECRET', 'client-secret')
    cookieJar.set('access_token', 'old-access')
    cookieJar.set('refresh_token', 'refresh-1')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('returns the response without refreshing when the access token is valid', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }))

    await expect(makeSpotifyRequest('/me')).resolves.toEqual({ ok: true })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.spotify.com/v1/me')
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer old-access')
  })

  it('refreshes once on a 401, stores the new tokens and retries with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ error: { status: 401, message: 'expired' } }, 401))
      .mockResolvedValueOnce(json({ access_token: 'new-access', expires_in: 1800, refresh_token: 'refresh-2' }))
      .mockResolvedValueOnce(json({ id: 'me' }))

    await expect(makeSpotifyRequest('/me')).resolves.toEqual({ id: 'me' })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1]
    expect(refreshUrl).toBe(TOKEN_URL)
    expect(String(refreshInit?.body)).toContain('grant_type=refresh_token')
    expect(String(refreshInit?.body)).toContain('refresh_token=refresh-1')
    expect((fetchMock.mock.calls[2][1]?.headers as Record<string, string>).Authorization).toBe('Bearer new-access')
    expect(cookieJar.get('access_token')).toBe('new-access')
    expect(cookieJar.get('refresh_token')).toBe('refresh-2')
  })

  it('keeps the existing refresh token when Spotify does not issue a new one', async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ access_token: 'new-access', expires_in: 3600 }))
      .mockResolvedValueOnce(json({ id: 'me' }))

    await makeSpotifyRequest('/me')

    expect(cookieJar.get('refresh_token')).toBe('refresh-1')
  })

  it('stores a rotated refresh token for about six months, not a year', async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ access_token: 'new-access', expires_in: 3600, refresh_token: 'refresh-2' }))
      .mockResolvedValueOnce(json({ id: 'me' }))

    await makeSpotifyRequest('/me')

    const refreshSet = cookieStore.set.mock.calls.find(([name]) => name === 'refresh_token')
    expect(refreshSet?.[2]?.maxAge).toBe(REFRESH_TOKEN_MAX_AGE_SECONDS)
    expect(REFRESH_TOKEN_MAX_AGE_SECONDS).toBeLessThanOrEqual(60 * 60 * 24 * 183)
  })

  it('discards both token cookies on invalid_grant, does not retry, and logs a warning', async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ error: 'invalid_grant', error_description: 'Refresh token expired' }, 400))

    await expect(makeSpotifyRequest('/me')).rejects.toBeInstanceOf(AuthenticationError)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(cookieJar.has('refresh_token')).toBe(false)
    expect(cookieJar.has('access_token')).toBe(false)
    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('invalid_grant'),
      expect.objectContaining({ component: 'spotify.refreshAccessToken', cookiesCleared: true })
    )
    expect(logError).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ component: 'spotify.refreshAccessToken' })
    )
  })

  it('keeps the cookies when a refresh fails for another reason', async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ error: 'server_error' }, 500))

    await expect(makeSpotifyRequest('/me')).rejects.toBeInstanceOf(AuthenticationError)

    expect(cookieStore.delete).not.toHaveBeenCalled()
    expect(cookieJar.get('refresh_token')).toBe('refresh-1')
  })

  it('still signs the user out on invalid_grant where cookies are read-only', async () => {
    cookieStore.delete.mockImplementationOnce(() => {
      throw new Error('Cookies can only be modified in a Server Action or Route Handler')
    })
    fetchMock
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ error: 'invalid_grant' }, 400))

    await expect(makeSpotifyRequest('/me')).rejects.toBeInstanceOf(AuthenticationError)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('invalid_grant'),
      expect.objectContaining({ cookiesCleared: false })
    )
  })

  it('throws an AuthenticationError when there is no access token and no refresh token', async () => {
    cookieJar.clear()

    await expect(makeSpotifyRequest('/me')).rejects.toBeInstanceOf(AuthenticationError)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes up front when the access token cookie is gone', async () => {
    cookieJar.delete('access_token')
    fetchMock
      .mockResolvedValueOnce(json({ access_token: 'fresh', expires_in: 3600 }))
      .mockResolvedValueOnce(json({ id: 'me' }))

    await expect(makeSpotifyRequest('/me')).resolves.toEqual({ id: 'me' })

    expect(fetchMock.mock.calls[0][0]).toBe(TOKEN_URL)
    expect((fetchMock.mock.calls[1][1]?.headers as Record<string, string>).Authorization).toBe('Bearer fresh')
  })

  it('gives up after repeated 401s instead of refreshing forever', async () => {
    fetchMock.mockImplementation(async (url) =>
      url === TOKEN_URL ? json({ access_token: 'new-access', expires_in: 3600 }) : json({}, 401)
    )

    await expect(makeSpotifyRequest('/me')).rejects.toBeInstanceOf(AuthenticationError)

    const apiCalls = fetchMock.mock.calls.filter(([url]) => url !== TOKEN_URL)
    expect(apiCalls).toHaveLength(4)
  })
})
