import { NextResponse } from 'next/server'
import { isAdminUser, isSuperAdminUser } from '@/lib/analytics'
import { query } from '@/lib/db'
import { withApiLogging } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export const GET = withApiLogging(async () => {
  const [isAdmin, isSuperAdmin] = await Promise.all([isAdminUser(), isSuperAdminUser()])
  if (!isAdmin && !isSuperAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const adminCountRows = await query<{ count: string }>(
    "SELECT COUNT(*) as count FROM admin_access_requests WHERE status = 'pending'"
  )
  const spotifyCountRows = await query<{ count: string }>(
    "SELECT COUNT(*) as count FROM spotify_access_requests WHERE status = 'pending'"
  )

  return NextResponse.json({
    pendingAdminRequests: Number(adminCountRows[0]?.count ?? 0),
    pendingSpotifyAccessRequests: Number(spotifyCountRows[0]?.count ?? 0),
  })
})
