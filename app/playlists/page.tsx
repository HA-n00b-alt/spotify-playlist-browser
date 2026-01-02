import Link from 'next/link'
import Image from 'next/image'

interface Playlist {
  id: string
  name: string
  description: string | null
  images: Array<{ url: string }>
  owner: {
    display_name: string
  }
  tracks: {
    total: number
  }
}

async function getPlaylists(): Promise<Playlist[]> {
  // Use absolute URL for server-side fetch
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/playlists`, {
    cache: 'no-store',
  })
  
  if (!res.ok) {
    if (res.status === 401) {
      // Redirect to login if not authenticated
      throw new Error('Unauthorized')
    }
    throw new Error('Failed to fetch playlists')
  }
  
  return res.json()
}

export default async function PlaylistsPage() {
  let playlists: Playlist[] = []
  let error: string | null = null

  try {
    playlists = await getPlaylists()
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
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">My Playlists</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {playlists.map((playlist) => (
            <Link
              key={playlist.id}
              href={`/playlists/${playlist.id}`}
              className="bg-gray-800 rounded-lg p-4 hover:bg-gray-700 transition-colors"
            >
              {playlist.images[0] && (
                <Image
                  src={playlist.images[0].url}
                  alt={playlist.name}
                  width={300}
                  height={300}
                  className="w-full aspect-square object-cover rounded mb-3"
                />
              )}
              <h2 className="font-semibold text-lg mb-1 truncate">{playlist.name}</h2>
              <p className="text-sm text-gray-400 mb-2">
                {playlist.owner.display_name}
              </p>
              <p className="text-sm text-gray-500">
                {playlist.tracks.total} track{playlist.tracks.total !== 1 ? 's' : ''}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

