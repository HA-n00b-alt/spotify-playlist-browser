'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Track {
  id: string
  name: string
  artists: Array<{ name: string }>
  album: {
    name: string
    release_date: string
  }
  duration_ms: number
  explicit: boolean
  external_urls: {
    spotify: string
  }
  added_at?: string
}

interface PlaylistTracksPageProps {
  params: {
    id: string
  }
}

export default function PlaylistTracksPage({ params }: PlaylistTracksPageProps) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    async function fetchTracks() {
      try {
        const res = await fetch(`/api/playlists/${params.id}/tracks`)
        if (!res.ok) {
          if (res.status === 401) {
            setError('Unauthorized - Please log in')
            return
          }
          throw new Error('Failed to fetch tracks')
        }
        const data = await res.json()
        setTracks(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchTracks()
  }, [params.id])

  const formatDuration = (ms: number): string => {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString()
  }

  const filteredTracks = tracks.filter((track) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      track.name.toLowerCase().includes(query) ||
      track.artists.some((artist) => artist.name.toLowerCase().includes(query)) ||
      track.album.name.toLowerCase().includes(query) ||
      track.album.release_date.includes(query)
    )
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xl">Loading tracks...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-red-500">Error</h1>
          <p className="mb-4">{error}</p>
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

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/playlists"
            className="text-blue-400 hover:text-blue-300 mb-4 inline-block"
          >
            ← Back to Playlists
          </Link>
        </div>
        
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search tracks by name, artist, album, or release date..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-gray-800 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Track</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Artists</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Album</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Release Date</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Duration</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Added At</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Link</th>
                </tr>
              </thead>
              <tbody>
                {filteredTracks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                      {searchQuery ? 'No tracks match your search' : 'No tracks found'}
                    </td>
                  </tr>
                ) : (
                  filteredTracks.map((track) => (
                    <tr key={track.id} className="border-t border-gray-700 hover:bg-gray-750">
                      <td className="px-4 py-3">
                        <span className="font-medium">{track.name}</span>
                        {track.explicit && (
                          <span className="ml-2 text-xs bg-gray-700 px-1.5 py-0.5 rounded">E</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {track.artists.map((artist) => artist.name).join(', ')}
                      </td>
                      <td className="px-4 py-3 text-gray-300">{track.album.name}</td>
                      <td className="px-4 py-3 text-gray-400 text-sm">
                        {track.album.release_date || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm">
                        {formatDuration(track.duration_ms)}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm">
                        {track.added_at ? formatDate(track.added_at) : 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={track.external_urls.spotify}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-400 hover:text-green-300"
                        >
                          Open
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-4 text-sm text-gray-400">
          Showing {filteredTracks.length} of {tracks.length} tracks
        </div>
      </div>
    </div>
  )
}

