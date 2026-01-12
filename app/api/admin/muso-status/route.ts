import { NextResponse } from 'next/server'
import { isAdminUser } from '@/lib/analytics'
import { getMusoUsageSnapshot } from '@/lib/muso'

export async function GET() {
  const isAdmin = await isAdminUser()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const snapshot = await getMusoUsageSnapshot()
  return NextResponse.json(snapshot)
}
