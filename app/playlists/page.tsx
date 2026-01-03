import Link from 'next/link'
import { getPlaylists } from '@/lib/spotify'
import { isAdminUser } from '@/lib/analytics'
import PlaylistsTable from './PlaylistsTable'
import UserMenu from '../components/UserMenu'

interface Playlist {
  id: string
  name: string
  description: string | null
  images: Array<{ url: string }>
  owner: {
    display_name: string
    id: string
    external_urls?: {
      spotify: string
    }
  }
  tracks: {
    total: number
    href: string
  }
  public: boolean
  collaborative: boolean
  followers?: {
    total: number
  }
  external_urls: {
    spotify: string
  }
  snapshot_id: string
  href: string
  uri: string
}

export default async function PlaylistsPage() {
  let playlists: Playlist[] = []
  let error: string | null = null
  const isAdmin = await isAdminUser()

  try {
    playlists = await getPlaylists() as Playlist[]
  } catch (e) {
    if (e instanceof Error) {
      console.error('[Playlists Page] Error fetching playlists:', e.message)
      // Handle forbidden (403) specifically
      if (e.message.includes('Forbidden') || e.message.includes('403')) {
        // Extract the actual error message if available, otherwise use default
        const match = e.message.match(/Forbidden:\s*(.+)/)
        const forbiddenMessage = match && match[1] && match[1] !== 'Forbidden' 
          ? match[1] 
          : 'Please ensure the Spotify app has permission to access your playlists. You may need to re-authorize the app.'
        error = `Access forbidden. ${forbiddenMessage}`
      } else if (e.message.includes('Rate limit') || e.message.includes('429')) {
        // Handle rate limiting (429) specifically
        error = 'Spotify API rate limit exceeded. Please wait a moment and refresh the page.'
      } else {
        error = e.message
      }
    } else {
      error = 'An error occurred'
    }
  }

  if (error === 'Unauthorized') {
    return (
      <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-gray-50">
        <div className="max-w-7xl mx-auto flex-1 w-full">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">My Playlists</h1>
            <div className="flex gap-2 items-center">
              <Link
                href="/"
                className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded transition-colors text-sm sm:text-base"
              >
                Home
              </Link>
              <UserMenu />
            </div>
          </div>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <h1 className="text-2xl font-bold mb-4">Please log in</h1>
              <Link
                href="/api/auth/login"
                className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-full"
              >
                Login with Spotify
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    // Check if error is a 403/Forbidden error (case insensitive)
    const isForbidden = error.toLowerCase().includes('forbidden') || error.includes('403')
    
    console.log('[Playlists Page] Error page rendering:', { error, isForbidden })
    
    return (
      <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-gray-50">
        <div className="max-w-7xl mx-auto flex-1 w-full">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">My Playlists</h1>
            <div className="flex gap-2 items-center">
              <Link
                href="/"
                className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded transition-colors text-sm sm:text-base"
              >
                Home
              </Link>
              <UserMenu />
            </div>
          </div>
          
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center max-w-md px-4">
              <div className="mb-6">
                <svg
                  className="w-20 h-20 mx-auto text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-4 text-red-500">Error</h1>
              <p className="text-gray-700 mb-6 text-base sm:text-lg">{error}</p>
              
              {isForbidden ? (
                <div className="flex flex-col items-center gap-4">
                  <form action="/api/auth/logout" method="POST" className="inline">
                    <button
                      type="submit"
                      className="bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-full transition-colors"
                    >
                      Reauthorize
                    </button>
                  </form>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <form action="/playlists" method="GET" className="inline">
                    <button
                      type="submit"
                      className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-3 px-6 rounded-full transition-colors w-full sm:w-auto"
                    >
                      Refresh Page
                    </button>
                  </form>
                  <Link
                    href="/"
                    className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-3 px-6 rounded-full transition-colors inline-block text-center"
                  >
                    Go to Home
                  </Link>
                </div>
              )}
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
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto flex-1 w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">My Playlists</h1>
          <div className="flex gap-2 items-center">
            <Link
              href="/"
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded transition-colors text-sm sm:text-base"
            >
              Home
            </Link>
            {isAdmin && (
              <Link
                href="/stats"
                className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded transition-colors text-sm sm:text-base"
              >
                Stats
              </Link>
            )}
            <UserMenu />
          </div>
        </div>
        
        {playlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 sm:py-24 bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="text-center max-w-md px-4">
              <div className="mb-6">
                <svg
                  className="w-24 h-24 mx-auto text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                  />
                </svg>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
                No playlists yet
              </h2>
              <p className="text-gray-600 mb-6 text-base sm:text-lg">
                You don&apos;t have any playlists in your Spotify account. Create a playlist in Spotify to get started!
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href="https://open.spotify.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-full transition-colors inline-flex items-center justify-center gap-2"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z" />
                  </svg>
                  Open Spotify
                </a>
                <form action="/playlists" method="GET" className="inline">
                  <button
                    type="submit"
                    className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-3 px-6 rounded-full transition-colors w-full sm:w-auto"
                  >
                    Refresh
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : (
          <PlaylistsTable playlists={playlists} />
        )}
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
      </footer>
    </div>
  )
}

