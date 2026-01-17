import { NextResponse } from 'next/server'
import { isAdminUser } from '@/lib/analytics'
import { query } from '@/lib/db'
import { withApiLogging } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export const GET = withApiLogging(async () => {
  const isAdmin = await isAdminUser()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const topUsers = await query<{ display_name: string; email: string; session_count: string }>(
    `SELECT u.display_name, u.email, COUNT(DISTINCT p.session_id) as session_count
     FROM analytics_users u
     JOIN analytics_pageviews p ON u.id = p.spotify_user_id
     GROUP BY u.id, u.display_name, u.email
     ORDER BY session_count DESC
     LIMIT 10`
  )

  return NextResponse.json(
    topUsers.map((u) => ({
      ...u,
      session_count: parseInt(u.session_count, 10),
    }))
  )
})
