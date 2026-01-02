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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-xl text-gray-700">Loading tracks...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-red-600">Error</h1>
          <p className="mb-4 text-gray-700">{error}</p>
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
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/playlists"
            className="text-blue-600 hover:text-blue-700 mb-4 inline-block"
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
            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        <div className="bg-white rounded-lg overflow-hidden border border-gray-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Track</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Artists</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Album</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Release Date</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Duration</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Added At</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredTracks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      {searchQuery ? 'No tracks match your search' : 'No tracks found'}
                    </td>
                  </tr>
                ) : (
                  filteredTracks.map((track) => (
                    <tr key={track.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{track.name}</span>
                        {track.explicit && (
                          <span className="ml-2 text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">E</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {track.artists.map((artist) => artist.name).join(', ')}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{track.album.name}</td>
                      <td className="px-4 py-3 text-gray-600 text-sm">
                        {track.album.release_date || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-sm">
                        {formatDuration(track.duration_ms)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-sm">
                        {track.added_at ? formatDate(track.added_at) : 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={track.external_urls.spotify}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 hover:text-green-700"
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
        <div className="mt-4 text-sm text-gray-600">
          Showing {filteredTracks.length} of {tracks.length} tracks
        </div>
      </div>
    </div>
  )
}

