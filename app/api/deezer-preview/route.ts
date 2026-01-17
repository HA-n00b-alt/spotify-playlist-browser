import { NextResponse } from 'next/server'
import { logError, logInfo, logWarning, withApiLogging } from '@/lib/logger'

export const GET = withApiLogging(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const apiUrl = searchParams.get('url')

  logInfo('Deezer preview request received', {
    component: 'api.deezer-preview',
    apiUrl,
  })

  if (!apiUrl) {
    logWarning('Deezer preview missing URL parameter', {
      component: 'api.deezer-preview',
    })
    return NextResponse.json(
      { error: 'URL parameter is required' },
      { status: 400 }
    )
  }

  // Validate it's a Deezer API URL
  if (!apiUrl.includes('api.deezer.com')) {
    return NextResponse.json(
      { error: 'Invalid URL: must be a Deezer API URL' },
      { status: 400 }
    )
  }

  try {
    logInfo('Deezer preview fetching from Deezer API', {
      component: 'api.deezer-preview',
      apiUrl,
    })
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'python-requests/2.31.0', // Match Python requests default
        'Accept': '*/*',
      },
    })

    logInfo('Deezer preview response received', {
      component: 'api.deezer-preview',
      status: response.status,
      ok: response.ok,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error')
      logError(new Error('Deezer preview fetch failed'), {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText.substring(0, 500),
        apiUrl,
      })
      return NextResponse.json(
        { error: `Failed to fetch from Deezer API: ${response.status} ${response.statusText}` },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Parse the response to find preview URL
    let previewUrl: string | null = null

    if (data.preview) {
      previewUrl = data.preview
    }

    // Check search results (data.data array)
    if (!previewUrl && data.data && Array.isArray(data.data) && data.data.length > 0) {
      const track = data.data[0]
      if (track.preview) {
        previewUrl = track.preview
      }
    }

    // Also check for album tracklist
    if (!previewUrl && data.tracks && data.tracks.data && Array.isArray(data.tracks.data) && data.tracks.data.length > 0) {
      const tracksWithPreview = data.tracks.data.filter((t: any) => t.preview)
      if (tracksWithPreview.length > 0 && tracksWithPreview[0].preview) {
        previewUrl = tracksWithPreview[0].preview
      }
    }

    if (!previewUrl) {
      logWarning('Deezer preview URL not found', {
        component: 'api.deezer-preview',
        apiUrl,
      })
      return NextResponse.json(
        { error: 'No preview URL found in Deezer API response' },
        { status: 404 }
      )
    }

    logInfo('Deezer preview URL resolved', {
      component: 'api.deezer-preview',
      apiUrl,
    })
    return NextResponse.json(
      { previewUrl },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
        },
      }
    )
  } catch (error) {
    logError(error, {
      component: 'api.deezer-preview',
      apiUrl,
    })
    return NextResponse.json(
      { error: `Failed to fetch Deezer API: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
})











