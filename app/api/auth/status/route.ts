import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('access_token')?.value
  const refreshToken = cookieStore.get('refresh_token')?.value

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ authenticated: false })
  }

  // Try to get user info with current access token
  let tokenToUse = accessToken
  
  // If no access token but we have refresh token, try to refresh
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
      } catch {
        // Refresh failed
      }
    }
  }

  // Try to fetch user info
  if (tokenToUse) {
    try {
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: {
          Authorization: `Bearer ${tokenToUse}`,
        },
      })

      if (response.ok) {
        const user = await response.json()
        return NextResponse.json({
          authenticated: true,
          user: {
            id: user.id,
            display_name: user.display_name,
            email: user.email,
          },
        })
      }
    } catch {
      // API call failed
    }
  }

  // If we have refresh token but couldn't get user info, still consider authenticated
  if (refreshToken) {
    return NextResponse.json({
      authenticated: true,
      needsRefresh: true,
    })
  }

  return NextResponse.json({ authenticated: false })
}

