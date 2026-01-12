"use client"

import { useEffect, useState } from 'react'

type Settings = {
  vercel_dashboard_url: string
  gcp_logs_url: string
  gcp_metrics_url: string
  sentry_dashboard_url: string
}

type Props = {
  defaults: Settings
}

export default function ObservabilitySettingsClient({ defaults }: Props) {
  const [settings, setSettings] = useState<Settings>(defaults)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const load = async () => {
      try {
        const res = await fetch('/api/admin/observability-settings')
        if (!res.ok) {
          return
        }
        const data = await res.json().catch(() => ({}))
        if (!isMounted || !data?.settings) return
        setSettings({
          vercel_dashboard_url: data.settings.vercel_dashboard_url || defaults.vercel_dashboard_url,
          gcp_logs_url: data.settings.gcp_logs_url || defaults.gcp_logs_url,
          gcp_metrics_url: data.settings.gcp_metrics_url || defaults.gcp_metrics_url,
          sentry_dashboard_url: data.settings.sentry_dashboard_url || defaults.sentry_dashboard_url,
        })
      } catch {
        // Ignore loading errors, defaults remain.
      }
    }
    load()
    return () => {
      isMounted = false
    }
  }, [defaults])

  const handleChange = (key: keyof Settings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/observability-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error || 'Failed to save settings')
      }
      setMessage('Saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Monitoring URLs</h2>
          <p className="mt-2 text-sm text-gray-500">
            Update dashboard links without redeploying. Defaults come from env vars.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm text-gray-600">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Vercel Dashboard</span>
          <input
            value={settings.vercel_dashboard_url}
            onChange={(event) => handleChange('vercel_dashboard_url', event.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
          />
        </label>
        <label className="space-y-1 text-sm text-gray-600">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">GCP Logs</span>
          <input
            value={settings.gcp_logs_url}
            onChange={(event) => handleChange('gcp_logs_url', event.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
          />
        </label>
        <label className="space-y-1 text-sm text-gray-600">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">GCP Monitoring</span>
          <input
            value={settings.gcp_metrics_url}
            onChange={(event) => handleChange('gcp_metrics_url', event.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
          />
        </label>
        <label className="space-y-1 text-sm text-gray-600">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Sentry</span>
          <input
            value={settings.sentry_dashboard_url}
            onChange={(event) => handleChange('sentry_dashboard_url', event.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
          />
        </label>
      </div>

      {error ? <div className="mt-4 text-sm text-rose-600">{error}</div> : null}
      {message ? <div className="mt-4 text-sm text-emerald-600">{message}</div> : null}
    </div>
  )
}
