import { describe, expect, it, vi } from 'vitest'
import { clearSpotifyAuthCookies, isInvalidGrant } from '@/lib/spotifyAuth'

describe('isInvalidGrant', () => {
  it('matches a 400 with error invalid_grant', () => {
    expect(isInvalidGrant(400, JSON.stringify({ error: 'invalid_grant', error_description: 'x' }))).toBe(true)
  })

  it('ignores other statuses, other errors and unparseable bodies', () => {
    expect(isInvalidGrant(401, JSON.stringify({ error: 'invalid_grant' }))).toBe(false)
    expect(isInvalidGrant(400, JSON.stringify({ error: 'invalid_client' }))).toBe(false)
    expect(isInvalidGrant(400, 'not json')).toBe(false)
    expect(isInvalidGrant(400, '')).toBe(false)
  })
})

describe('clearSpotifyAuthCookies', () => {
  it('deletes both token cookies', () => {
    const store = { delete: vi.fn() }
    expect(clearSpotifyAuthCookies(store)).toBe(true)
    expect(store.delete).toHaveBeenCalledWith('refresh_token')
    expect(store.delete).toHaveBeenCalledWith('access_token')
  })

  it('returns false instead of throwing where cookies are read-only', () => {
    const store = {
      delete: vi.fn(() => {
        throw new Error('read-only')
      }),
    }
    expect(clearSpotifyAuthCookies(store)).toBe(false)
  })
})
