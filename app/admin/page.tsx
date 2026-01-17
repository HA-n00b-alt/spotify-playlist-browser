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
    <div className="min-h-screen flex flex-col bg-slate-50">
      <div className="max-w-7xl mx-auto flex-1 w-full p-4 sm:p-8">
        <section className="relative mb-10 overflow-hidden rounded-3xl border border-emerald-100/70 bg-gradient-to-br from-white via-emerald-50/70 to-teal-50/60 p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-10">
          <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-emerald-200/50 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-0 h-48 w-48 rounded-full bg-teal-200/40 blur-3xl" />
          <div className="relative">
            <PageHeader
              subtitle="Administration tools"
              breadcrumbs={[
                { label: 'Home', href: '/' },
                { label: 'Admin' },
              ]}
            />
            <div className="mt-6 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              <span className="rounded-full border border-emerald-200/80 bg-white/70 px-3 py-1">
                Access: {isSuperAdmin ? 'Super Admin' : 'Admin'}
              </span>
              <span className="rounded-full border border-emerald-200/80 bg-white/70 px-3 py-1">
                {availableTools.length} tools available
              </span>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/80 bg-white/70 p-4 text-sm text-slate-600 shadow-sm backdrop-blur">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Security</div>
                <p className="mt-2 text-sm text-slate-700">Admin routes are gated by server-side role checks.</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/70 p-4 text-sm text-slate-600 shadow-sm backdrop-blur">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Operational</div>
                <p className="mt-2 text-sm text-slate-700">Use Observability to track uptime, limits, and incidents.</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/70 p-4 text-sm text-slate-600 shadow-sm backdrop-blur">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Workflow</div>
                <p className="mt-2 text-sm text-slate-700">Review access requests weekly to keep permissions clean.</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-[2fr,1fr]">
          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Admin tools</h2>
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

          <aside className="flex flex-col gap-6">
            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">BPM Debug & Overrides</div>
              <p className="mt-3 text-sm text-slate-600">
                Admin-only BPM debug tools live inside playlist views. Open any playlist to inspect BPM sources,
                refresh preview URLs, and apply manual overrides.
              </p>
              <Link
                href="/playlists"
                className="mt-4 inline-flex items-center text-sm font-semibold text-emerald-600 hover:text-emerald-700"
              >
                Go to playlists {'>'}
              </Link>
            </div>
            <div className="rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-sm text-slate-100 shadow-[0_12px_30px_rgba(15,23,42,0.18)]">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Tips</div>
              <ul className="mt-3 space-y-2 text-sm text-slate-200">
                <li>Audit admin requests during traffic spikes.</li>
                <li>Keep an eye on rate limits before large imports.</li>
                <li>Use ISRC review to resolve missing previews quickly.</li>
              </ul>
            </div>
          </aside>
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
