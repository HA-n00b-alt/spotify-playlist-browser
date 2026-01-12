import { NextResponse } from 'next/server'
import { isSuperAdminUser } from '@/lib/analytics'
import { query } from '@/lib/db'
import { logInfo, withApiLogging } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export const GET = withApiLogging(async () => {
  const isSuperAdmin = await isSuperAdminUser()
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await query<{
    spotify_user_id: string
    active: boolean
    created_at: string
    is_super_admin: boolean
    display_name: string | null
    email: string | null
  }>(
    'SELECT spotify_user_id, active, created_at, is_super_admin, display_name, email FROM admin_users ORDER BY spotify_user_id ASC'
  )
  return NextResponse.json({ admins: rows })
})

export const POST = withApiLogging(async (request: Request) => {
  const isSuperAdmin = await isSuperAdminUser()
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const rawId = typeof body?.spotifyUserId === 'string' ? body.spotifyUserId.trim() : ''
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : ''
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  if (!rawId) {
    return NextResponse.json({ error: 'Missing spotifyUserId' }, { status: 400 })
  }

  await query(
    `INSERT INTO admin_users (spotify_user_id, active, display_name, email)
     VALUES ($1, TRUE, $2, $3)
     ON CONFLICT (spotify_user_id)
     DO UPDATE SET
       active = TRUE,
       display_name = COALESCE(EXCLUDED.display_name, admin_users.display_name),
       email = COALESCE(EXCLUDED.email, admin_users.email)`,
    [rawId, displayName || null, email || null]
  )

  logInfo('Admin user added', { component: 'admin.users', spotifyUserId: rawId })
  return NextResponse.json({ ok: true })
})

export const PATCH = withApiLogging(async (request: Request) => {
  const isSuperAdmin = await isSuperAdminUser()
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const rawId = typeof body?.spotifyUserId === 'string' ? body.spotifyUserId.trim() : ''
  const action = typeof body?.action === 'string' ? body.action : ''
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : ''
  const email = typeof body?.email === 'string' ? body.email.trim() : ''

  if (!rawId || !action) {
    return NextResponse.json({ error: 'Missing spotifyUserId or action' }, { status: 400 })
  }

  if (action === 'deactivate') {
    const rows = await query<{ is_super_admin: boolean }>(
      'SELECT is_super_admin FROM admin_users WHERE spotify_user_id = $1',
      [rawId]
    )
    if (rows[0]?.is_super_admin) {
      return NextResponse.json({ error: 'Cannot deactivate super admin' }, { status: 400 })
    }
    await query('UPDATE admin_users SET active = FALSE WHERE spotify_user_id = $1', [rawId])
    logInfo('Admin user deactivated', { component: 'admin.users', spotifyUserId: rawId })
    return NextResponse.json({ ok: true })
  }

  if (action === 'activate') {
    await query('UPDATE admin_users SET active = TRUE WHERE spotify_user_id = $1', [rawId])
    logInfo('Admin user activated', { component: 'admin.users', spotifyUserId: rawId })
    return NextResponse.json({ ok: true })
  }

  if (action === 'update') {
    if (!displayName && !email) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }
    await query(
      `UPDATE admin_users
       SET display_name = COALESCE($2, display_name),
           email = COALESCE($3, email)
       WHERE spotify_user_id = $1`,
      [rawId, displayName || null, email || null]
    )
    logInfo('Admin user updated', { component: 'admin.users', spotifyUserId: rawId })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
})

export const DELETE = withApiLogging(async (request: Request) => {
  const isSuperAdmin = await isSuperAdminUser()
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const rawId = typeof body?.spotifyUserId === 'string' ? body.spotifyUserId.trim() : ''
  if (!rawId) {
    return NextResponse.json({ error: 'Missing spotifyUserId' }, { status: 400 })
  }

  const rows = await query<{ is_super_admin: boolean }>(
    'SELECT is_super_admin FROM admin_users WHERE spotify_user_id = $1',
    [rawId]
  )
  if (rows[0]?.is_super_admin) {
    return NextResponse.json({ error: 'Cannot delete super admin' }, { status: 400 })
  }

  await query('DELETE FROM admin_users WHERE spotify_user_id = $1', [rawId])
  logInfo('Admin user deleted', { component: 'admin.users', spotifyUserId: rawId })
  return NextResponse.json({ ok: true })
})
