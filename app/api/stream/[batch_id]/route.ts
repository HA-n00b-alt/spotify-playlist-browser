import { NextResponse } from 'next/server'
import { getIdentityToken } from '@/lib/bpm'

const BPM_SERVICE_URL = process.env.BPM_SERVICE_URL || 'https://bpm-service-340051416180.europe-west3.run.app'

export const dynamic = 'force-dynamic'

/**
 * Streaming proxy route handler for BPM service stream endpoint
 * Proxies the NDJSON stream from Cloud Run to the Next.js client
 */
export async function GET(
  request: Request,
  { params }: { params: { batch_id: string } }
) {
  const batchId = params.batch_id

  if (!batchId) {
    return NextResponse.json(
      { error: 'batch_id is required' },
      { status: 400 }
    )
  }

  try {
    // Get identity token for Cloud Run authentication
    const idToken = await getIdentityToken(BPM_SERVICE_URL)

    // Call the BPM service's streaming endpoint
    const streamResponse = await fetch(`${BPM_SERVICE_URL}/stream/${batchId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
    })

    if (!streamResponse.ok) {
      const errorText = await streamResponse.text()
      return NextResponse.json(
        { error: `BPM service error: ${streamResponse.status} ${errorText}` },
        { status: streamResponse.status }
      )
    }

    // Check if response body is available
    if (!streamResponse.body) {
      return NextResponse.json(
        { error: 'No response body from BPM service' },
        { status: 500 }
      )
    }

    // Create a new ReadableStream that pipes the Cloud Run response
    const stream = new ReadableStream({
      async start(controller) {
        const reader = streamResponse.body!.getReader()
        const decoder = new TextDecoder()

        try {
          while (true) {
            const { done, value } = await reader.read()
            
            if (done) {
              controller.close()
              break
            }

            // Enqueue the chunk to the client
            controller.enqueue(value)
          }
        } catch (error) {
          controller.error(error)
        } finally {
          reader.releaseLock()
        }
      },
    })

    // Return the stream with appropriate headers
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[Stream Proxy] Error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to proxy stream',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

