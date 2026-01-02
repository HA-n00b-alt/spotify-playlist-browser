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
  searchParams?: Promise<{ error?: string }>
}) {
  const isAuthenticated = await checkAuth()
  const params = await searchParams
  const error = params?.error

  // If authenticated, redirect to playlists
  if (isAuthenticated && !error) {
    redirect('/playlists')
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center max-w-md">
        <h1 className="text-4xl font-bold mb-4">Spotify Playlist Browser</h1>
        <p className="text-gray-400 mb-8">
          Browse and search your Spotify playlists with ease
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
          You'll be redirected to Spotify to authorize this application
        </p>
      </div>
    </main>
  )
}

