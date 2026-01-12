import { NextResponse } from 'next/server'
import { isAdminUser } from '@/lib/analytics'
import { getMusoUsageSnapshot } from '@/lib/muso'
import { withApiLogging } from '@/lib/logger'

export const GET = withApiLogging(async () => {
  const isAdmin = await isAdminUser()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const snapshot = await getMusoUsageSnapshot()
  return NextResponse.json(snapshot)
})
