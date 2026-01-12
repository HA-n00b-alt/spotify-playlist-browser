import { NextResponse } from 'next/server'
import { getIdentityToken, prepareBpmStreamingBatch } from '@/lib/bpm'
import { trackApiRequest, getCurrentUserId } from '@/lib/analytics'
import { logError, logInfo, withApiLogging } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const BPM_SERVICE_URL = process.env.BPM_SERVICE_URL || 'https://bpm-service-340051416180.europe-west3.run.app'

export const POST = withApiLogging(async (request: Request) => {
  const userId = await getCurrentUserId()
  try {
    const body = await request.json()
    const trackIds = body.trackIds
    const countryCode = typeof body.country === 'string' ? body.country : undefined
    const rawDebugLevel = typeof body.debug_level === 'string' ? body.debug_level.trim() : ''
    const debugLevel = rawDebugLevel || 'minimal'
    const rawMaxConfidence = typeof body.max_confidence === 'number' ? body.max_confidence : NaN
    const maxConfidence = Number.isFinite(rawMaxConfidence)
      ? Math.min(Math.max(rawMaxConfidence, 0), 1)
      : 0.65
    const rawFallbackOverride = typeof body.fallback_override === 'string' ? body.fallback_override : undefined
    const allowedFallbackOverrides = new Set(['never', 'always', 'bpm_only', 'key_only'])
    const fallbackOverride = rawFallbackOverride && allowedFallbackOverrides.has(rawFallbackOverride)
      ? rawFallbackOverride
      : undefined

    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      trackApiRequest(userId, '/api/bpm/stream-batch', 'POST', 400).catch(() => {})
      return NextResponse.json(
        { error: 'trackIds array is required' },
        { status: 400 }
      )
    }

    logInfo('Preparing streaming BPM batch', {
      component: 'api.bpm.stream-batch',
      userId: userId || 'anonymous',
      trackCount: trackIds.length,
    })

    const { urls, indexToTrackId, previewMeta, immediateResults } =
      await prepareBpmStreamingBatch({
        spotifyTrackIds: trackIds,
        request,
        countryCode,
      })

    if (urls.length === 0) {
      trackApiRequest(userId, '/api/bpm/stream-batch', 'POST', 200).catch(() => {})
      return NextResponse.json({
        batchId: null,
        indexToTrackId,
        previewMeta,
        immediateResults,
      })
    }

    const idToken = await getIdentityToken(BPM_SERVICE_URL)
    const requestBody: Record<string, unknown> = {
      urls,
      max_confidence: maxConfidence,
      debug_level: debugLevel,
    }
    if (fallbackOverride) {
      requestBody.fallback_override = fallbackOverride
    }

    const start = Date.now()
    const response = await fetch(`${BPM_SERVICE_URL}/analyze/batch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
    const durationMs = Date.now() - start
    logInfo('BPM batch request completed', {
      component: 'api.bpm.stream-batch',
      status: response.status,
      durationMs,
      trackCount: urls.length,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`BPM service error: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    trackApiRequest(userId, '/api/bpm/stream-batch', 'POST', 200).catch(() => {})

    return NextResponse.json({
      batchId: data.batch_id || null,
      indexToTrackId,
      previewMeta,
      immediateResults,
    })
  } catch (error) {
    logError(error, {
      component: 'api.bpm.stream-batch',
      userId: userId || 'anonymous',
      status: 500,
    })
    const message = error instanceof Error ? error.message : 'Failed to start streaming batch'
    trackApiRequest(userId, '/api/bpm/stream-batch', 'POST', 500).catch(() => {})
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
})
