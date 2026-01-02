import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('access_token')?.value
  const refreshToken = cookieStore.get('refresh_token')?.value

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ authenticated: false })
  }

  // Optionally verify the token is still valid by making a lightweight API call
  if (accessToken) {
    try {
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
      // Token might be expired, but we have refresh token
    }
  }

  // If we have refresh token but access token is invalid/expired, still consider authenticated
  return NextResponse.json({
    authenticated: true,
    needsRefresh: !accessToken && !!refreshToken,
  })
}

