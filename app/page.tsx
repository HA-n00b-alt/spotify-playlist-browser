import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PageHeader from './components/PageHeader'

async function checkAuth() {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('access_token')?.value
  const refreshToken = cookieStore.get('refresh_token')?.value
  return !!(accessToken || refreshToken)
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; skipRedirect?: string }>
}) {
  const isAuthenticated = await checkAuth()
  const params = await searchParams
  const error = params?.error
  const skipRedirect = params?.skipRedirect

  // If authenticated, redirect to playlists (unless skipRedirect is set)
  if (isAuthenticated && !error && !skipRedirect) {
    redirect('/playlists')
  }

  return (
    <main className="flex min-h-screen flex-col p-4 sm:p-8 bg-transparent">
      <div className="max-w-7xl mx-auto flex-1 w-full">
        <PageHeader subtitle="Welcome" breadcrumbs={[{ label: 'Home' }]} />

        <div className="rounded-2xl bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)] border-t border-gray-100 sm:p-10">
          <div className="max-w-2xl space-y-6 text-sm text-gray-600">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-[#171923]">Spotify Playlist Tools</h2>
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
                from Spotify, this app is open only to a few authorized users. If you are interested in using it, email{' '}
                <a href="mailto:delman@delman.it" className="text-emerald-600 hover:text-emerald-700 underline">
                  delman@delman.it
                </a>
                .
              </p>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error === 'access_denied'
                  ? 'Authorization was denied. Please try again.'
                  : error === 'token_exchange_failed'
                  ? 'Failed to complete login. Please try again.'
                  : 'An error occurred during login. Please try again.'}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/api/auth/login"
                className="inline-flex items-center rounded-full bg-[#18B45A] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#149A4C]"
              >
                Login with Spotify
              </Link>
              <span className="text-xs text-gray-500">
                You&apos;ll be redirected to Spotify to authorize this application.
              </span>
            </div>

            <div className="rounded-lg border border-gray-100 bg-[#F5F5F7] px-4 py-3 text-xs text-gray-600">
              <span className="font-semibold text-[#171923]">Privacy Notice:</span> Your Spotify login is used only to
              temporarily fetch your playlists. No data about your playlists or the association between songs and
              playlists is stored. Only BPM information for individual songs is cached (not linked to playlists or
              users) to improve performance.
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
        </a>
        .
      </footer>
    </main>
  )
}
