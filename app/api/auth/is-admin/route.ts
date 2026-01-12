import { NextResponse } from 'next/server'
import { isAdminUser, isSuperAdminUser } from '@/lib/analytics'
import { logError, withApiLogging } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export const GET = withApiLogging(async () => {
  try {
    const isAdmin = await isAdminUser()
    const isSuperAdmin = await isSuperAdminUser()
    return NextResponse.json({ isAdmin, isSuperAdmin })
  } catch (error) {
    logError(error, { component: 'auth.is-admin' })
    return NextResponse.json({ isAdmin: false, isSuperAdmin: false })
  }
})

