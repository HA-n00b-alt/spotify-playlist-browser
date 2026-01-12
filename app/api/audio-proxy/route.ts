import { NextResponse } from 'next/server'
import { logError, logInfo, logWarning, withApiLogging } from '@/lib/logger'

export const GET = withApiLogging(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const audioUrl = searchParams.get('url')

  logInfo('Audio proxy request received', {
    component: 'api.audio-proxy',
    audioUrl: audioUrl?.substring(0, 120) || null,
  })

  if (!audioUrl) {
    logWarning('Audio proxy missing URL parameter', {
      component: 'api.audio-proxy',
    })
    return NextResponse.json(
      { error: 'URL parameter is required' },
      { status: 400 }
    )
  }

  try {
    logInfo('Audio proxy fetching audio', {
      component: 'api.audio-proxy',
      audioUrl: audioUrl.substring(0, 120),
    })
    // Fetch the audio file from the source
    // Try to match what Python requests library does (which the BPM service uses)
    // Python requests typically sends minimal headers and lets the server handle it
    const response = await fetch(audioUrl, {
      headers: {
        // Minimal headers - let the server handle the rest
        // Python requests sends: User-Agent: python-requests/X.X.X, Accept: */*
        'User-Agent': 'python-requests/2.31.0', // Match Python requests default
        'Accept': '*/*', // Python requests default
      },
      redirect: 'follow',
      // Don't send Referer/Origin - Python requests doesn't by default
    })

    logInfo('Audio proxy response received', {
      component: 'api.audio-proxy',
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
      contentRange: response.headers.get('content-range'),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error')
      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })
      logError(new Error('Audio proxy fetch failed'), {
        component: 'api.audio-proxy',
        status: response.status,
        statusText: response.statusText,
        errorText: errorText.substring(0, 500),
        responseHeaders,
        url: audioUrl,
      })
      
      // For 403 errors, the URL might have expired or require different authentication
      // Return a more descriptive error
      if (response.status === 403) {
        return NextResponse.json(
          { 
            error: 'Failed to fetch audio: 403 Forbidden. The preview URL may have expired or requires authentication.',
            details: 'Deezer preview URLs contain time-limited authentication tokens that may expire.'
          },
          { status: 403 }
        )
      }
      
      return NextResponse.json(
        { error: `Failed to fetch audio: ${response.status} ${response.statusText}` },
        { status: response.status }
      )
    }

    // Get the audio data
    logInfo('Audio proxy reading audio data', {
      component: 'api.audio-proxy',
      audioUrl: audioUrl.substring(0, 120),
    })
    const audioData = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'audio/mpeg'

    // Return the audio with proper CORS headers
    logInfo('Audio proxied successfully', {
      component: 'api.audio-proxy',
      audioUrl: audioUrl.substring(0, 100),
      contentType,
      contentLength: audioData.byteLength,
    })
    
    return new NextResponse(audioData, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    })
  } catch (error) {
    logError(error, {
      component: 'api.audio-proxy',
      audioUrl: audioUrl?.substring(0, 100),
      errorType: 'AudioProxyError',
    })
    return NextResponse.json(
      { error: `Failed to proxy audio: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
})
