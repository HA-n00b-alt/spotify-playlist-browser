import { NextResponse } from 'next/server'
import { isAdminUser, getCurrentUserId } from '@/lib/analytics'
import { query } from '@/lib/db'
import { setRuntimeLogLevel, withApiLogging } from '@/lib/logger'

type SettingRow = {
  key: string
  value: string | null
}

const ALLOWED_KEYS = ['vercel_dashboard_url', 'gcp_logs_url', 'gcp_metrics_url', 'sentry_dashboard_url', 'log_level']

export const GET = withApiLogging(async () => {
  const isAdmin = await isAdminUser()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const rows = await query<SettingRow>(
    `SELECT key, value FROM admin_settings WHERE key = ANY($1::text[])`,
    [ALLOWED_KEYS]
  )

  const values: Record<string, string | null> = {}
  for (const key of ALLOWED_KEYS) {
    values[key] = null
  }
  for (const row of rows) {
    values[row.key] = row.value
  }

  return NextResponse.json({ settings: values })
})

export const PUT = withApiLogging(async (request: Request) => {
  const isAdmin = await isAdminUser()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const userId = await getCurrentUserId()
  const entries = Object.entries(payload).filter(([key]) => ALLOWED_KEYS.includes(key))

  if (entries.length === 0) {
    return NextResponse.json({ error: 'No valid settings provided' }, { status: 400 })
  }

  for (const [key, value] of entries) {
    const trimmed = typeof value === 'string' && value.trim() ? value.trim() : null
    if (key === 'log_level' && trimmed) {
      setRuntimeLogLevel(trimmed)
    }
    await query(
      `INSERT INTO admin_settings (key, value, updated_at, updated_by)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
      [key, trimmed, userId]
    )
  }

  return NextResponse.json({ ok: true })
})
