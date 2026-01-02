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
  const [showBpmDebug, setShowBpmDebug] = useState(false)
  const [bpmDebugInfo, setBpmDebugInfo] = useState<Record<string, any>>({})
  const [bpmDetails, setBpmDetails] = useState<Record<string, { source?: string; error?: string; upc?: string }>>({})
  const [showBpmModal, setShowBpmModal] = useState(false)
  const [selectedBpmTrack, setSelectedBpmTrack] = useState<Track | null>(null)
  const [bpmProcessingStartTime, setBpmProcessingStartTime] = useState<number | null>(null)
  const [bpmProcessingEndTime, setBpmProcessingEndTime] = useState<number | null>(null)
  const [bpmTracksCalculated, setBpmTracksCalculated] = useState<number>(0) // Track how many were actually calculated (not cached)
  const [retryStatus, setRetryStatus] = useState<{ loading: boolean; success?: boolean; error?: string } | null>(null)
  const [retryAttempted, setRetryAttempted] = useState(false)
  const [showBpmMoreInfo, setShowBpmMoreInfo] = useState(false)
  const [countryCode, setCountryCode] = useState<string>('us')
  const [tracksProcessedCount, setTracksProcessedCount] = useState<number>(0) // Number of tracks with entries in DB
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [bpmFrom, setBpmFrom] = useState('')
  const [bpmTo, setBpmTo] = useState('')
  const [includeHalfDoubleBpm, setIncludeHalfDoubleBpm] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showBpmInfo, setShowBpmInfo] = useState(false)

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

    async function checkAdmin() {
      try {
        const res = await fetch('/api/auth/is-admin')
        if (res.ok) {
          const data = await res.json()
          setIsAdmin(data.isAdmin || false)
        }
      } catch (e) {
        console.error('Error checking admin status:', e)
      }
    }

    fetchPlaylistInfo()
    checkAdmin()
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

  // Fetch country code on mount
  useEffect(() => {
    const fetchCountry = async () => {
      try {
        const res = await fetch('/api/country')
        if (res.ok) {
          const data = await res.json()
          setCountryCode(data.countryCode || 'us')
        }
      } catch (error) {
        console.error('[BPM Client] Error fetching country:', error)
      }
    }
    fetchCountry()
  }, [])

  // Check status of all tracks in database
  useEffect(() => {
    if (tracks.length > 0) {
      checkTracksInDb()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks.length])

  // Check how many tracks have entries in the database
  const checkTracksInDb = async () => {
    const trackIds = tracks.map(t => t.id)
    if (trackIds.length === 0) return

    try {
      const res = await fetch('/api/bpm/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds }),
      })

      if (res.ok) {
        const data = await res.json()
        // Count tracks that have an entry in DB (either BPM or N/A with details)
        const processedCount = trackIds.filter(id => {
          const result = data.results?.[id]
          return result && (result.bpm !== undefined || result.error !== undefined || result.source !== undefined)
        }).length
        setTracksProcessedCount(processedCount)
      }
    } catch (error) {
      console.error('[BPM Client] Error checking tracks in DB:', error)
    }
  }

  // Fetch BPM for all tracks using batch endpoint
  useEffect(() => {
    if (tracks.length > 0 && Object.keys(trackBpms).length === 0) {
      setBpmProcessingStartTime(Date.now())
      fetchBpmsBatch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks.length])

  // Update processed count when trackBpms changes
  useEffect(() => {
    if (tracks.length > 0) {
      // Count tracks that have a result (either BPM or N/A)
      const processed = tracks.filter(t => trackBpms[t.id] !== undefined).length
      setTracksProcessedCount(processed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackBpms, tracks.length])

  // Track when BPM processing completes
  useEffect(() => {
    if (tracks.length > 0 && bpmProcessingStartTime && !bpmProcessingEndTime) {
      const tracksWithBpm = Object.values(trackBpms).filter(bpm => bpm !== null && bpm !== undefined).length
      const tracksWithoutBpm = tracks.filter(t => 
        trackBpms[t.id] === undefined || trackBpms[t.id] === null
      ).length
      const tracksLoading = loadingBpms.size
      
      // Processing is complete when no tracks are loading and all tracks have been attempted
      // Only set end time if at least one track was calculated (not just all cached)
      if (tracksLoading === 0 && tracksWithoutBpm === 0 && tracksWithBpm > 0) {
        setBpmProcessingEndTime(Date.now())
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackBpms, loadingBpms, tracks.length, bpmProcessingStartTime, bpmProcessingEndTime])

  // Batch fetch BPMs from cache
  const fetchBpmsBatch = async () => {
    const trackIds = tracks.map(t => t.id)
    if (trackIds.length === 0) return

    // Mark all as loading
    setLoadingBpms(new Set(trackIds))

    try {
      console.log(`[BPM Client] Fetching BPM batch for ${trackIds.length} tracks`)
      const res = await fetch('/api/bpm/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trackIds }),
      })

      if (res.ok) {
        const data = await res.json()
        console.log(`[BPM Client] Batch BPM data received:`, data)

        const newBpms: Record<string, number | null> = {}
        const newDetails: Record<string, { source?: string; error?: string; upc?: string }> = {}

        for (const [trackId, result] of Object.entries(data.results || {})) {
          const r = result as any
          newBpms[trackId] = r.bpm
          // Always store details if available (source, error, upc, urls)
          if (r.source || r.error || r.upc || r.urlsTried || r.successfulUrl) {
            newDetails[trackId] = {
              source: r.source,
              error: r.error,
              upc: r.upc,
            }
          }
          // Store debug info including URLs
          if (r.source || r.error || r.urlsTried || r.successfulUrl) {
            setBpmDebugInfo(prev => ({
              ...prev,
              [trackId]: {
                ...r,
                urlsTried: r.urlsTried || [],
                successfulUrl: r.successfulUrl || null,
              },
            }))
          }
        }

        setTrackBpms(newBpms)
        setBpmDetails(newDetails)

        // Count how many were cached (not calculated)
        const cachedCount = Object.values(data.results || {}).filter((r: any) => r.cached).length
        const calculatedFromBatch = Object.values(data.results || {}).filter((r: any) => r.bpm !== null && !r.cached).length
        setBpmTracksCalculated(prev => prev + calculatedFromBatch)

        // For tracks not in cache, fetch individually (but don't block UI)
        const uncachedTracks = tracks.filter(t => !data.results?.[t.id]?.cached)
        if (uncachedTracks.length > 0) {
          console.log(`[BPM Client] Fetching ${uncachedTracks.length} uncached tracks individually`)
          fetchBpmsForTracks(uncachedTracks)
        } else if (uncachedTracks.length === 0 && cachedCount === tracks.length) {
          // All tracks were cached, no processing happened
          setBpmProcessingStartTime(null)
        }
      } else {
        console.error(`[BPM Client] Batch fetch failed:`, res.status)
        // Fallback to individual fetching
        fetchBpmsForTracks(tracks)
      }
    } catch (error) {
      console.error(`[BPM Client] Batch fetch error:`, error)
      // Fallback to individual fetching
      fetchBpmsForTracks(tracks)
    } finally {
      setLoadingBpms(new Set())
    }
  }

  // Function to fetch BPM for individual tracks (for uncached tracks)
  const fetchBpmsForTracks = async (tracksToFetch: Track[]) => {
    // Process in smaller batches to avoid overwhelming the server
    const batchSize = 10
    for (let i = 0; i < tracksToFetch.length; i += batchSize) {
      const batch = tracksToFetch.slice(i, i + batchSize)
      
      await Promise.all(
        batch.map(async (track) => {
          if (trackBpms[track.id] !== undefined || loadingBpms.has(track.id)) {
            return // Already fetched or in progress
          }
          
          setLoadingBpms(prev => new Set(prev).add(track.id))
          
          try {
            const res = await fetch(`/api/bpm?spotifyTrackId=${track.id}&country=${countryCode}`)
            
            if (res.ok) {
              const data = await res.json()
              setTrackBpms(prev => ({
                ...prev,
                [track.id]: data.bpm,
              }))
              setBpmDetails(prev => ({
                ...prev,
                [track.id]: {
                  source: data.source,
                  error: data.error,
                  upc: data.upc,
                },
              }))
              setBpmDebugInfo(prev => ({
                ...prev,
                [track.id]: {
                  ...data,
                  urlsTried: data.urlsTried || [],
                  successfulUrl: data.successfulUrl || null,
                },
              }))
              // Increment calculated count (this track was just calculated, not cached)
              setBpmTracksCalculated(prev => prev + 1)
            } else {
              const errorData = await res.json().catch(() => ({}))
              setTrackBpms(prev => ({
                ...prev,
                [track.id]: null,
              }))
              setBpmDetails(prev => ({
                ...prev,
                [track.id]: {
                  error: errorData.error || 'Failed to fetch BPM',
                },
              }))
              setBpmDebugInfo(prev => ({
                ...prev,
                [track.id]: {
                  ...errorData,
                  urlsTried: errorData.urlsTried || [],
                  successfulUrl: errorData.successfulUrl || null,
                },
              }))
            }
          } catch (error) {
            console.error(`[BPM Client] Error fetching BPM for ${track.id}:`, error)
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
        })
      )
      
      // Small delay between batches
      if (i + batchSize < tracksToFetch.length) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }
  }

  /**
   * Handle track row click - open Spotify track in web player
   */
  const handleTrackClick = (track: Track) => {
    if (track.external_urls?.spotify) {
      window.open(track.external_urls.spotify, '_blank', 'noopener,noreferrer')
    }
  }

  /**
   * Handle track title click - open Spotify track in web player
   */
  const handleTrackTitleClick = (e: MouseEvent<HTMLAnchorElement>, track: Track) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (track.external_urls?.spotify) {
      window.open(track.external_urls.spotify, '_blank', 'noopener,noreferrer')
    }
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
      
      const bpmFromNum = bpmFrom ? parseInt(bpmFrom, 10) : null
      const bpmToNum = bpmTo ? parseInt(bpmTo, 10) : null
      
      // Check if track BPM matches the range
      const matchesBpm = (!bpmFromNum || trackBpm >= bpmFromNum) && (!bpmToNum || trackBpm <= bpmToNum)
      
      if (matchesBpm) {
        return true
      }
      
      // If includeHalfDoubleBpm is checked, also check half and double BPM
      if (includeHalfDoubleBpm) {
        const halfBpm = trackBpm / 2
        const doubleBpm = trackBpm * 2
        
        const matchesHalf = (!bpmFromNum || halfBpm >= bpmFromNum) && (!bpmToNum || halfBpm <= bpmToNum)
        const matchesDouble = (!bpmFromNum || doubleBpm >= bpmFromNum) && (!bpmToNum || doubleBpm <= bpmToNum)
        
        if (matchesHalf || matchesDouble) {
          return true
        }
      }
      
      return false
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
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <Link
            href="/playlists"
            className="text-blue-600 hover:text-blue-700 inline-block text-sm sm:text-base"
          >
            ← Back to Playlists
          </Link>
          {isAdmin && (
            <button
              onClick={() => setShowBpmDebug(!showBpmDebug)}
              className="text-xs sm:text-sm bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-1.5 px-3 sm:py-2 sm:px-4 rounded transition-colors self-end sm:self-auto"
            >
              {showBpmDebug ? 'Hide' : 'Show'} BPM Debug
            </button>
          )}
        </div>
        
        {showBpmDebug && (
          <div className="mb-6 p-4 bg-gray-100 rounded-lg border border-gray-300 overflow-auto max-h-96 text-xs sm:text-sm">
            <h3 className="font-bold mb-2 text-base sm:text-lg">BPM Debug Information</h3>
            <div className="space-y-2">
              <p><strong>Total tracks:</strong> {tracks.length}</p>
              <p><strong>Tracks with BPM:</strong> {Object.values(trackBpms).filter(bpm => bpm !== null && bpm !== undefined).length}</p>
              <p><strong>Tracks loading:</strong> {loadingBpms.size}</p>
              <details className="mt-2">
                <summary className="cursor-pointer font-semibold">BPM Results (first 10)</summary>
                <pre className="mt-2 text-xs bg-white p-2 rounded overflow-auto max-h-48">
                  {JSON.stringify(
                    Object.entries(bpmDebugInfo).slice(0, 10).reduce((acc, [id, data]) => {
                      const track = tracks.find(t => t.id === id)
                      acc[id] = {
                        trackName: track?.name || 'Unknown',
                        ...data,
                      }
                      return acc
                    }, {} as Record<string, any>),
                    null,
                    2
                  )}
                </pre>
              </details>
              <details className="mt-2">
                <summary className="cursor-pointer font-semibold">URLs Tried for All Searches</summary>
                <div className="mt-2 text-xs bg-white p-2 rounded overflow-auto max-h-48">
                  {Object.entries(bpmDebugInfo)
                    .filter(([id, data]: [string, any]) => 
                      data?.urlsTried && data.urlsTried.length > 0
                    )
                    .slice(0, 10)
                    .map(([id, data]: [string, any]) => {
                      const track = tracks.find(t => t.id === id)
                      return (
                        <div key={id} className="mb-3 pb-3 border-b border-gray-200 last:border-0">
                          <p className="font-semibold mb-1">{track?.name || 'Unknown'}</p>
                          {data.bpm != null ? (
                            <p className="text-green-600 mb-1">✓ BPM: {Math.round(data.bpm)}</p>
                          ) : (
                            <p className="text-red-600 mb-1">✗ Error: {data.error || 'No preview found'}</p>
                          )}
                          <p className="font-semibold mb-1">URLs tried ({data.urlsTried.length}):</p>
                          <ul className="list-disc list-inside space-y-1 text-gray-700">
                            {data.urlsTried.map((url: string, idx: number) => (
                              <li key={idx} className={`break-all ${url === data.successfulUrl ? 'text-green-600 font-semibold' : ''}`}>
                                {url === data.successfulUrl ? '✓ ' : ''}{url}
                              </li>
                            ))}
                          </ul>
                          {data.successfulUrl && (
                            <p className="mt-1 text-green-600 text-xs">Successful URL: {data.successfulUrl}</p>
                          )}
                        </div>
                      )
                    })}
                  {Object.entries(bpmDebugInfo).filter(([id, data]: [string, any]) => 
                    data?.urlsTried && data.urlsTried.length > 0
                  ).length === 0 && (
                    <p className="text-gray-500">No searches with URLs tracked yet.</p>
                  )}
                </div>
              </details>
              <details className="mt-2">
                <summary className="cursor-pointer font-semibold">All BPM States</summary>
                <pre className="mt-2 text-xs bg-white p-2 rounded overflow-auto max-h-48">
                  {JSON.stringify(
                    tracks.slice(0, 10).map(t => ({
                      id: t.id,
                      name: t.name,
                      bpm: trackBpms[t.id],
                      loading: loadingBpms.has(t.id),
                      debug: bpmDebugInfo[t.id],
                    })),
                    null,
                    2
                  )}
                </pre>
              </details>
            </div>
          </div>
        )}

        
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

        {/* BPM Processing Progress Indicator - Always visible */}
        {(() => {
          const totalTracks = tracks.length
          if (totalTracks === 0) return null

          const tracksWithBpm = tracks.filter(t => trackBpms[t.id] != null && trackBpms[t.id] !== undefined).length
          const tracksWithNa = tracks.filter(t => trackBpms[t.id] === null).length
          const tracksLoading = loadingBpms.size
          const tracksDone = tracks.filter(t => 
            trackBpms[t.id] !== undefined && !loadingBpms.has(t.id)
          ).length
          const tracksRemaining = totalTracks - tracksDone
          const isProcessing = tracksLoading > 0 || tracksRemaining > 0

          // Always show the indicator - never hide it
          if (isProcessing) {
            return (
              <div className="mb-4 sm:mb-6 text-sm text-gray-600">
                BPM information processing ongoing ({tracksDone} tracks done, {tracksRemaining} remaining){' '}
                <button
                  onClick={() => setShowBpmMoreInfo(true)}
                  className="text-blue-600 hover:text-blue-700 hover:underline"
                >
                  (more info)
                </button>
              </div>
            )
          }

          // Show completion status
          if (tracksWithNa > 0) {
            return (
              <div className="mb-4 sm:mb-6 text-sm text-gray-600">
                {tracksWithNa} of {totalTracks} tracks have no BPM information available. You can retry by clicking on the N/A value.{' '}
                <button
                  onClick={() => setShowBpmMoreInfo(true)}
                  className="text-blue-600 hover:text-blue-700 hover:underline"
                >
                  (more info)
                </button>
              </div>
            )
          }

          // All tracks have BPM
          return (
            <div className="mb-4 sm:mb-6 text-sm text-gray-600">
              All {totalTracks} tracks have BPM information available.{' '}
              <button
                onClick={() => setShowBpmMoreInfo(true)}
                className="text-blue-600 hover:text-blue-700 hover:underline"
              >
                (more info)
              </button>
            </div>
          )
        })()}
        
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
              <div className="mt-3 sm:mt-4 p-5 sm:p-6 bg-gray-100 rounded-lg border border-gray-200">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-4xl">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Year Range
                    </label>
                    <div className="flex gap-3 items-center">
                      <input
                        type="number"
                        placeholder="From"
                        value={yearFrom}
                        onChange={(e) => setYearFrom(e.target.value)}
                        className="w-24 px-3 py-2 bg-white border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      <span className="text-gray-500 text-sm whitespace-nowrap">to</span>
                      <input
                        type="number"
                        placeholder="To"
                        value={yearTo}
                        onChange={(e) => setYearTo(e.target.value)}
                        className="w-24 px-3 py-2 bg-white border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      BPM Range
                    </label>
                    <div className="flex gap-3 items-center mb-3">
                      <input
                        type="number"
                        placeholder="From"
                        value={bpmFrom}
                        onChange={(e) => setBpmFrom(e.target.value)}
                        className="w-24 px-3 py-2 bg-white border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      <span className="text-gray-500 text-sm whitespace-nowrap">to</span>
                      <input
                        type="number"
                        placeholder="To"
                        value={bpmTo}
                        onChange={(e) => setBpmTo(e.target.value)}
                        className="w-24 px-3 py-2 bg-white border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={includeHalfDoubleBpm}
                        onChange={(e) => setIncludeHalfDoubleBpm(e.target.checked)}
                        className="mr-2 w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                      />
                      <span className="text-sm text-gray-700">
                        Include tracks with half/double BPM
                      </span>
                    </label>
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
                      setIncludeHalfDoubleBpm(false)
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
          {sortedTracks.map((track, index) => (
            <div
              key={track.id}
              className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => handleTrackClick(track)}
            >
              <div className="flex gap-3">
                <div className="text-gray-500 text-sm font-medium w-6 flex-shrink-0 pt-1">
                  {index + 1}
                </div>
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
                            href="#"
                            className="font-medium text-gray-900 text-sm truncate hover:text-green-600 hover:underline block"
                            onClick={(e) => handleTrackTitleClick(e, track)}
                            title="Open in Spotify app"
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
                                    {loadingBpms.has(track.id) ? (
                                      <span className="text-gray-400"> • BPM...</span>
                                    ) : trackBpms[track.id] != null 
                                      ? (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setSelectedBpmTrack(track)
                                            setRetryStatus(null)
                                            setShowBpmModal(true)
                                          }}
                                          className="text-blue-600 hover:text-blue-700 hover:underline"
                                        >
                                          {` • ${Math.round(trackBpms[track.id]!)} BPM`}
                                        </button>
                                      )
                                      : track.tempo != null 
                                        ? ` • ${Math.round(track.tempo)} BPM`
                                        : (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                setSelectedBpmTrack(track)
                                                setShowBpmModal(true)
                                              }}
                                              className="text-red-500 hover:text-red-600 hover:underline"
                                            >
                                              {' • BPM N/A'}
                                            </button>
                                          )}
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
                  <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 w-12">
                    #
                  </th>
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
                    <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                      {(searchQuery || yearFrom || yearTo || bpmFrom || bpmTo) ? 'No tracks match your filters' : 'No tracks found'}
                    </td>
                  </tr>
                ) : (
                  sortedTracks.map((track, index) => (
                    <tr 
                      key={track.id} 
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => handleTrackClick(track)}
                    >
                      <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-500 text-xs sm:text-sm">
                        {index + 1}
                      </td>
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
                            href="#"
                            className="font-medium text-gray-900 text-xs sm:text-sm hover:text-green-600 hover:underline"
                            onClick={(e) => handleTrackTitleClick(e, track)}
                            title="Open in Spotify app"
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
                                  <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-600 text-xs sm:text-sm hidden md:table-cell" onClick={(e) => e.stopPropagation()}>
                                    {loadingBpms.has(track.id) ? (
                                      <div className="flex items-center gap-1">
                                        <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span className="text-gray-400">...</span>
                                      </div>
                                    ) : trackBpms[track.id] != null 
                                      ? (
                                        <button
                                          onClick={() => {
                                            setSelectedBpmTrack(track)
                                            setRetryStatus(null)
                                            setRetryAttempted(false)
                                            setShowBpmModal(true)
                                          }}
                                          className="text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                                          title="Click for BPM details"
                                        >
                                          {Math.round(trackBpms[track.id]!)}
                                        </button>
                                      )
                                      : track.tempo != null 
                                        ? Math.round(track.tempo)
                                        : (
                                            <button
                                              onClick={() => {
                                                setSelectedBpmTrack(track)
                                                setRetryStatus(null)
                                                setRetryAttempted(false)
                                                setShowBpmModal(true)
                                              }}
                                              className="text-red-500 hover:text-red-600 hover:underline cursor-pointer"
                                              title="Click to see why BPM is not available"
                                            >
                                              N/A
                                            </button>
                                          )}
                                  </td>
                      <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-600 text-xs sm:text-sm text-right hidden lg:table-cell">
                        {track.popularity != null ? track.popularity : (
                          <span className="text-gray-400">N/A</span>
                        )}
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

      {/* BPM More Info Modal */}
      {showBpmMoreInfo && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowBpmMoreInfo(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">BPM Processing Information</h2>
              <button
                onClick={() => setShowBpmMoreInfo(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4 text-sm text-gray-700">
              <p>
                BPM calculation requires preview audio from iTunes, Deezer, or other sources. 
                This process happens automatically the first time you open a playlist.
              </p>
              
              <div>
                <p className="font-semibold mb-2">Country used for search:</p>
                <select
                  value={countryCode}
                  onChange={(e) => {
                    setCountryCode(e.target.value)
                    // Reload page to apply new country
                    window.location.reload()
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="us">United States (US)</option>
                  <option value="gb">United Kingdom (GB)</option>
                  <option value="it">Italy (IT)</option>
                  <option value="fr">France (FR)</option>
                  <option value="de">Germany (DE)</option>
                  <option value="es">Spain (ES)</option>
                  <option value="jp">Japan (JP)</option>
                  <option value="ca">Canada (CA)</option>
                  <option value="au">Australia (AU)</option>
                  <option value="br">Brazil (BR)</option>
                  <option value="mx">Mexico (MX)</option>
                  <option value="nl">Netherlands (NL)</option>
                  <option value="se">Sweden (SE)</option>
                  <option value="no">Norway (NO)</option>
                  <option value="dk">Denmark (DK)</option>
                  <option value="fi">Finland (FI)</option>
                  <option value="pl">Poland (PL)</option>
                  <option value="pt">Portugal (PT)</option>
                  <option value="ch">Switzerland (CH)</option>
                  <option value="at">Austria (AT)</option>
                  <option value="be">Belgium (BE)</option>
                  <option value="ie">Ireland (IE)</option>
                  <option value="nz">New Zealand (NZ)</option>
                </select>
                <p className="mt-2 text-xs text-gray-500">
                  Changing the country will reload the page and search stores in the selected country.
                </p>
              </div>

              <p className="text-xs text-gray-500">
                Some tracks may not have preview audio available in the selected country, which is why they show as N/A. 
                You can retry by clicking on the N/A value, or try selecting a different country.
              </p>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowBpmMoreInfo(false)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BPM Details Modal */}
      {showBpmModal && selectedBpmTrack && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowBpmModal(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">BPM Information</h2>
              <button
                onClick={() => setShowBpmModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="mb-4">
              <h3 className="font-semibold text-gray-900 mb-2">{selectedBpmTrack.name}</h3>
              <p className="text-sm text-gray-600">
                {selectedBpmTrack.artists.map(a => a.name).join(', ')}
              </p>
            </div>

            <div className="space-y-3">
              {trackBpms[selectedBpmTrack.id] != null ? (
                <>
                  <div>
                    <span className="font-semibold text-gray-700">BPM: </span>
                    <span className="text-gray-900">{Math.round(trackBpms[selectedBpmTrack.id]!)}</span>
                  </div>
                  {bpmDetails[selectedBpmTrack.id]?.source && (
                    <div>
                      <span className="font-semibold text-gray-700">Source: </span>
                      <span className="text-gray-900 capitalize">
                        {bpmDetails[selectedBpmTrack.id].source?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  )}
                  {bpmDetails[selectedBpmTrack.id]?.upc && (
                    <div>
                      <span className="font-semibold text-gray-700">UPC: </span>
                      <span className="text-gray-900 font-mono text-sm">
                        {bpmDetails[selectedBpmTrack.id].upc}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <span className="font-semibold text-gray-700">BPM: </span>
                    <span className="text-gray-600">Not available</span>
                  </div>
                  {bpmDetails[selectedBpmTrack.id]?.error ? (
                    <div>
                      <span className="font-semibold text-gray-700">Reason: </span>
                      <span className="text-gray-600">{bpmDetails[selectedBpmTrack.id].error}</span>
                    </div>
                  ) : bpmDetails[selectedBpmTrack.id]?.source === 'computed_failed' ? (
                    <div>
                      <span className="text-gray-600 text-sm">
                        BPM calculation failed. {bpmDetails[selectedBpmTrack.id]?.error || 'No preview audio available for this track.'}
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-gray-600 text-sm">
                        BPM data is being calculated or no preview audio is available for this track.
                      </span>
                    </div>
                  )}
                  {bpmDetails[selectedBpmTrack.id]?.source && bpmDetails[selectedBpmTrack.id].source !== 'computed_failed' && (
                    <div>
                      <span className="font-semibold text-gray-700">Last attempt source: </span>
                      <span className="text-gray-900 capitalize">
                        {bpmDetails[selectedBpmTrack.id].source?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Retry Status Message */}
            {retryStatus && (
              <div className={`mt-4 p-3 rounded text-sm ${
                retryStatus.loading 
                  ? 'bg-blue-50 text-blue-700' 
                  : retryStatus.success 
                    ? 'bg-green-50 text-green-700' 
                    : 'bg-red-50 text-red-700'
              }`}>
                {retryStatus.loading && 'Retrying...'}
                {!retryStatus.loading && retryStatus.success && 'BPM successfully calculated!'}
                {!retryStatus.loading && !retryStatus.success && retryStatus.error && `Error: ${retryStatus.error}`}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              {trackBpms[selectedBpmTrack.id] == null && !retryAttempted && (
                <button
                  onClick={async () => {
                    // Retry fetching BPM for this track
                    setRetryStatus({ loading: true })
                    setRetryAttempted(true)
                    setLoadingBpms(prev => new Set(prev).add(selectedBpmTrack.id))
                    try {
                      const res = await fetch(`/api/bpm?spotifyTrackId=${selectedBpmTrack.id}&country=${countryCode}`)
                      if (res.ok) {
                        const data = await res.json()
                        if (data.bpm != null) {
                          setTrackBpms(prev => ({
                            ...prev,
                            [selectedBpmTrack.id]: data.bpm,
                          }))
                          setBpmDetails(prev => ({
                            ...prev,
                            [selectedBpmTrack.id]: {
                              source: data.source,
                              error: data.error,
                              isrc: data.isrc,
                            },
                          }))
                          setRetryStatus({ loading: false, success: true })
                        } else {
                          // Use error from API, or generate descriptive message from source
                          let errorMessage = data.error
                          if (!errorMessage) {
                            // Generate descriptive message based on source
                            if (data.source === 'computed_failed') {
                              errorMessage = 'No preview audio available from any source (iTunes, Deezer)'
                            } else if (data.source === 'itunes_upc' || data.source === 'itunes_search') {
                              errorMessage = 'No preview available on iTunes/Apple Music'
                            } else if (data.source === 'deezer') {
                              errorMessage = 'No preview available on Deezer'
                            } else {
                              errorMessage = 'BPM calculation failed. No preview audio available.'
                            }
                          }
                          setBpmDetails(prev => ({
                            ...prev,
                            [selectedBpmTrack.id]: {
                              source: data.source,
                              error: errorMessage,
                              isrc: data.isrc,
                            },
                          }))
                          setRetryStatus({ loading: false, success: false, error: errorMessage })
                        }
                      } else {
                        const errorData = await res.json().catch(() => ({}))
                        const errorMessage = errorData.error || 'Failed to fetch BPM'
                        setBpmDetails(prev => ({
                          ...prev,
                          [selectedBpmTrack.id]: {
                            error: errorMessage,
                          },
                        }))
                        setRetryStatus({ loading: false, success: false, error: errorMessage })
                      }
                    } catch (error) {
                      console.error(`[BPM Client] Error retrying BPM for ${selectedBpmTrack.id}:`, error)
                      const errorMessage = 'Network error. Please try again.'
                      setBpmDetails(prev => ({
                        ...prev,
                        [selectedBpmTrack.id]: {
                          error: errorMessage,
                        },
                      }))
                      setRetryStatus({ loading: false, success: false, error: errorMessage })
                    } finally {
                      setLoadingBpms(prev => {
                        const next = new Set(prev)
                        next.delete(selectedBpmTrack.id)
                        return next
                      })
                    }
                  }}
                  disabled={retryStatus?.loading}
                  className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded transition-colors"
                >
                  {retryStatus?.loading ? 'Retrying...' : 'Retry'}
                </button>
              )}
              <button
                onClick={() => {
                  setShowBpmModal(false)
                  setRetryStatus(null)
                  setRetryAttempted(false)
                }}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
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

