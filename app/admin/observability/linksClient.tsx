"use client"

import { useEffect, useState } from 'react'

type Settings = {
  vercel_dashboard_url: string
  gcp_logs_url: string
  gcp_metrics_url: string
  sentry_dashboard_url: string
  sentryEnabled: boolean
}

type Props = {
  defaults: Settings
}

export default function ObservabilityLinksClient({ defaults }: Props) {
  const [links, setLinks] = useState<Settings>(defaults)

  useEffect(() => {
    let isMounted = true
    const load = async () => {
      try {
        const res = await fetch('/api/admin/observability-settings')
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        if (!isMounted || !data?.settings) return
        setLinks((prev) => ({
          ...prev,
          vercel_dashboard_url: data.settings.vercel_dashboard_url || prev.vercel_dashboard_url,
          gcp_logs_url: data.settings.gcp_logs_url || prev.gcp_logs_url,
          gcp_metrics_url: data.settings.gcp_metrics_url || prev.gcp_metrics_url,
          sentry_dashboard_url: data.settings.sentry_dashboard_url || prev.sentry_dashboard_url,
        }))
      } catch {
        // Keep defaults on load failure.
      }
    }
    load()
    return () => {
      isMounted = false
    }
  }, [])

  return (
    <>
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <h2 className="text-lg font-semibold text-gray-900">Vercel</h2>
        <p className="mt-2 text-sm text-gray-500">
          Monitor deployment logs, edge requests, and performance insights for the web app.
        </p>
        <a
          href={links.vercel_dashboard_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center text-sm font-semibold text-emerald-600 hover:text-emerald-700"
        >
          Open Vercel dashboard {'>'}
        </a>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <h2 className="text-lg font-semibold text-gray-900">GCP Backend Services</h2>
        <p className="mt-2 text-sm text-gray-500">
          Review Cloud Logging and Cloud Monitoring for backend services running on GCP.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={links.gcp_logs_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm font-semibold text-emerald-600 hover:text-emerald-700"
          >
            Open Cloud Logging {'>'}
          </a>
          <a
            href={links.gcp_metrics_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm font-semibold text-emerald-600 hover:text-emerald-700"
          >
            Open Cloud Monitoring {'>'}
          </a>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <h2 className="text-lg font-semibold text-gray-900">Sentry</h2>
        <p className="mt-2 text-sm text-gray-500">
          Error tracking {links.sentryEnabled ? 'is enabled for this environment.' : 'is not configured yet.'}
        </p>
        <a
          href={links.sentry_dashboard_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center text-sm font-semibold text-emerald-600 hover:text-emerald-700"
        >
          Open Sentry dashboard {'>'}
        </a>
      </div>
    </>
  )
}
