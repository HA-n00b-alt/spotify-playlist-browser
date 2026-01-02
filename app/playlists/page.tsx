import Link from 'next/link'
import Image from 'next/image'
import { getPlaylists } from '@/lib/spotify'

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
        
        <div className="bg-white rounded-lg overflow-hidden border border-gray-200 shadow-sm">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-700">Playlist</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-700">Description</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-700">Owner</th>
                <th className="px-6 py-4 text-right text-sm font-medium text-gray-700">Tracks</th>
                <th className="px-6 py-4 text-right text-sm font-medium text-gray-700">Followers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {playlists.map((playlist) => (
                <tr
                  key={playlist.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <Link
                      href={`/playlists/${playlist.id}`}
                      className="flex items-center gap-4 group"
                    >
                      {playlist.images[0] ? (
                        <Image
                          src={playlist.images[0].url}
                          alt={playlist.name}
                          width={50}
                          height={50}
                          className="w-12 h-12 object-cover rounded flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-200 rounded flex-shrink-0 flex items-center justify-center">
                          <span className="text-gray-400 text-xs">No image</span>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-900 group-hover:text-green-600 transition-colors truncate">
                          {playlist.name}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-gray-600 max-w-md truncate">
                      {playlist.description || <span className="text-gray-400 italic">No description</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-gray-700">{playlist.owner.display_name}</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="text-gray-700">{playlist.tracks.total}</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="text-gray-700">
                      {playlist.followers?.total !== undefined ? playlist.followers.total.toLocaleString() : '-'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {playlists.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No playlists found
          </div>
        )}
      </div>
    </div>
  )
}

