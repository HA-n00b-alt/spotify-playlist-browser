import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const audioUrl = searchParams.get('url')

  if (!audioUrl) {
    return NextResponse.json(
      { error: 'URL parameter is required' },
      { status: 400 }
    )
  }

  try {
    // Fetch the audio file from the source
    const response = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.deezer.com/',
      },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch audio' },
        { status: response.status }
      )
    }

    // Get the audio data
    const audioData = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'audio/mpeg'

    // Return the audio with proper CORS headers
    return new NextResponse(audioData, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    })
  } catch (error) {
    console.error('Error proxying audio:', error)
    return NextResponse.json(
      { error: 'Failed to proxy audio' },
      { status: 500 }
    )
  }
}

