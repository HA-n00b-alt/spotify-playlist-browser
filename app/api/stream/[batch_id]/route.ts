import { NextResponse } from 'next/server'
import { getIdentityToken } from '@/lib/bpm'
import { logError, logInfo, withApiLogging } from '@/lib/logger'

const BPM_SERVICE_URL = process.env.BPM_SERVICE_URL || 'https://bpm-service-340051416180.europe-west3.run.app'

export const dynamic = 'force-dynamic'

/**
 * Streaming proxy route handler for BPM service stream endpoint
 * Proxies the NDJSON stream from Cloud Run to the Next.js client
 */
export const GET = withApiLogging(async (
  request: Request,
  { params }: { params: { batch_id: string } }
) => {
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
    const start = Date.now()
    const streamResponse = await fetch(`${BPM_SERVICE_URL}/stream/${batchId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
    })
    const durationMs = Date.now() - start
    logInfo('BPM stream response received', {
      component: 'api.stream',
      status: streamResponse.status,
      durationMs,
      batchId,
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

    // Return the stream with headers that encourage incremental delivery.
    return new Response(streamResponse.body, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    logError(error, { component: 'api.stream', batchId })
    return NextResponse.json(
      { 
        error: 'Failed to proxy stream',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
})
