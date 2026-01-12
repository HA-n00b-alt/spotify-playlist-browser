import { NextResponse } from 'next/server'
import { getIdentityToken } from '@/lib/bpm'
import { logError, logInfo, withApiLogging } from '@/lib/logger'

export const GET = withApiLogging(async () => {
  const serviceUrl =
    process.env.BPM_SERVICE_URL || 'https://bpm-service-340051416180.europe-west3.run.app'
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const idToken = await getIdentityToken(serviceUrl)
    const start = Date.now()
    const response = await fetch(`${serviceUrl}/health`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    })
    const durationMs = Date.now() - start
    logInfo('BPM health check completed', {
      component: 'api.bpm.health',
      status: response.status,
      durationMs,
    })

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, status: response.status, error: `BPM service returned ${response.status} ${response.statusText}` },
        { status: response.status }
      )
    }

    const text = await response.text().catch(() => '')
    const ok = text.trim().length === 0 || text.toLowerCase().includes('ok')

    return NextResponse.json({ ok }, { status: ok ? 200 : 502 })
  } catch (error) {
    const isTimeout =
      error instanceof DOMException && error.name === 'AbortError'
    const message = error instanceof Error ? error.message : 'Unknown error'
    logError(error, { component: 'api.bpm.health', timeout: isTimeout })
    return NextResponse.json(
      { ok: false, error: isTimeout ? 'BPM service request timed out' : message },
      { status: isTimeout ? 504 : 502 }
    )
  } finally {
    clearTimeout(timeoutId)
  }
})
