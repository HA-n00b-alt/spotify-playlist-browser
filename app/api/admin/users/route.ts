import { NextResponse } from 'next/server'
import { isSuperAdminUser } from '@/lib/analytics'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const isSuperAdmin = await isSuperAdminUser()
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await query<{ spotify_user_id: string; active: boolean; created_at: string; is_super_admin: boolean }>(
    'SELECT spotify_user_id, active, created_at, is_super_admin FROM admin_users ORDER BY spotify_user_id ASC'
  )
  return NextResponse.json({ admins: rows })
}

export async function POST(request: Request) {
  const isSuperAdmin = await isSuperAdminUser()
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const rawId = typeof body?.spotifyUserId === 'string' ? body.spotifyUserId.trim() : ''
  if (!rawId) {
    return NextResponse.json({ error: 'Missing spotifyUserId' }, { status: 400 })
  }

  await query(
    'INSERT INTO admin_users (spotify_user_id, active) VALUES ($1, TRUE) ON CONFLICT (spotify_user_id) DO UPDATE SET active = TRUE',
    [rawId]
  )

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
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
    return NextResponse.json({ error: 'Cannot remove super admin' }, { status: 400 })
  }

  await query('UPDATE admin_users SET active = FALSE WHERE spotify_user_id = $1', [rawId])
  return NextResponse.json({ ok: true })
}
