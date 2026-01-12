import { NextResponse } from 'next/server'
import { trackPageview, getCurrentUserId } from '@/lib/analytics'
import { logError, withApiLogging } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export const POST = withApiLogging(async (request: Request) => {
  try {
    const body = await request.json()
    const { path } = body

    if (!path) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 })
    }

    // Get current user ID
    const userId = await getCurrentUserId()

    // Track pageview asynchronously (fire and forget)
    trackPageview(userId, path).catch((error) => {
      logError(error, { component: 'analytics.track-pageview' })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logError(error, { component: 'analytics.track-pageview' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})



