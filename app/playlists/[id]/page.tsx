'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

interface Track {
  id: string
  name: string
  artists: Array<{
    name: string
    id?: string
    external_urls?: {
      spotify: string
    }
  }>
  album: {
    name: string
    release_date: string
    images: Array<{ url: string }>
    id?: string
    external_urls?: {
      spotify: string
    }
  }
  duration_ms: number
  explicit: boolean
  external_urls: {
    spotify: string
  }
  preview_url?: string | null
  added_at?: string
  tempo?: number | null
}

interface PlaylistTracksPageProps {
  params: {
    id: string
  }
}

type SortField = 'name' | 'artists' | 'album' | 'release_date' | 'duration' | 'added_at' | 'tempo'
type SortDirection = 'asc' | 'desc'

export default function PlaylistTracksPage({ params }: PlaylistTracksPageProps) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [bpmFrom, setBpmFrom] = useState('')
  const [bpmTo, setBpmTo] = useState('')
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null)
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [debugInfo, setDebugInfo] = useState<any>(null)

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
        
        // Debug: Log the response
        console.log('Tracks API Response:', data)
        console.log('First track sample:', data[0])
        console.log('BPM data in first track:', data[0]?.tempo)
        
        // Count tracks with BPM data
        const tracksWithBPM = data.filter((track: Track) => track.tempo != null)
        console.log(`Tracks with BPM: ${tracksWithBPM.length} of ${data.length}`)
        
        setDebugInfo({
          totalTracks: data.length,
          tracksWithBPM: tracksWithBPM.length,
          sampleTrack: data[0],
          allTracks: data
        })
        
        setTracks(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchTracks()
  }, [params.id])

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.pause()
        audioElement.src = ''
      }
    }
  }, [audioElement])

  const handleTrackClick = (track: Track) => {
    if (!track.preview_url) {
      console.log('No preview URL available for track:', track.name)
      return
    }

    // If clicking the same track, toggle play/pause
    if (currentlyPlaying === track.id && audioElement) {
      if (audioElement.paused) {
        audioElement.play()
      } else {
        audioElement.pause()
        setCurrentlyPlaying(null)
      }
      return
    }

    // Stop current audio if playing
    if (audioElement) {
      audioElement.pause()
      audioElement.src = ''
    }

    // Play new track
    const audio = new Audio(track.preview_url)
    audio.play()
      .then(() => {
        setCurrentlyPlaying(track.id)
        setAudioElement(audio)
      })
      .catch((error) => {
        console.error('Error playing preview:', error)
      })

    // Auto-stop when audio ends
    audio.addEventListener('ended', () => {
      setCurrentlyPlaying(null)
      setAudioElement(null)
    })
  }

  const formatDuration = (ms: number): string => {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString()
  }

  const getYear = (dateString: string | null | undefined): number | null => {
    if (!dateString) return null
    // Extract year from date string (format can be YYYY, YYYY-MM, or YYYY-MM-DD)
    const year = dateString.split('-')[0]
    const yearNum = parseInt(year, 10)
    return isNaN(yearNum) ? null : yearNum
  }

  const getYearString = (dateString: string | null | undefined): string => {
    const year = getYear(dateString)
    return year ? year.toString() : 'N/A'
  }

  const filteredTracks = tracks.filter((track) => {
    // Text search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesText = (
        track.name.toLowerCase().includes(query) ||
        track.artists.some((artist) => artist.name.toLowerCase().includes(query)) ||
        track.album.name.toLowerCase().includes(query) ||
        track.album.release_date.includes(query) ||
        (track.tempo && Math.round(track.tempo).toString().includes(query))
      )
      if (!matchesText) return false
    }

    // Year filter
    const trackYear = getYear(track.album.release_date)
    if (yearFrom || yearTo) {
      if (trackYear === null) return false
      if (yearFrom && trackYear < parseInt(yearFrom, 10)) return false
      if (yearTo && trackYear > parseInt(yearTo, 10)) return false
    }

    // BPM filter
    const trackBpm = track.tempo ? Math.round(track.tempo) : null
    if (bpmFrom || bpmTo) {
      if (trackBpm === null) return false
      if (bpmFrom && trackBpm < parseInt(bpmFrom, 10)) return false
      if (bpmTo && trackBpm > parseInt(bpmTo, 10)) return false
    }

    return true
  })

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortedTracks = [...filteredTracks].sort((a, b) => {
    if (!sortField) return 0

    let aValue: string | number
    let bValue: string | number

    switch (sortField) {
      case 'name':
        aValue = a.name.toLowerCase()
        bValue = b.name.toLowerCase()
        break
      case 'artists':
        aValue = a.artists.map((artist) => artist.name).join(', ').toLowerCase()
        bValue = b.artists.map((artist) => artist.name).join(', ').toLowerCase()
        break
      case 'album':
        aValue = a.album.name.toLowerCase()
        bValue = b.album.name.toLowerCase()
        break
      case 'release_date':
        aValue = a.album.release_date || ''
        bValue = b.album.release_date || ''
        break
      case 'duration':
        aValue = a.duration_ms
        bValue = b.duration_ms
        break
      case 'added_at':
        aValue = a.added_at || ''
        bValue = b.added_at || ''
        break
      case 'tempo':
        aValue = a.tempo ?? -1
        bValue = b.tempo ?? -1
        break
      default:
        return 0
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <span className="ml-1 text-gray-400 text-xs">
          ↕
        </span>
      )
    }
    return (
      <span className="ml-1 text-gray-600 text-xs">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-xl text-gray-700">Loading tracks...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <Link
              href="/playlists"
              className="text-blue-600 hover:text-blue-700 inline-block"
            >
              ← Back to Playlists
            </Link>
          </div>
          <div className="flex items-center justify-center min-h-[60vh]">
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
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 sm:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <Link
            href="/playlists"
            className="text-blue-600 hover:text-blue-700 inline-block text-sm sm:text-base"
          >
            ← Back to Playlists
          </Link>
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="text-xs sm:text-sm bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-3 sm:px-4 rounded transition-colors"
          >
            {showDebug ? 'Hide' : 'Show'} Debug
          </button>
        </div>
        
        {showDebug && debugInfo && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-100 rounded-lg border border-gray-300 overflow-auto max-h-96">
            <h3 className="font-bold mb-2 text-sm sm:text-base">Debug Information</h3>
            <div className="text-xs sm:text-sm space-y-2">
              <p><strong>Total Tracks:</strong> {debugInfo.totalTracks}</p>
              <p><strong>Tracks with BPM:</strong> {debugInfo.tracksWithBPM}</p>
              <details className="mt-2">
                <summary className="cursor-pointer font-semibold text-xs sm:text-sm">Sample Track Data</summary>
                <pre className="mt-2 text-xs bg-white p-2 rounded overflow-auto">
                  {JSON.stringify(debugInfo.sampleTrack, null, 2)}
                </pre>
              </details>
              <details className="mt-2">
                <summary className="cursor-pointer font-semibold text-xs sm:text-sm">All Tracks (first 5)</summary>
                <pre className="mt-2 text-xs bg-white p-2 rounded overflow-auto">
                  {JSON.stringify(debugInfo.allTracks.slice(0, 5), null, 2)}
                </pre>
              </details>
            </div>
          </div>
        )}
        
        <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
          <div>
            <input
              type="text"
              placeholder="Search tracks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-3 sm:py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-base sm:text-sm"
            />
          </div>
          
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 underline py-2"
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced Filters
            </button>
            
            {showAdvanced && (
              <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-gray-100 rounded-lg border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Year Range
                    </label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        placeholder="From"
                        value={yearFrom}
                        onChange={(e) => setYearFrom(e.target.value)}
                        className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      <span className="text-gray-500">to</span>
                      <input
                        type="number"
                        placeholder="To"
                        value={yearTo}
                        onChange={(e) => setYearTo(e.target.value)}
                        className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      BPM Range
                    </label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        placeholder="From"
                        value={bpmFrom}
                        onChange={(e) => setBpmFrom(e.target.value)}
                        className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      <span className="text-gray-500">to</span>
                      <input
                        type="number"
                        placeholder="To"
                        value={bpmTo}
                        onChange={(e) => setBpmTo(e.target.value)}
                        className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
                
                {(yearFrom || yearTo || bpmFrom || bpmTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setYearFrom('')
                      setYearTo('')
                      setBpmFrom('')
                      setBpmTo('')
                    }}
                    className="mt-4 text-sm text-red-600 hover:text-red-700 underline"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="block sm:hidden space-y-3">
          {sortedTracks.map((track) => (
            <div
              key={track.id}
              className={`bg-white rounded-lg border border-gray-200 shadow-sm p-4 ${track.preview_url ? 'cursor-pointer' : ''} ${currentlyPlaying === track.id ? 'bg-green-50 border-green-300' : ''}`}
              onClick={() => track.preview_url && handleTrackClick(track)}
            >
              <div className="flex gap-3">
                {track.album.images && track.album.images[0] ? (
                  <Image
                    src={track.album.images[0].url}
                    alt={track.album.name}
                    width={60}
                    height={60}
                    className="w-15 h-15 object-cover rounded flex-shrink-0"
                  />
                ) : (
                  <div className="w-15 h-15 bg-gray-200 rounded flex-shrink-0 flex items-center justify-center">
                    <span className="text-gray-400 text-xs">No image</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 mb-1">
                    {track.preview_url && (
                      <span className="text-green-600 text-sm mt-0.5">
                        {currentlyPlaying === track.id ? '⏸' : '▶'}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm truncate">
                        {track.name}
                        {track.explicit && (
                          <span className="ml-1 text-xs bg-gray-200 text-gray-700 px-1 py-0.5 rounded">E</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {track.artists.map((artist, index) => (
                          <span key={artist.id || index}>
                            {artist.external_urls?.spotify ? (
                              <a
                                href={artist.external_urls.spotify}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-600 hover:text-green-700"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {artist.name}
                              </a>
                            ) : (
                              <span>{artist.name}</span>
                            )}
                            {index < track.artists.length - 1 && ', '}
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {track.album.external_urls?.spotify ? (
                          <a
                            href={track.album.external_urls.spotify}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-600 hover:text-green-700"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {track.album.name}
                          </a>
                        ) : (
                          <span>{track.album.name}</span>
                        )}
                        {' • '}
                        {getYearString(track.album.release_date)}
                        {' • '}
                        {formatDuration(track.duration_ms)}
                        {track.tempo != null && ` • ${Math.round(track.tempo)} BPM`}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block bg-white rounded-lg overflow-hidden border border-gray-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 w-12 lg:w-16">
                    Cover
                  </th>
                  <th
                    className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center">
                      Track
                      <SortIcon field="name" />
                    </div>
                  </th>
                  <th
                    className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none hidden md:table-cell"
                    onClick={() => handleSort('artists')}
                  >
                    <div className="flex items-center">
                      Artists
                      <SortIcon field="artists" />
                    </div>
                  </th>
                  <th
                    className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none hidden lg:table-cell"
                    onClick={() => handleSort('album')}
                  >
                    <div className="flex items-center">
                      Album
                      <SortIcon field="album" />
                    </div>
                  </th>
                  <th
                    className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('release_date')}
                  >
                    <div className="flex items-center">
                      Year
                      <SortIcon field="release_date" />
                    </div>
                  </th>
                  <th
                    className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none hidden md:table-cell"
                    onClick={() => handleSort('duration')}
                  >
                    <div className="flex items-center">
                      Duration
                      <SortIcon field="duration" />
                    </div>
                  </th>
                  <th
                    className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none hidden lg:table-cell"
                    onClick={() => handleSort('added_at')}
                  >
                    <div className="flex items-center">
                      Added At
                      <SortIcon field="added_at" />
                    </div>
                  </th>
                  <th
                    className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none hidden md:table-cell"
                    onClick={() => handleSort('tempo')}
                  >
                    <div className="flex items-center">
                      BPM
                      <SortIcon field="tempo" />
                    </div>
                  </th>
                  <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedTracks.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                      {(searchQuery || yearFrom || yearTo || bpmFrom || bpmTo) ? 'No tracks match your filters' : 'No tracks found'}
                    </td>
                  </tr>
                ) : (
                  sortedTracks.map((track) => (
                    <tr 
                      key={track.id} 
                      className={`hover:bg-gray-50 transition-colors ${track.preview_url ? 'cursor-pointer' : ''} ${currentlyPlaying === track.id ? 'bg-green-50' : ''}`}
                      onClick={() => track.preview_url && handleTrackClick(track)}
                    >
                      <td className="px-3 lg:px-4 py-2 lg:py-3">
                        {track.album.images && track.album.images[0] ? (
                          <Image
                            src={track.album.images[0].url}
                            alt={track.album.name}
                            width={40}
                            height={40}
                            className="w-8 h-8 sm:w-10 sm:h-10 object-cover rounded flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 rounded flex-shrink-0 flex items-center justify-center">
                            <span className="text-gray-400 text-xs">No image</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 lg:px-4 py-2 lg:py-3">
                        <div className="flex items-center gap-2">
                          {track.preview_url && (
                            <span className="text-green-600 text-sm">
                              {currentlyPlaying === track.id ? '⏸' : '▶'}
                            </span>
                          )}
                          <span className="font-medium text-gray-900 text-xs sm:text-sm">{track.name}</span>
                          {track.explicit && (
                            <span className="ml-1 text-xs bg-gray-200 text-gray-700 px-1 py-0.5 rounded">E</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-700 text-xs sm:text-sm hidden md:table-cell" onClick={(e) => e.stopPropagation()}>
                        {track.artists.map((artist, index) => (
                          <span key={artist.id || index}>
                            {artist.external_urls?.spotify ? (
                              <a
                                href={artist.external_urls.spotify}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-600 hover:text-green-700 hover:underline"
                              >
                                {artist.name}
                              </a>
                            ) : (
                              <span>{artist.name}</span>
                            )}
                            {index < track.artists.length - 1 && ', '}
                          </span>
                        ))}
                      </td>
                      <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-700 text-xs sm:text-sm hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
                        {track.album.external_urls?.spotify ? (
                          <a
                            href={track.album.external_urls.spotify}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-600 hover:text-green-700 hover:underline"
                          >
                            {track.album.name}
                          </a>
                        ) : (
                          <span>{track.album.name}</span>
                        )}
                      </td>
                      <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-600 text-xs sm:text-sm">
                        {getYearString(track.album.release_date)}
                      </td>
                      <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-600 text-xs sm:text-sm hidden md:table-cell">
                        {formatDuration(track.duration_ms)}
                      </td>
                      <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-600 text-xs sm:text-sm hidden lg:table-cell">
                        {track.added_at ? formatDate(track.added_at) : 'N/A'}
                      </td>
                      <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-600 text-xs sm:text-sm hidden md:table-cell">
                        {track.tempo != null ? Math.round(track.tempo) : (
                          <span className="text-gray-400" title={track.tempo === null ? 'BPM data is null' : 'BPM data not available'}>
                            N/A
                          </span>
                        )}
                      </td>
                      <td className="px-3 lg:px-4 py-2 lg:py-3" onClick={(e) => e.stopPropagation()}>
                        <a
                          href={track.external_urls.spotify}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 hover:text-green-700 text-xs sm:text-sm"
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
        <div className="mt-4 text-xs sm:text-sm text-gray-600">
          Showing {sortedTracks.length} of {tracks.length} tracks
        </div>
      </div>
    </div>
  )
}

