import { redirect } from 'next/navigation'
import { isAdminUser } from '@/lib/analytics'
import PageHeader from '../../components/PageHeader'
import ObservabilitySettingsClient from './settingsClient'
import ObservabilityLinksClient from './linksClient'

export const dynamic = 'force-dynamic'

export default async function ObservabilityPage() {
  const isAdmin = await isAdminUser()
  if (!isAdmin) {
    redirect('/playlists')
  }

  const vercelUrl = process.env.VERCEL_DASHBOARD_URL || 'https://vercel.com/dashboard'
  const gcpLogsUrl = process.env.GCP_LOGS_URL || 'https://console.cloud.google.com/logs'
  const gcpMetricsUrl = process.env.GCP_METRICS_URL || 'https://console.cloud.google.com/monitoring'
  const sentryUrl = process.env.SENTRY_DASHBOARD_URL || 'https://sentry.io'
  const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN)

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-transparent">
      <div className="max-w-5xl mx-auto flex-1 w-full space-y-6">
        <PageHeader
          subtitle="Vercel + GCP observability"
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Observability' },
          ]}
        />
        <ObservabilityLinksClient
          defaults={{
            vercel_dashboard_url: vercelUrl,
            gcp_logs_url: gcpLogsUrl,
            gcp_metrics_url: gcpMetricsUrl,
            sentry_dashboard_url: sentryUrl,
            sentryEnabled,
          }}
        />

        <ObservabilitySettingsClient
          defaults={{
            vercel_dashboard_url: vercelUrl,
            gcp_logs_url: gcpLogsUrl,
            gcp_metrics_url: gcpMetricsUrl,
            sentry_dashboard_url: sentryUrl,
          }}
        />

      </div>
      <footer className="mt-auto py-6 sm:py-8 text-center text-xs sm:text-sm text-gray-500 border-t border-gray-200">
        Created by{' '}
        <a href="mailto:delman@delman.it" className="text-green-600 hover:text-green-700 hover:underline">
          delman@delman.it
        </a>
        . Powered by{' '}
        <a href="https://spotify.com" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
          Spotify
        </a>
        ,{' '}
        <a href="https://muso.ai" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
          Muso.ai
        </a>{' '}
        and{' '}
        <a href="https://musicbrainz.org" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
          MusicBrainz
        </a>
        .
      </footer>
    </div>
  )
}
