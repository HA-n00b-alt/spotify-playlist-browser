import { NextResponse } from 'next/server'
import { isAdminUser, isSuperAdminUser } from '@/lib/analytics'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const isAdmin = await isAdminUser()
    const isSuperAdmin = await isSuperAdminUser()
    return NextResponse.json({ isAdmin, isSuperAdmin })
  } catch (error) {
    console.error('[Auth] Error checking admin status:', error)
    return NextResponse.json({ isAdmin: false, isSuperAdmin: false })
  }
}


