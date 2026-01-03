import Link from 'next/link'
import { getPlaylists } from '@/lib/spotify'
import { isAdminUser } from '@/lib/analytics'
import PlaylistsTable from './PlaylistsTable'

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
      // Handle rate limiting (429) specifically
      if (e.message.includes('Rate limit') || e.message.includes('429')) {
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
      <div className="min-h-screen flex items-center justify-center">
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
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-red-500">Error</h1>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto flex-1 w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">My Playlists</h1>
          <div className="flex gap-2">
            {isAdmin && (
              <Link
                href="/stats"
                className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded transition-colors text-sm sm:text-base"
              >
                Stats
              </Link>
            )}
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded transition-colors text-sm sm:text-base"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
        
        <PlaylistsTable playlists={playlists} />
        
        {playlists.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No playlists found
          </div>
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

