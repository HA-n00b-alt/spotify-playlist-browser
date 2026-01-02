'use client'

import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
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
  popularity?: number
}

interface PlaylistTracksPageProps {
  params: {
    id: string
  }
}

type SortField = 'name' | 'artists' | 'album' | 'release_date' | 'duration' | 'added_at' | 'tempo' | 'popularity'
type SortDirection = 'asc' | 'desc'

interface PlaylistInfo {
  id: string
  name: string
  description: string | null
  images: Array<{ url: string }>
  owner: {
    display_name: string
    external_urls?: {
      spotify: string
    }
  }
  tracks?: {
    total: number
  }
  external_urls: {
    spotify: string
  }
}

export default function PlaylistTracksPage({ params }: PlaylistTracksPageProps) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [playlistInfo, setPlaylistInfo] = useState<PlaylistInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [trackBpms, setTrackBpms] = useState<Record<string, number | null>>({})
  const [loadingBpms, setLoadingBpms] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [bpmFrom, setBpmFrom] = useState('')
  const [bpmTo, setBpmTo] = useState('')

  useEffect(() => {
    async function fetchPlaylistInfo() {
      try {
        const res = await fetch(`/api/playlists/${params.id}`)
        if (res.ok) {
          const playlist = await res.json()
          setPlaylistInfo(playlist)
        }
      } catch (e) {
        console.error('Error fetching playlist info:', e)
      }
    }

    fetchPlaylistInfo()
  }, [params.id])

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

  // Fetch BPM for tracks after they're loaded (in batches)
  useEffect(() => {
    if (tracks.length > 0) {
      // Fetch BPM for first 20 tracks initially, then more as user scrolls
      const tracksToFetch = tracks.slice(0, 20).filter(t => 
        trackBpms[t.id] === undefined && !loadingBpms.has(t.id)
      )
      if (tracksToFetch.length > 0) {
        fetchBpmsForTracks(tracksToFetch)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks.length]) // Only run when tracks are first loaded

  // Function to fetch BPM for tracks
  const fetchBpmsForTracks = async (tracksToFetch: Track[]) => {
    for (const track of tracksToFetch) {
      if (trackBpms[track.id] !== undefined || loadingBpms.has(track.id)) {
        continue // Already fetched or in progress
      }
      
      setLoadingBpms(prev => new Set(prev).add(track.id))
      
      try {
        const res = await fetch(`/api/bpm?spotifyTrackId=${track.id}`)
        if (res.ok) {
          const data = await res.json()
          setTrackBpms(prev => ({
            ...prev,
            [track.id]: data.bpm,
          }))
        }
      } catch (error) {
        console.error(`Error fetching BPM for track ${track.id}:`, error)
        setTrackBpms(prev => ({
          ...prev,
          [track.id]: null,
        }))
      } finally {
        setLoadingBpms(prev => {
          const next = new Set(prev)
          next.delete(track.id)
          return next
        })
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  // Fetch BPM for tracks after they're loaded (in batches)
  useEffect(() => {
    if (tracks.length > 0) {
      // Fetch BPM for first 20 tracks initially, then more as user scrolls
      const tracksToFetch = tracks.slice(0, 20).filter(t => 
        trackBpms[t.id] === undefined && !loadingBpms.has(t.id)
      )
      if (tracksToFetch.length > 0) {
        fetchBpmsForTracks(tracksToFetch)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks.length]) // Only run when tracks are first loaded

  /**
   * Handle track row click - open Spotify app via deep link
   */
  const handleTrackClick = (track: Track) => {
    // Use Spotify URI scheme to open app (opens app if available)
    const spotifyUri = `spotify:track:${track.id}`
    
    // Attempt to open Spotify app
    // This works on mobile and some desktop platforms
    window.location.href = spotifyUri
    
    // Fallback: if app doesn't open after a short delay, open web URL
    setTimeout(() => {
      // Check if we're still on the same page (app didn't navigate away)
      // If so, open web URL as fallback
      window.open(track.external_urls.spotify, '_blank', 'noopener,noreferrer')
    }, 500)
  }

  /**
   * Handle track title click - open Spotify app via deep link
   */
  const handleTrackTitleClick = (e: MouseEvent<HTMLAnchorElement>, track: Track) => {
    e.stopPropagation()
    
    // Use Spotify URI scheme to open app (opens app if available)
    const spotifyUri = `spotify:track:${track.id}`
    
    // Attempt to open Spotify app
    window.location.href = spotifyUri
    
    // Fallback: if app doesn't open after a short delay, open web URL
    setTimeout(() => {
      window.open(track.external_urls.spotify, '_blank', 'noopener,noreferrer')
    }, 500)
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
        ((trackBpms[track.id] != null && Math.round(trackBpms[track.id]!).toString().includes(query)) ||
         (track.tempo && Math.round(track.tempo).toString().includes(query)))
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

    // BPM filter (use new API BPM if available, fallback to track.tempo)
    const trackBpm = trackBpms[track.id] != null 
      ? Math.round(trackBpms[track.id]!) 
      : (track.tempo ? Math.round(track.tempo) : null)
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
                      aValue = trackBpms[a.id] ?? a.tempo ?? -1
                      bValue = trackBpms[b.id] ?? b.tempo ?? -1
                      break
      case 'popularity':
        aValue = a.popularity ?? -1
        bValue = b.popularity ?? -1
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

  function stripHtmlTags(text: string): string {
    if (typeof document === 'undefined') {
      // Server-side fallback: basic regex removal
      return text.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")
    }
    const textarea = document.createElement('textarea')
    textarea.innerHTML = text
    const decoded = textarea.value
    // Remove any remaining HTML tags
    const div = document.createElement('div')
    div.innerHTML = decoded
    return div.textContent || div.innerText || ''
  }

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto flex-1 w-full">
        <div className="mb-6">
          <Link
            href="/playlists"
            className="text-blue-600 hover:text-blue-700 inline-block text-sm sm:text-base"
          >
            ← Back to Playlists
          </Link>
        </div>
        
        {playlistInfo && (
          <div className="mb-6 bg-white rounded-lg border border-gray-200 shadow-sm p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {playlistInfo.images && playlistInfo.images[0] && (
                <Image
                  src={playlistInfo.images[0].url}
                  alt={playlistInfo.name}
                  width={120}
                  height={120}
                  className="w-24 h-24 sm:w-30 sm:h-30 object-cover rounded flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                {playlistInfo.external_urls?.spotify ? (
                  <a
                    href={playlistInfo.external_urls.spotify}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 hover:text-green-600 hover:underline block"
                    onClick={(e) => {
                      e.preventDefault()
                      const spotifyUri = `spotify:playlist:${playlistInfo.id}`
                      window.location.href = spotifyUri
                      setTimeout(() => {
                        window.open(playlistInfo.external_urls.spotify, '_blank', 'noopener,noreferrer')
                      }, 500)
                    }}
                  >
                    {playlistInfo.name}
                  </a>
                ) : (
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                    {playlistInfo.name}
                  </h1>
                )}
                {playlistInfo.description && (
                  <p className="text-sm sm:text-base text-gray-600 mb-2">
                    {stripHtmlTags(playlistInfo.description)}
                  </p>
                )}
                <div className="flex flex-wrap gap-3 text-xs sm:text-sm text-gray-500">
                  {playlistInfo.owner.external_urls?.spotify ? (
                    <>
                      <span>By </span>
                      <a
                        href={playlistInfo.owner.external_urls.spotify}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-600 hover:text-green-700 hover:underline"
                        onClick={(e) => {
                          e.preventDefault()
                          const ownerId = playlistInfo.owner.external_urls?.spotify.split('/').pop()
                          if (ownerId) {
                            const spotifyUri = `spotify:user:${ownerId}`
                            window.location.href = spotifyUri
                            setTimeout(() => {
                              window.open(playlistInfo.owner.external_urls?.spotify, '_blank', 'noopener,noreferrer')
                            }, 500)
                          }
                        }}
                      >
                        {playlistInfo.owner.display_name}
                      </a>
                      <span>•</span>
                    </>
                  ) : (
                    <>
                      <span>By {playlistInfo.owner.display_name}</span>
                      <span>•</span>
                    </>
                  )}
                  <span>{playlistInfo.tracks?.total ?? tracks.length} tracks</span>
                </div>
              </div>
              {playlistInfo.external_urls?.spotify && (
                <a
                  href={playlistInfo.external_urls.spotify}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-full transition-colors text-sm sm:text-base whitespace-nowrap"
                  onClick={(e) => {
                    e.preventDefault()
                    const spotifyUri = `spotify:playlist:${playlistInfo.id}`
                    window.location.href = spotifyUri
                    setTimeout(() => {
                      window.open(playlistInfo.external_urls.spotify, '_blank', 'noopener,noreferrer')
                    }, 500)
                  }}
                >
                  Open in Spotify
                </a>
              )}
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
              <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-gray-100 rounded-lg border border-gray-200 max-w-full sm:max-w-2xl">
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
              className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => handleTrackClick(track)}
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
                        <div className="flex-1 min-w-0">
                          <a
                            href={track.external_urls.spotify}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-gray-900 text-sm truncate hover:text-green-600 hover:underline block"
                            onClick={(e) => handleTrackTitleClick(e, track)}
                            title="Open in Spotify"
                          >
                            {track.name}
                            {track.explicit && (
                              <span className="ml-1 text-xs bg-gray-200 text-gray-700 px-1 py-0.5 rounded">E</span>
                            )}
                          </a>
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
                                    {(trackBpms[track.id] != null 
                                      ? ` • ${Math.round(trackBpms[track.id]!)} BPM`
                                      : track.tempo != null 
                                        ? ` • ${Math.round(track.tempo)} BPM`
                                        : loadingBpms.has(track.id)
                                          ? ' • BPM...'
                                          : '')}
                        {track.popularity != null && ` • Popularity: ${track.popularity}`}
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
                  <th
                    className="px-3 lg:px-4 py-2 lg:py-3 text-right text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none hidden lg:table-cell"
                    onClick={() => handleSort('popularity')}
                  >
                    <div className="flex items-center justify-end">
                      Popularity
                      <SortIcon field="popularity" />
                    </div>
                  </th>
                  <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 hidden sm:table-cell">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedTracks.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                      {(searchQuery || yearFrom || yearTo || bpmFrom || bpmTo) ? 'No tracks match your filters' : 'No tracks found'}
                    </td>
                  </tr>
                ) : (
                  sortedTracks.map((track) => (
                    <tr 
                      key={track.id} 
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => handleTrackClick(track)}
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
                          <a
                            href={track.external_urls.spotify}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-gray-900 text-xs sm:text-sm hover:text-green-600 hover:underline"
                            onClick={(e) => handleTrackTitleClick(e, track)}
                            title="Open in Spotify"
                          >
                            {track.name}
                          </a>
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
                                    {trackBpms[track.id] != null 
                                      ? Math.round(trackBpms[track.id]!)
                                      : track.tempo != null 
                                        ? Math.round(track.tempo)
                                        : loadingBpms.has(track.id)
                                          ? '...'
                                          : (
                                            <span className="text-gray-400" title="BPM data not available">
                                              N/A
                                            </span>
                                          )}
                                  </td>
                      <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-600 text-xs sm:text-sm text-right hidden lg:table-cell">
                        {track.popularity != null ? track.popularity : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-3 lg:px-4 py-2 lg:py-3 hidden sm:table-cell" onClick={(e) => e.stopPropagation()}>
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

