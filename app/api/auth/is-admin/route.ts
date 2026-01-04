import { NextResponse } from 'next/server'
import { isAdminUser } from '@/lib/analytics'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const isAdmin = await isAdminUser()
    return NextResponse.json({ isAdmin })
  } catch (error) {
    console.error('[Auth] Error checking admin status:', error)
    return NextResponse.json({ isAdmin: false })
  }
}



