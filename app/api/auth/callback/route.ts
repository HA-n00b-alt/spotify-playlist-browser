import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { logError, logInfo } from '@/lib/logger'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(error)}`, request.url)
    )
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/?error=missing_code', request.url)
    )
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'https://searchmyplaylist.delman.it/api/auth/callback'

  if (!clientId || !clientSecret) {
    const error = new Error('Spotify credentials not configured')
    logError(error, {
      component: 'auth.callback',
      env: {
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
      },
    })
    return NextResponse.json(
      { error: 'Spotify credentials not configured' },
      { status: 500 }
    )
  }

  const cookieStore = await cookies()
  const codeVerifier = cookieStore.get('code_verifier')?.value

  if (!codeVerifier) {
    const error = new Error('Missing code verifier in cookies')
    logError(error, {
      component: 'auth.callback',
      cookies: {
        hasCodeVerifier: !!codeVerifier,
      },
    })
    return NextResponse.redirect(
      new URL('/?error=missing_verifier', request.url)
    )
  }

  try {
    logInfo('Exchanging authorization code for access token', {
      component: 'auth.callback',
      hasCode: !!code,
      hasCodeVerifier: !!codeVerifier,
      redirectUri,
    })
    
    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      const error = new Error(`Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}`)
      logError(error, {
        component: 'auth.callback',
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        errorData: errorData.substring(0, 500),
        hasCode: !!code,
      })
      return NextResponse.redirect(
        new URL('/?error=token_exchange_failed', request.url)
      )
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in } = tokenData

    logInfo('Token exchange successful', {
      component: 'auth.callback',
      hasAccessToken: !!access_token,
      hasRefreshToken: !!refresh_token,
      expiresIn: expires_in,
    })

    // Store tokens in cookies
    const response = NextResponse.redirect(new URL('/playlists', request.url))
    const isProduction = process.env.NODE_ENV === 'production'
    
    response.cookies.set('access_token', access_token, {
      maxAge: expires_in || 3600,
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      path: '/',
    })

    if (refresh_token) {
      response.cookies.set('refresh_token', refresh_token, {
        maxAge: 60 * 60 * 24 * 365, // 1 year
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        path: '/',
      })
    }

    // Clear code verifier
    response.cookies.delete('code_verifier')

    return response
  } catch (error) {
    logError(error, {
      component: 'auth.callback',
      hasCode: !!code,
      hasCodeVerifier: !!codeVerifier,
      redirectUri,
    })
    return NextResponse.redirect(
      new URL('/?error=callback_error', request.url)
    )
  }
}

