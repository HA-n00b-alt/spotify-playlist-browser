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
    title: 'Song data administration',
    description: 'Resolve ISRC mismatches, manage previews, and administer BPM/key data.',
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
    <div className="min-h-screen flex flex-col bg-slate-50">
      <div className="max-w-7xl mx-auto flex-1 w-full p-4 sm:p-8">
        <PageHeader
          subtitle=""
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Admin' },
          ]}
        />
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Admin tools</h1>
              <p className="mt-1 text-sm text-slate-500">Pick a module to jump into diagnostics, reviews, or access control.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {availableTools.map((tool) => (
              <Link
                key={tool.title}
                href={tool.href}
                className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_18px_38px_rgba(15,23,42,0.12)]"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/60 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
                <div className="relative flex items-start gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-base font-semibold text-white shadow-md">
                    {tool.title.slice(0, 1)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{tool.title}</div>
                    <p className="mt-2 text-sm text-slate-500">{tool.description}</p>
                    <div className="mt-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                      Open
                      <span className="rounded-full border border-emerald-200/70 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
                        {tool.roles.includes('superadmin') ? 'Super Admin' : 'Admin'}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
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
