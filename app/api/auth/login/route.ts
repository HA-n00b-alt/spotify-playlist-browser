import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { logInfo, withApiLogging } from '@/lib/logger'

export const GET = withApiLogging(async () => {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'https://searchmyplaylist.delman.it/api/auth/callback'
  
  if (!clientId) {
    return NextResponse.json(
      { error: 'Spotify Client ID not configured' },
      { status: 500 }
    )
  }

  // Generate PKCE code verifier and challenge
  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')

  // Store code verifier in a cookie (in production, use httpOnly, secure cookies)
  const response = NextResponse.redirect(
    `https://accounts.spotify.com/authorize?` +
    `client_id=${clientId}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=playlist-read-private playlist-read-collaborative&` +
    `code_challenge_method=S256&` +
    `code_challenge=${codeChallenge}`
  )

  // Store code verifier in cookie (30 minutes expiry)
  const isProduction = process.env.NODE_ENV === 'production'
  response.cookies.set('code_verifier', codeVerifier, {
    maxAge: 30 * 60,
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
  })

  logInfo('Auth login initiated', {
    component: 'auth.login',
    redirectUri,
  })

  return response
})
