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
    <main className="flex min-h-screen flex-col p-4 sm:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto flex-1 w-full">
        <PageHeader subtitle="Search and sort your playlists with ease" />
        
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center max-w-md w-full">
            <div className="mb-6 p-4 bg-yellow-900/50 border border-yellow-700 rounded-lg">
          <p className="text-yellow-200 text-sm leading-relaxed">
            Due to <a href="https://developer.spotify.com/blog/2025-04-15-updating-the-criteria-for-web-api-extended-access" target="_blank" rel="noopener noreferrer" className="text-yellow-300 hover:text-yellow-200 underline">new policies</a> from Spotify that prevent community developments, this app is open only to a few authorized users. If you are interested in using it, please email me at{' '}
            <a href="mailto:delman@delman.it" className="text-yellow-300 hover:text-yellow-200 underline">
              delman@delman.it
            </a>
            .
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg">
              <p className="text-red-200 text-sm">
                {error === 'access_denied'
                  ? 'Authorization was denied. Please try again.'
                  : error === 'token_exchange_failed'
                  ? 'Failed to complete login. Please try again.'
                  : 'An error occurred during login. Please try again.'}
              </p>
            </div>
          )}

          <Link
            href="/api/auth/login"
            className="inline-block bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-full transition-colors"
          >
            Login with Spotify
          </Link>

          <p className="mt-6 text-xs text-gray-500">
            You&apos;ll be redirected to Spotify to authorize this application
          </p>

          <div className="mt-8 p-4 bg-white border border-gray-300 rounded-lg max-w-lg">
            <p className="text-xs text-gray-900 leading-relaxed">
              <strong className="text-gray-900">Privacy Notice:</strong> Your Spotify login is used only to temporarily fetch your playlists. 
              No data about your playlists or the association between songs and playlists is stored. 
              Only BPM information for individual songs is cached (not linked to playlists or users) to improve performance.
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
        </a>
        .
      </footer>
    </main>
  )
}

