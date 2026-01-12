import { redirect } from 'next/navigation'
import Link from 'next/link'
import { isAdminUser, isSuperAdminUser } from '@/lib/analytics'
import PageHeader from '../components/PageHeader'

export const dynamic = 'force-dynamic'

const tools = [
  {
    title: 'Analytics & Usage',
    description: 'View usage stats, API activity, and platform traffic.',
    href: '/stats',
    roles: ['admin', 'superadmin'],
  },
  {
    title: 'ISRC Mismatch Review',
    description: 'Review ISRC mismatches, preview audio, and confirm match or mismatch.',
    href: '/admin/isrc-mismatches',
    roles: ['admin', 'superadmin'],
  },
  {
    title: 'Observability',
    description: 'Monitor Vercel and GCP services with logging and performance links.',
    href: '/admin/observability',
    roles: ['admin', 'superadmin'],
  },
  {
    title: 'Admin Users & Requests',
    description: 'Approve admin requests and manage admin access.',
    href: '/admin/users',
    roles: ['superadmin'],
  },
]

export default async function AdminPage() {
  const [isAdmin, isSuperAdmin] = await Promise.all([isAdminUser(), isSuperAdminUser()])
  if (!isAdmin && !isSuperAdmin) {
    redirect('/playlists')
  }

  const availableTools = tools.filter((tool) => {
    if (tool.roles.includes('superadmin') && isSuperAdmin) return true
    return tool.roles.includes('admin') && isAdmin
  })

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-transparent">
      <div className="max-w-7xl mx-auto flex-1 w-full">
        <PageHeader
          subtitle="Administration tools"
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Admin' },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {availableTools.map((tool) => (
            <Link
              key={tool.title}
              href={tool.href}
              className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_6px_20px_rgba(0,0,0,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)]"
            >
              <div className="text-sm font-semibold text-gray-900">{tool.title}</div>
              <p className="mt-2 text-sm text-gray-500">{tool.description}</p>
              <div className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                Open
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-8 rounded-2xl border border-gray-100 bg-white/80 p-6 text-sm text-gray-600">
          <div className="text-sm font-semibold text-gray-900">BPM Debug & Overrides</div>
          <p className="mt-2">
            Admin-only BPM debug tools live inside playlist views. Open any playlist to inspect BPM sources,
            refresh preview URLs, and apply manual overrides.
          </p>
          <Link
            href="/playlists"
            className="mt-3 inline-flex items-center text-sm font-semibold text-emerald-600 hover:text-emerald-700"
          >
            Go to playlists {'>'}
          </Link>
        </div>
      </div>
      <footer className="mt-auto py-6 sm:py-8 text-center text-xs sm:text-sm text-gray-500 border-t border-gray-200">
        Created by{' '}
        <a href="mailto:delman@delman.it" className="text-green-600 hover:text-green-700 hover:underline">
          delman@delman.it
        </a>
        . Powered by{' '}
        <a href="https://spotify.com" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
          Spotify
        </a>{' '}and{' '}
        <a href="https://musicbrainz.org" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
          Musicbrainz
        </a>
        .
      </footer>
    </div>
  )
}
