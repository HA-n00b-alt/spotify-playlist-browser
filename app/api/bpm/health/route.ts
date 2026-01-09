import { NextResponse } from 'next/server'

export async function GET() {
  const serviceUrl =
    process.env.BPM_SERVICE_URL || 'https://bpm-service-340051416180.europe-west3.run.app'
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const response = await fetch(`${serviceUrl}/health`, {
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, status: response.status },
        { status: response.status }
      )
    }

    const text = await response.text().catch(() => '')
    const ok = text.trim().length === 0 || text.toLowerCase().includes('ok')

    return NextResponse.json({ ok }, { status: ok ? 200 : 502 })
  } catch (error) {
    const isTimeout =
      error instanceof DOMException && error.name === 'AbortError'
    return NextResponse.json(
      { ok: false, error: isTimeout ? 'timeout' : 'error' },
      { status: isTimeout ? 504 : 502 }
    )
  } finally {
    clearTimeout(timeoutId)
  }
}
