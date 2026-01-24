import { redirect } from 'next/navigation'
import { isSuperAdminUser } from '@/lib/analytics'
import PageHeader from '../../components/PageHeader'
import AdminClient from '../AdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const isSuperAdmin = await isSuperAdminUser()
  if (!isSuperAdmin) {
    redirect('/admin')
  }

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-transparent">
      <div className="max-w-7xl mx-auto flex-1 w-full">
        <PageHeader
          subtitle=""
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Admin Users' },
          ]}
        />
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-slate-400">
                Spotify Developer Portal
              </div>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-200">
                Add allowlisted users or update app access directly in the Spotify dashboard.
              </p>
            </div>
            <a
              href="https://developer.spotify.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-300"
            >
              Open Dashboard
            </a>
          </div>
        </div>
        <AdminClient />
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
