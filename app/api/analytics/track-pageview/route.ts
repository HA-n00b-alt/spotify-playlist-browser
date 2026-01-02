import { NextResponse } from 'next/server'
import { trackPageview, getCurrentUserId } from '@/lib/analytics'

export async function POST(request: Request) {
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
      console.error('[Analytics] Error tracking pageview:', error)
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Analytics] Error in track-pageview endpoint:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

