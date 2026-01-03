import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const audioUrl = searchParams.get('url')

  console.log('[Audio Proxy Debug] Request received, URL:', audioUrl)

  if (!audioUrl) {
    console.error('[Audio Proxy Debug] Missing URL parameter')
    return NextResponse.json(
      { error: 'URL parameter is required' },
      { status: 400 }
    )
  }

  try {
    console.log('[Audio Proxy Debug] Fetching audio from:', audioUrl)
    // Fetch the audio file from the source
    const response = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.deezer.com/',
      },
    })

    console.log('[Audio Proxy Debug] Response status:', response.status, response.ok)
    console.log('[Audio Proxy Debug] Response headers:', {
      'content-type': response.headers.get('content-type'),
      'content-length': response.headers.get('content-length'),
      'content-range': response.headers.get('content-range'),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error')
      console.error('[Audio Proxy Debug] Fetch failed:', {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText.substring(0, 200),
      })
      return NextResponse.json(
        { error: `Failed to fetch audio: ${response.status} ${response.statusText}` },
        { status: response.status }
      )
    }

    // Get the audio data
    console.log('[Audio Proxy Debug] Reading audio data...')
    const audioData = await response.arrayBuffer()
    console.log('[Audio Proxy Debug] Audio data received, size:', audioData.byteLength, 'bytes')
    const contentType = response.headers.get('content-type') || 'audio/mpeg'
    console.log('[Audio Proxy Debug] Content type:', contentType)

    // Return the audio with proper CORS headers
    console.log('[Audio Proxy Debug] Returning audio data to client')
    return new NextResponse(audioData, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    })
  } catch (error) {
    console.error('[Audio Proxy Debug] Error proxying audio:', error)
    console.error('[Audio Proxy Debug] Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      audioUrl,
    })
    return NextResponse.json(
      { error: `Failed to proxy audio: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}

