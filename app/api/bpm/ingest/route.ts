import { NextResponse } from 'next/server'
import { storeStreamingBpmResult } from '@/lib/bpm'
import { trackApiRequest, getCurrentUserId } from '@/lib/analytics'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const userId = await getCurrentUserId()
  try {
    const body = await request.json()
    const trackId = body.trackId
    const result = body.result
    const previewMeta = body.previewMeta

    if (!trackId || typeof trackId !== 'string') {
      trackApiRequest(userId, '/api/bpm/ingest', 'POST', 400).catch(() => {})
      return NextResponse.json(
        { error: 'trackId is required' },
        { status: 400 }
      )
    }

    if (!result || typeof result !== 'object') {
      trackApiRequest(userId, '/api/bpm/ingest', 'POST', 400).catch(() => {})
      return NextResponse.json(
        { error: 'result is required' },
        { status: 400 }
      )
    }

    if (!previewMeta || typeof previewMeta !== 'object' || typeof previewMeta.source !== 'string') {
      trackApiRequest(userId, '/api/bpm/ingest', 'POST', 400).catch(() => {})
      return NextResponse.json(
        { error: 'previewMeta with source is required' },
        { status: 400 }
      )
    }

    await storeStreamingBpmResult({
      spotifyTrackId: trackId,
      previewMeta,
      result,
    })

    trackApiRequest(userId, '/api/bpm/ingest', 'POST', 200).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (error) {
    logError(error, {
      component: 'api.bpm.ingest',
      userId: userId || 'anonymous',
      status: 500,
    })
    const message = error instanceof Error ? error.message : 'Failed to ingest BPM result'
    trackApiRequest(userId, '/api/bpm/ingest', 'POST', 500).catch(() => {})
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
