import Link from 'next/link'
import { getPlaylists } from '@/lib/spotify'
import PlaylistsTable from './PlaylistsTable'

interface Playlist {
  id: string
  name: string
  description: string | null
  images: Array<{ url: string }>
  owner: {
    display_name: string
    id: string
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

  try {
    playlists = await getPlaylists() as Playlist[]
  } catch (e) {
    error = e instanceof Error ? e.message : 'An error occurred'
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
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Playlists</h1>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded transition-colors"
            >
              Logout
            </button>
          </form>
        </div>
        
        <PlaylistsTable playlists={playlists} />
        
        {playlists.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No playlists found
          </div>
        )}
      </div>
    </div>
  )
}

