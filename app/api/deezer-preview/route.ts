import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const apiUrl = searchParams.get('url')

  console.log('[Deezer Preview API] Request received, API URL:', apiUrl)

  if (!apiUrl) {
    console.error('[Deezer Preview API] Missing URL parameter')
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
    console.log('[Deezer Preview API] Fetching from Deezer API:', apiUrl)
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'python-requests/2.31.0', // Match Python requests default
        'Accept': '*/*',
      },
    })

    console.log('[Deezer Preview API] Response status:', response.status, response.ok)

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error')
      console.error('[Deezer Preview API] Fetch failed:', {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText.substring(0, 500),
      })
      return NextResponse.json(
        { error: `Failed to fetch from Deezer API: ${response.status} ${response.statusText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log('[Deezer Preview API] Response data:', data)

    // Parse the response to find preview URL
    let previewUrl: string | null = null

    // Check search results (data.data array)
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const track = data.data[0]
      if (track.preview) {
        previewUrl = track.preview
        console.log('[Deezer Preview API] Found preview URL from search:', previewUrl)
      }
    }

    // Also check for album tracklist
    if (!previewUrl && data.tracks && data.tracks.data && Array.isArray(data.tracks.data) && data.tracks.data.length > 0) {
      const tracksWithPreview = data.tracks.data.filter((t: any) => t.preview)
      if (tracksWithPreview.length > 0 && tracksWithPreview[0].preview) {
        previewUrl = tracksWithPreview[0].preview
        console.log('[Deezer Preview API] Found preview URL from album tracklist:', previewUrl)
      }
    }

    if (!previewUrl) {
      console.log('[Deezer Preview API] No preview URL found in response')
      return NextResponse.json(
        { error: 'No preview URL found in Deezer API response' },
        { status: 404 }
      )
    }

    console.log('[Deezer Preview API] Returning preview URL:', previewUrl)
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
    console.error('[Deezer Preview API] Error:', error)
    console.error('[Deezer Preview API] Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      apiUrl,
    })
    return NextResponse.json(
      { error: `Failed to fetch Deezer API: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}






