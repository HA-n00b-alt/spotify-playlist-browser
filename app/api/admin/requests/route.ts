import { NextResponse } from 'next/server'
import { getCurrentUserId, getCurrentUserProfile, isSuperAdminUser } from '@/lib/analytics'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const isSuperAdmin = await isSuperAdminUser()
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await query<{
    id: number
    spotify_user_id: string
    display_name: string | null
    email: string | null
    status: string
    requested_at: string
  }>(
    `SELECT id, spotify_user_id, display_name, email, status, requested_at
     FROM admin_access_requests
     WHERE status = 'pending'
     ORDER BY requested_at DESC`
  )

  return NextResponse.json({ requests: rows })
}

export async function POST(request: Request) {
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

  const adminRows = await query<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM admin_users WHERE spotify_user_id = $1 AND active = true) AS exists',
    [userId]
  )
  if (adminRows[0]?.exists) {
    return NextResponse.json({ status: 'already_admin' })
  }

  const pendingRows = await query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM admin_access_requests WHERE spotify_user_id = $1 AND status = 'pending') AS exists",
    [userId]
  )

  if (pendingRows[0]?.exists) {
    await query(
      `UPDATE admin_access_requests
       SET display_name = $2, email = $3
       WHERE spotify_user_id = $1 AND status = 'pending'`,
      [userId, resolvedName || null, resolvedEmail]
    )
    return NextResponse.json({ status: 'pending' })
  }

  await query(
    'INSERT INTO admin_access_requests (spotify_user_id, display_name, email) VALUES ($1, $2, $3)',
    [userId, resolvedName || null, resolvedEmail]
  )

  return NextResponse.json({ status: 'requested' })
}

export async function PATCH(request: Request) {
  const isSuperAdmin = await isSuperAdminUser()
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const requestId = typeof body?.requestId === 'number' ? body.requestId : Number(body?.requestId)
  const action = body?.action === 'approve' || body?.action === 'deny' ? body.action : null

  if (!requestId || !action) {
    return NextResponse.json({ error: 'Missing requestId or action' }, { status: 400 })
  }

  const rows = await query<{
    id: number
    spotify_user_id: string
    display_name: string | null
    email: string | null
    status: string
  }>(
    'SELECT id, spotify_user_id, display_name, email, status FROM admin_access_requests WHERE id = $1',
    [requestId]
  )
  const requestRow = rows[0]
  if (!requestRow || requestRow.status !== 'pending') {
    return NextResponse.json({ error: 'Request not found or already resolved' }, { status: 404 })
  }

  const resolverId = await getCurrentUserId()

  if (action === 'approve') {
    await query(
      `INSERT INTO admin_users (spotify_user_id, active, display_name, email)
       VALUES ($1, TRUE, $2, $3)
       ON CONFLICT (spotify_user_id)
       DO UPDATE SET
         active = TRUE,
         display_name = COALESCE(EXCLUDED.display_name, admin_users.display_name),
         email = COALESCE(EXCLUDED.email, admin_users.email)`,
      [requestRow.spotify_user_id, requestRow.display_name, requestRow.email]
    )
    await query(
      `UPDATE admin_access_requests
       SET status = 'approved', resolved_at = NOW(), resolved_by = $2
       WHERE id = $1`,
      [requestId, resolverId]
    )
  } else {
    await query(
      `UPDATE admin_access_requests
       SET status = 'denied', resolved_at = NOW(), resolved_by = $2
       WHERE id = $1`,
      [requestId, resolverId]
    )
  }

  return NextResponse.json({ ok: true })
}
