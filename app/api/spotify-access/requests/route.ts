import { NextResponse } from 'next/server'
import { getCurrentUserId, getCurrentUserProfile } from '@/lib/analytics'
import { query } from '@/lib/db'
import { logInfo, withApiLogging } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export const POST = withApiLogging(async (request: Request) => {
  const profile = await getCurrentUserProfile()
  const userId = profile?.id || (await getCurrentUserId())
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : ''
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const resolvedName = displayName || profile?.display_name || ''
  const resolvedEmail = email || profile?.email || ''

  if (!resolvedEmail) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const pendingRows = await query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM spotify_access_requests WHERE spotify_user_id = $1 AND status = 'pending') AS exists",
    [userId]
  )

  if (pendingRows[0]?.exists) {
    await query(
      `UPDATE spotify_access_requests
       SET display_name = $2, email = $3
       WHERE spotify_user_id = $1 AND status = 'pending'`,
      [userId, resolvedName || null, resolvedEmail]
    )
    return NextResponse.json({ status: 'pending' })
  }

  await query(
    'INSERT INTO spotify_access_requests (spotify_user_id, display_name, email) VALUES ($1, $2, $3)',
    [userId, resolvedName || null, resolvedEmail]
  )

  logInfo('Spotify API access requested', {
    component: 'spotify.access-requests',
    spotifyUserId: userId,
  })
  return NextResponse.json({ status: 'requested' })
})
