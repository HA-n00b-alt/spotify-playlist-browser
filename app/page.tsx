import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

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
    <main className="flex min-h-screen flex-col items-center justify-center p-8 sm:p-24">
      <div className="text-center max-w-md w-full">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2 sm:mb-4">Spotify Playlist Tools</h1>
        <p className="text-gray-400 mb-6 sm:mb-8 text-sm sm:text-base">
          Search and sort your Spotify playlists with ease
        </p>

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
      
      <footer className="mt-auto py-6 sm:py-8 text-center text-xs sm:text-sm text-gray-500">
        Created by{' '}
        <a href="mailto:delman@delman.it" className="text-green-600 hover:text-green-700 hover:underline">
          delman@delman.it
        </a>
        . Powered by{' '}
        <a href="https://spotify.com" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
          Spotify
        </a>
      </footer>
    </main>
  )
}

