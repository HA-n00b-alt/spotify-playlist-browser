import Link from 'next/link'
import { cookies } from 'next/headers'
import PageHeader from './components/PageHeader'

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; skipRedirect?: string }>
}) {
  const params = await searchParams
  const error = params?.error
  const cookieStore = await cookies()
  const isAuthenticated = Boolean(
    cookieStore.get('access_token')?.value || cookieStore.get('refresh_token')?.value
  )
  const spotifyToolsHref = isAuthenticated ? '/playlists' : '/api/auth/login'

  return (
    <main className="flex min-h-screen flex-col p-4 sm:p-8 bg-transparent">
      <div className="max-w-7xl mx-auto flex-1 w-full">
        <PageHeader subtitle="" breadcrumbs={[{ label: 'Home', href: '/' }]} />

        <div className="rounded-2xl bg-white p-6 border border-gray-200 sm:p-10">
          <div className="space-y-8">
            <div className="space-y-3">
              <h2 className="text-2xl sm:text-3xl font-semibold text-[#171923]">Choose your tool</h2>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error === 'access_denied'
                  ? 'Spotify authorization was denied. Please try again.'
                  : error === 'token_exchange_failed'
                  ? 'Spotify login could not be completed. Please try again.'
                  : 'An error occurred during Spotify login. Please try again.'}
              </div>
            )}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Link
                href={spotifyToolsHref}
                className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-white to-emerald-50/60 p-6 sm:p-8 transition hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                      Spotify Playlist Tools
                    </div>
                    <h3 className="text-2xl font-semibold text-[#171923]">Playlists, BPM, and key insights</h3>
                    <p className="text-[13px] text-gray-500">
                      Search and sort your playlists, analyze tempo/key, and keep track-level insights tidy.
                    </p>
                  </div>
                  <div className="hidden sm:flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                      <path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm4.2 13.2a.9.9 0 0 1-1.24.34 7.5 7.5 0 0 0-6.12-1.2.9.9 0 0 1-.42-1.75 9.3 9.3 0 0 1 7.6 1.48.9.9 0 0 1 .34 1.13Zm1.56-3.52a1 1 0 0 1-1.4.38 9.7 9.7 0 0 0-8.06-1.43 1 1 0 1 1-.5-1.94 11.7 11.7 0 0 1 9.67 1.68 1 1 0 0 1 .3 1.31Zm.24-3.7a1.2 1.2 0 0 1-1.62.46 12.1 12.1 0 0 0-10.02-1.51 1.2 1.2 0 0 1-.7-2.29 14.5 14.5 0 0 1 12 1.82 1.2 1.2 0 0 1 .34 1.52Z" />
                    </svg>
                  </div>
                </div>
                <div className="mt-6 text-[11px] text-gray-400">
                  {isAuthenticated ? 'Open playlist tool' : 'Click to authenticate'}
                </div>
              </Link>

              <Link
                href="/credits"
                className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-white to-slate-50 p-6 sm:p-8 transition hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                      Credit Search Tools
                    </div>
                    <h3 className="text-2xl font-semibold text-[#171923]">Find producer, writer, and mixer credits</h3>
                    <p className="text-[13px] text-gray-500">
                      Search MusicBrainz credits without logging in and export data for deeper research.
                    </p>
                  </div>
                  <div className="hidden sm:flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                      <path d="M11 3a8 8 0 1 0 4.9 14.3l4.4 4.4 1.4-1.4-4.4-4.4A8 8 0 0 0 11 3Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z" />
                    </svg>
                  </div>
                </div>
                <div className="mt-6 text-[11px] text-gray-400">Open credits search</div>
              </Link>
            </div>

            <div className="space-y-3 text-xs text-gray-400">
              <p>
                Due to{' '}
                <a
                  href="https://developer.spotify.com/blog/2025-04-15-updating-the-criteria-for-web-api-extended-access"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 hover:text-emerald-700 underline"
                >
                  new policies
                </a>{' '}
                from Spotify, Spotify Playlist Tools is open only to a few authorized users. If you are interested in
                using it, email{' '}
                <a href="mailto:delman@delman.it" className="text-emerald-600 hover:text-emerald-700 underline">
                  delman@delman.it
                </a>
                .
              </p>
              <p className="text-xs text-gray-400">
                <span className="font-semibold text-gray-500">Privacy Notice:</span> Spotify login is used only to
                fetch your playlists. BPM/key results are cached per track to improve performance.
              </p>
            </div>
          </div>
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
    </main>
  )
}
