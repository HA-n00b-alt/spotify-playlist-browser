'use client'

import { useEffect, useState, useRef } from 'react'
import type { MouseEvent } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import PageHeader from '../../components/PageHeader'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { TrackTableSkeleton, SkeletonLoader } from '../../components/SkeletonLoader'
import { usePlaylist, useRefreshPlaylist } from '../../hooks/usePlaylist'
import { usePlaylistTracks, useRefreshPlaylistTracks } from '../../hooks/usePlaylistTracks'
import { useQueryClient } from '@tanstack/react-query'
import type { 
  SpotifyTrack, 
  SpotifyPlaylistInfo, 
  SortField, 
  SortDirection,
  BpmResult,
  BpmDetails
} from '@/lib/types'
import { 
  AuthenticationError, 
  RateLimitError, 
  NetworkError,
  SpotifyAPIError 
} from '@/lib/errors'

// Use shared types
type Track = SpotifyTrack
type PlaylistInfo = SpotifyPlaylistInfo

interface PlaylistTracksPageProps {
  params: {
    id: string
  }
}

export default function PlaylistTracksPage({ params }: PlaylistTracksPageProps) {
  // Use React Query for playlist and tracks data
  const { 
    data: playlistInfo, 
    isLoading: isLoadingPlaylist, 
    error: playlistError 
  } = usePlaylist(params.id)
  
  const { 
    data: tracks = [], 
    isLoading: isLoadingTracks, 
    error: tracksError 
  } = usePlaylistTracks(params.id)
  
  const refreshPlaylist = useRefreshPlaylist(params.id)
  const refreshTracks = useRefreshPlaylistTracks(params.id)
  const queryClient = useQueryClient()
  
  const loading = isLoadingPlaylist || isLoadingTracks
  const error = playlistError?.message || tracksError?.message || null
  const [trackBpms, setTrackBpms] = useState<Record<string, number | null>>({})
  const [trackKeys, setTrackKeys] = useState<Record<string, string | null>>({})
  const [trackScales, setTrackScales] = useState<Record<string, string | null>>({})
  const [loadingBpms, setLoadingBpms] = useState<Set<string>>(new Set())
  const [showBpmDebug, setShowBpmDebug] = useState(false)
  const [bpmDebugInfo, setBpmDebugInfo] = useState<Record<string, any>>({})
  const [bpmDetails, setBpmDetails] = useState<Record<string, { source?: string; error?: string }>>({})
  const [previewUrls, setPreviewUrls] = useState<Record<string, string | null>>({}) // Store successful preview URLs from DB
  // Store all BPM data (Essentia + Librosa) for modal
  const [bpmFullData, setBpmFullData] = useState<Record<string, {
    bpmEssentia?: number | null
    bpmRawEssentia?: number | null
    bpmConfidenceEssentia?: number | null
    bpmLibrosa?: number | null
    bpmRawLibrosa?: number | null
    bpmConfidenceLibrosa?: number | null
    keyEssentia?: string | null
    scaleEssentia?: string | null
    keyscaleConfidenceEssentia?: number | null
    keyLibrosa?: string | null
    scaleLibrosa?: string | null
    keyscaleConfidenceLibrosa?: number | null
    bpmSelected?: 'essentia' | 'librosa' | 'manual'
    keySelected?: 'essentia' | 'librosa' | 'manual'
    bpmManual?: number | null
    keyManual?: string | null
    scaleManual?: string | null
    debugTxt?: string | null
  }>>({})
  const [showBpmModal, setShowBpmModal] = useState(false)
  const [selectedBpmTrack, setSelectedBpmTrack] = useState<Track | null>(null)
  const [bpmProcessingStartTime, setBpmProcessingStartTime] = useState<number | null>(null)
  const [bpmProcessingEndTime, setBpmProcessingEndTime] = useState<number | null>(null)
  const [bpmTracksCalculated, setBpmTracksCalculated] = useState<number>(0) // Track how many were actually calculated (not cached)
  const [retryStatus, setRetryStatus] = useState<{ loading: boolean; success?: boolean; error?: string } | null>(null)
  const [retryAttempted, setRetryAttempted] = useState(false)
  // State for manual override in modal
  const [manualBpm, setManualBpm] = useState<string>('')
  const [manualKey, setManualKey] = useState<string>('')
  const [manualScale, setManualScale] = useState<string>('major')
  const [isUpdatingSelection, setIsUpdatingSelection] = useState(false)
  const [showBpmMoreInfo, setShowBpmMoreInfo] = useState(false)
  const [countryCode, setCountryCode] = useState<string>('us')
  const [tracksInDb, setTracksInDb] = useState<Set<string>>(new Set()) // Track IDs that are already in the DB
  const [recalculating, setRecalculating] = useState(false)
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
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const authErrorHandledRef = useRef(false) // Prevent infinite loops on auth errors
  const audioCache = useRef<Map<string, string>>(new Map()) // Cache audio blobs by URL
  
  // Get cache info from React Query data
  const isCached = playlistInfo?.is_cached ?? false
  const cachedAt = playlistInfo?.cached_at ?? null
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showCacheModal, setShowCacheModal] = useState(false)
  const [refreshDone, setRefreshDone] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    spotifyUrl: string
    spotifyUri: string
  } | null>(null)

  // Cleanup audio on unmount and clear cache on page unload
  useEffect(() => {
    // Capture audioRef and audioCache at effect time for cleanup
    const audioElement = audioRef.current
    const cache = audioCache.current
    
    const handleBeforeUnload = () => {
      // Clear all blob URLs from cache
      const currentCache = audioCache.current
      currentCache.forEach((blobUrl) => {
        if (blobUrl.startsWith('blob:')) {
          URL.revokeObjectURL(blobUrl)
        }
      })
      currentCache.clear()
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      if (audioElement) {
        audioElement.pause()
        audioRef.current = null
      }
      // Cleanup blob URLs - use captured cache reference
      cache.forEach((blobUrl) => {
        if (blobUrl.startsWith('blob:')) {
          URL.revokeObjectURL(blobUrl)
        }
      })
      cache.clear()
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])
  
  // Close context menu on click outside or escape key
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
      // Prevent default browser context menu
      const handleContextMenu = (e: Event) => e.preventDefault()
      document.addEventListener('contextmenu', handleContextMenu)
      
      return () => {
        document.removeEventListener('click', handleClickOutside)
        document.removeEventListener('keydown', handleEscape)
        document.removeEventListener('contextmenu', handleContextMenu)
      }
    }
  }, [contextMenu])

  // Reset auth error ref when playlist ID changes (user navigates to different playlist)
  useEffect(() => {
    authErrorHandledRef.current = false
    // Clear React Query cache for this playlist to force fresh fetch
    queryClient.removeQueries({ queryKey: ['playlist', params.id] })
    queryClient.removeQueries({ queryKey: ['playlistTracks', params.id] })
  }, [params.id, queryClient])

  // Handle auth errors and redirect
  useEffect(() => {
    if (authErrorHandledRef.current) {
      return
    }

    if (error && (error.includes('Unauthorized') || error.includes('No access token') || error.includes('Please log in'))) {
      authErrorHandledRef.current = true
      // Clear React Query cache to prevent stale errors
      queryClient.clear()
      // Redirect to login
      setTimeout(() => {
        window.location.href = '/api/auth/login'
      }, 1000)
    }
  }, [error, queryClient])

  // Check admin status
  useEffect(() => {
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

    checkAdmin()
  }, [])
  
  // Function to refresh playlist data
  const handleRefresh = async () => {
    setIsRefreshing(true)
    setRefreshDone(false)
    try {
      // Refresh both playlist and tracks using React Query
      await Promise.all([
        refreshPlaylist(),
        refreshTracks(),
      ])
    } catch (e) {
      console.error('Error refreshing data:', e)
    } finally {
      setIsRefreshing(false)
      setRefreshDone(true)
    }
  }
  
  const handleDone = () => {
    setShowCacheModal(false)
    setRefreshDone(false)
  }

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
        // Track which tracks are in DB: if spotify_track_id exists in DB, the result will have source/error/bpmRaw fields
        // If track is NOT in DB, result will be { bpm: null, cached: false } with no other fields
        const inDbSet = new Set<string>()
        for (const [trackId, result] of Object.entries(data.results || {})) {
          const r = result as any
          // Track is in DB if spotify_track_id exists in track_bpm_cache table
          // This is indicated by presence of source, error, bpmRaw, or cached === true
          if (r && (r.source !== undefined || r.error !== undefined || r.bpmRaw !== undefined || r.cached === true)) {
            inDbSet.add(trackId)
          }
        }
        setTracksInDb(inDbSet)
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

  // Update tracks in DB when batch results come in
  useEffect(() => {
    // This will be updated when fetchBpmsBatch completes
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
        const newKeys: Record<string, string | null> = {}
        const newScales: Record<string, string | null> = {}
        const newDetails: Record<string, { source?: string; error?: string }> = {}
        const newPreviewUrls: Record<string, string | null> = {}

        for (const [trackId, result] of Object.entries(data.results || {})) {
          const r = result as any
          newBpms[trackId] = r.bpm
          // Store key and scale if available (these are already the selected values from API)
          if (r.key !== undefined) {
            newKeys[trackId] = r.key || null
          }
          if (r.scale !== undefined) {
            newScales[trackId] = r.scale || null
          }
          // Store full BPM data for modal
          if (r.bpmEssentia !== undefined || r.bpmLibrosa !== undefined || r.bpmSelected) {
            setBpmFullData(prev => ({
              ...prev,
              [trackId]: {
                bpmEssentia: r.bpmEssentia,
                bpmRawEssentia: r.bpmRawEssentia,
                bpmConfidenceEssentia: r.bpmConfidenceEssentia,
                bpmLibrosa: r.bpmLibrosa,
                bpmRawLibrosa: r.bpmRawLibrosa,
                bpmConfidenceLibrosa: r.bpmConfidenceLibrosa,
                keyEssentia: r.keyEssentia,
                scaleEssentia: r.scaleEssentia,
                keyscaleConfidenceEssentia: r.keyscaleConfidenceEssentia,
                keyLibrosa: r.keyLibrosa,
                scaleLibrosa: r.scaleLibrosa,
                keyscaleConfidenceLibrosa: r.keyscaleConfidenceLibrosa,
                bpmSelected: r.bpmSelected || 'essentia',
                keySelected: r.keySelected || 'essentia',
                bpmManual: r.bpmManual,
                keyManual: r.keyManual,
                scaleManual: r.scaleManual,
                debugTxt: r.debugTxt,
              },
            }))
          }
          // Store successful preview URL from DB
          // For Deezer, prefer a URL from urlsTried if available (might be more recent/valid)
          if (r.successfulUrl) {
            // Check if it's a Deezer URL and if we have urlsTried with Deezer URLs
            const isDeezerSuccessful = r.successfulUrl && (
              r.successfulUrl.includes('deezer.com') || 
              r.successfulUrl.includes('cdn-preview') || 
              r.successfulUrl.includes('cdnt-preview')
            )
            
            if (isDeezerSuccessful && r.urlsTried && Array.isArray(r.urlsTried)) {
              // Find Deezer API search URLs in urlsTried
              const deezerApiUrls = r.urlsTried.filter((url: string) => 
                url.includes('api.deezer.com/search') || url.includes('api.deezer.com/album')
              )
              if (deezerApiUrls.length > 0) {
                // Store the API URL - we'll fetch it when needed to get the preview URL
                // For now, mark it so we know to fetch it later
                newPreviewUrls[trackId] = deezerApiUrls[deezerApiUrls.length - 1] // Store API URL temporarily
              } else {
                // Check for direct preview URLs
                const deezerPreviewUrls = r.urlsTried.filter((url: string) => {
                  const isDeezerUrl = url.includes('deezer.com') || url.includes('cdn-preview') || url.includes('cdnt-preview')
                  const isAudioFile = url.includes('.mp3') || url.includes('cdn-preview') || url.includes('cdnt-preview') || url.includes('/preview')
                  const isNotApiEndpoint = !url.includes('api.deezer.com/search') && !url.includes('api.deezer.com/album') && !url.includes('api.deezer.com/track')
                  return isDeezerUrl && isAudioFile && isNotApiEndpoint
                })
                if (deezerPreviewUrls.length > 0) {
                  newPreviewUrls[trackId] = deezerPreviewUrls[deezerPreviewUrls.length - 1]
                } else {
                  newPreviewUrls[trackId] = r.successfulUrl
                }
              }
            } else {
              newPreviewUrls[trackId] = r.successfulUrl
            }
          }
          // Always store details if available (source, error, urls)
          if (r.source || r.error || r.urlsTried || r.successfulUrl) {
            newDetails[trackId] = {
              source: r.source,
              error: r.error,
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
        setTrackKeys(prev => ({ ...prev, ...newKeys }))
        setTrackScales(prev => ({ ...prev, ...newScales }))
        setBpmDetails(newDetails)
        setPreviewUrls(prev => ({ ...prev, ...newPreviewUrls }))

        // Track which tracks are in DB: if spotify_track_id exists in track_bpm_cache table
        // The batch API returns results with source/error/bpmRaw for tracks in DB
        // Tracks NOT in DB return only { bpm: null, cached: false }
        const inDbSet = new Set<string>()
        for (const [trackId, result] of Object.entries(data.results || {})) {
          const r = result as any
          // Track is in DB if spotify_track_id exists in track_bpm_cache (indicated by source/error/bpmRaw/cached)
          if (r && (r.source !== undefined || r.error !== undefined || r.bpmRaw !== undefined || r.cached === true)) {
            inDbSet.add(trackId)
          }
        }
        setTracksInDb(prev => {
          const combined = new Set(prev)
          inDbSet.forEach(id => combined.add(id))
          return combined
        })

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
              // Store key and scale if available
              if (data.key !== undefined) {
                setTrackKeys(prev => ({
                  ...prev,
                  [track.id]: data.key || null,
                }))
              }
              if (data.scale !== undefined) {
                setTrackScales(prev => ({
                  ...prev,
                  [track.id]: data.scale || null,
                }))
              }
              // Store successful preview URL from DB
              if (data.successfulUrl) {
                setPreviewUrls(prev => ({
                  ...prev,
                  [track.id]: data.successfulUrl,
                }))
              }
              setBpmDetails(prev => ({
                ...prev,
                [track.id]: {
                  source: data.source,
                  error: data.error,
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
              // Mark track as in DB (now it has an entry, whether BPM or N/A)
              setTracksInDb(prev => new Set(prev).add(track.id))
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

  // Function to recalculate all BPM/key/scale for tracks in the playlist
  const handleRecalculateAll = async () => {
    if (!confirm('This will clear the cache and force recalculation of BPM/key/scale for all tracks in this playlist. Continue?')) {
      return
    }

    setRecalculating(true)
    try {
      // Pass track IDs directly to avoid Spotify API call (much faster)
      const trackIds = tracks.map(t => t.id)
      const res = await fetch('/api/bpm/recalculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          playlistId: params.id,
          trackIds: trackIds.length > 0 ? trackIds : undefined,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        // Clear local state to force refetch
        setTrackBpms({})
        setTrackKeys({})
        setTrackScales({})
        setTracksInDb(new Set())
        setBpmDebugInfo({})
        setBpmDetails({})
        // Trigger refetch of BPMs
        if (tracks.length > 0) {
          await fetchBpmsBatch()
        }
        alert(`Cache cleared for ${data.cleared} tracks. Recalculation started.`)
      } else {
        const errorData = await res.json().catch(() => ({}))
        alert(`Failed to recalculate: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('[BPM Client] Error recalculating:', error)
      alert('Failed to recalculate BPM/key/scale')
    } finally {
      setRecalculating(false)
    }
  }

  /**
   * Fetch preview URL from Deezer API (via our proxy to avoid CORS)
   */
  const fetchDeezerPreviewUrl = async (apiUrl: string): Promise<string | null> => {
    try {
      console.log('[Preview Debug] Fetching Deezer API via proxy to get preview URL:', apiUrl)
      const proxyUrl = `/api/deezer-preview?url=${encodeURIComponent(apiUrl)}`
      const response = await fetch(proxyUrl)
      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Preview Debug] Deezer API proxy fetch failed:', response.status, errorText)
        return null
      }
      const data = await response.json()
      console.log('[Preview Debug] Deezer API proxy response:', data)
      
      if (data.previewUrl) {
        console.log('[Preview Debug] Found Deezer preview URL:', data.previewUrl)
        return data.previewUrl
      }
      
      console.log('[Preview Debug] No preview URL found in Deezer API response')
      return null
    } catch (error) {
      console.error('[Preview Debug] Error fetching Deezer API:', error)
      return null
    }
  }
  
  /**
   * Load audio with CORS support and caching
   */
  const loadAudioWithCache = async (url: string): Promise<string> => {
    console.log('[Preview Debug] loadAudioWithCache called with URL:', url)
    
    const originalUrl = url // Keep original for cache key if it's an API URL
    
    // Check if it's a Deezer API URL - if so, fetch it to get the preview URL
    if (url.includes('api.deezer.com/search') || url.includes('api.deezer.com/album')) {
      // Check cache first using the API URL as key
      if (audioCache.current.has(originalUrl)) {
        const cachedUrl = audioCache.current.get(originalUrl)!
        console.log('[Preview Debug] Found cached preview URL from API:', cachedUrl)
        // If cached value is a blob URL, return it; otherwise it's the preview URL, fetch it
        if (cachedUrl.startsWith('blob:')) {
          return cachedUrl
        } else {
          url = cachedUrl // Use the cached preview URL
        }
      } else {
        // Fetch the preview URL from API
        const previewUrl = await fetchDeezerPreviewUrl(url)
        if (!previewUrl) {
          throw new Error('Failed to get preview URL from Deezer API')
        }
        // Cache the preview URL using the API URL as key
        audioCache.current.set(originalUrl, previewUrl)
        url = previewUrl
        console.log('[Preview Debug] Using preview URL from Deezer API:', url)
      }
    }
    
    // Check if it's a Deezer URL (needs CORS proxy)
    const isDeezer = url.includes('cdn-preview') || url.includes('deezer.com') || url.includes('e-cdn-preview') || url.includes('cdnt-preview')
    console.log('[Preview Debug] URL type check:', { url, isDeezer })
    
    // Check cache first (use the final preview URL as cache key)
    if (audioCache.current.has(url)) {
      const cachedUrl = audioCache.current.get(url)!
      console.log('[Preview Debug] Found cached URL:', cachedUrl)
      
      // If it's a Deezer URL, make sure we cached a blob URL, not the direct URL
      if (isDeezer && !cachedUrl.startsWith('blob:')) {
        console.log('[Preview Debug] Cached Deezer URL is not a blob, re-fetching through proxy')
        // Remove the invalid cache entry
        audioCache.current.delete(url)
        // Fall through to fetch via proxy
      } else {
        console.log('[Preview Debug] Using cached audio URL:', cachedUrl)
        return cachedUrl
      }
    }
    
    try {
      if (isDeezer) {
        // For Deezer, try direct fetch first (might work if CORS allows or URL is still valid)
        // If that fails, try proxy as fallback
        console.log('[Preview Debug] Trying direct Deezer URL first...')
        try {
          const directResponse = await fetch(url, {
            method: 'HEAD', // Just check if accessible
            mode: 'no-cors', // This won't throw on CORS errors, but we can't read the response
          })
          console.log('[Preview Debug] Direct fetch HEAD check completed')
          
          // Try full fetch - if CORS allows it, this will work
          const fullResponse = await fetch(url, {
            mode: 'cors',
            credentials: 'omit',
          })
          
          if (fullResponse.ok) {
            console.log('[Preview Debug] Direct Deezer URL works, using it')
            const blob = await fullResponse.blob()
            const blobUrl = URL.createObjectURL(blob)
            audioCache.current.set(url, blobUrl)
            return blobUrl
          } else {
            console.log('[Preview Debug] Direct fetch failed, trying proxy...')
            throw new Error('Direct fetch failed')
          }
        } catch (directError) {
          console.log('[Preview Debug] Direct fetch not possible, using proxy:', directError)
          // Fall back to proxy
          const proxyUrl = `/api/audio-proxy?url=${encodeURIComponent(url)}`
          console.log('[Preview Debug] Fetching Deezer audio via proxy:', proxyUrl)
          const response = await fetch(proxyUrl)
          console.log('[Preview Debug] Proxy response status:', response.status, response.ok)
          if (!response.ok) {
            const errorText = await response.text()
            console.error('[Preview Debug] Proxy fetch failed:', response.status, errorText)
            // If proxy also fails, try direct URL as last resort (might work in some browsers)
            console.log('[Preview Debug] Proxy failed, trying direct URL as last resort...')
            audioCache.current.set(url, url)
            return url
          }
          const blob = await response.blob()
          console.log('[Preview Debug] Blob created:', { size: blob.size, type: blob.type })
          const blobUrl = URL.createObjectURL(blob)
          console.log('[Preview Debug] Blob URL created:', blobUrl)
          audioCache.current.set(url, blobUrl)
          return blobUrl
        }
      } else {
        // For iTunes and other sources, use direct URL
        // Cache the URL itself
        console.log('[Preview Debug] Using direct URL (non-Deezer):', url)
        audioCache.current.set(url, url)
        return url
      }
    } catch (error) {
      console.error('[Preview Debug] Error loading audio:', error)
      // On error, don't cache for Deezer (it will fail again)
      // For non-Deezer, we can try direct URL
      if (!isDeezer) {
        console.log('[Preview Debug] Falling back to direct URL:', url)
        audioCache.current.set(url, url)
        return url
      } else {
        // For Deezer, the URL might be expired or blocked
        // Clear any cached entry and throw the error
        audioCache.current.delete(url)
        console.error('[Preview Debug] Deezer URL failed, cleared from cache. URL may be expired:', url)
        throw error
      }
    }
  }
  
  /**
   * Check if track has preview available
   */
  const hasPreview = (trackId: string): boolean => {
    const url = previewUrls[trackId]
    return url !== null && url !== undefined && url !== ''
  }
  
  /**
   * Get preview tooltip text
   */
  const getPreviewTooltip = (trackId: string): string => {
    if (loadingBpms.has(trackId)) {
      return 'Loading preview...'
    }
    if (hasPreview(trackId)) {
      return 'Click to play preview'
    }
    return 'Preview not available'
  }
  
  /**
   * Handle track row click - play preview if available from DB, otherwise trigger search
   * Only uses preview URLs from DB (iTunes/Deezer), never Spotify's preview_url
   */
  const handleTrackClick = async (track: Track, event?: MouseEvent) => {
    // If clicking on a link or button, don't handle the row click
    if (event?.target instanceof HTMLElement) {
      if (event.target.closest('a') || event.target.closest('button')) {
        return
      }
    }

    // Get preview URL from DB only
    let previewUrl = previewUrls[track.id] || null

    // If no preview URL available in DB, try to fetch from BPM API (which will search and update DB)
    if (!previewUrl && !loadingBpms.has(track.id)) {
      try {
        setLoadingBpms(prev => new Set(prev).add(track.id))
        const res = await fetch(`/api/bpm?spotifyTrackId=${track.id}&country=${countryCode}`)
        if (res.ok) {
          const data = await res.json()
          console.log('[Preview Debug] handleTrackClick - BPM API response successfulUrl:', data.successfulUrl)
          console.log('[Preview Debug] handleTrackClick - BPM API response urlsTried:', data.urlsTried)
          // Store the successful URL if found
          // For Deezer, prefer a URL from urlsTried if available
          if (data.successfulUrl) {
            const isDeezerSuccessful = data.successfulUrl && (
              data.successfulUrl.includes('deezer.com') || 
              data.successfulUrl.includes('cdn-preview') || 
              data.successfulUrl.includes('cdnt-preview')
            )
            
            if (isDeezerSuccessful && data.urlsTried && Array.isArray(data.urlsTried)) {
              // Find Deezer API search URLs in urlsTried
              const deezerApiUrls = data.urlsTried.filter((url: string) => 
                url.includes('api.deezer.com/search') || url.includes('api.deezer.com/album')
              )
              if (deezerApiUrls.length > 0) {
                // Use the API URL - we'll fetch it when loading audio to get the preview URL
                previewUrl = deezerApiUrls[deezerApiUrls.length - 1]
                console.log(`[Preview Debug] handleTrackClick - Using Deezer API URL from urlsTried (will fetch preview):`, previewUrl)
                setPreviewUrls(prev => ({
                  ...prev,
                  [track.id]: previewUrl,
                }))
              } else {
                // Check for direct preview URLs
                const deezerPreviewUrls = data.urlsTried.filter((url: string) => {
                  const isDeezerUrl = url.includes('deezer.com') || url.includes('cdn-preview') || url.includes('cdnt-preview')
                  const isAudioFile = url.includes('.mp3') || url.includes('cdn-preview') || url.includes('cdnt-preview') || url.includes('/preview')
                  const isNotApiEndpoint = !url.includes('api.deezer.com/search') && !url.includes('api.deezer.com/album') && !url.includes('api.deezer.com/track')
                  return isDeezerUrl && isAudioFile && isNotApiEndpoint
                })
                if (deezerPreviewUrls.length > 0) {
                  previewUrl = deezerPreviewUrls[deezerPreviewUrls.length - 1]
                  console.log(`[Preview Debug] handleTrackClick - Using Deezer preview URL from urlsTried:`, previewUrl)
                } else {
                  previewUrl = data.successfulUrl
                }
                setPreviewUrls(prev => ({
                  ...prev,
                  [track.id]: previewUrl,
                }))
              }
            } else {
              previewUrl = data.successfulUrl
              setPreviewUrls(prev => ({
                ...prev,
                [track.id]: data.successfulUrl,
              }))
            }
          }
        }
      } catch (error) {
        console.error('Error fetching preview URL:', error)
      } finally {
        setLoadingBpms(prev => {
          const next = new Set(prev)
          next.delete(track.id)
          return next
        })
      }
    }

    // If we have a preview URL from DB, play it
    if (previewUrl) {
      console.log('[Preview Debug] handleTrackClick - Playing preview for track:', track.name, 'URL:', previewUrl)
      
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }

      // If clicking the same track that's playing, stop it
      if (playingTrackId === track.id) {
        console.log('[Preview Debug] handleTrackClick - Stopping already playing track')
        setPlayingTrackId(null)
        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current.currentTime = 0
        }
        return
      }

      // Play the preview
      setPlayingTrackId(track.id)
      
      try {
        // Load audio with caching and CORS handling
        console.log('[Preview Debug] handleTrackClick - Loading audio with cache...')
        const audioUrl = await loadAudioWithCache(previewUrl)
        console.log('[Preview Debug] handleTrackClick - Audio URL loaded:', audioUrl)
        
        const audio = new Audio(audioUrl)
        audio.volume = 0.5
        audio.crossOrigin = 'anonymous' // Enable CORS for cross-origin audio
        audioRef.current = audio
        
        console.log('[Preview Debug] handleTrackClick - Audio element created, attempting to play...')
        audio.play().then(() => {
          console.log('[Preview Debug] handleTrackClick - Audio play() succeeded')
        }).catch((error) => {
          console.error('[Preview Debug] handleTrackClick - Error playing preview:', error)
          console.error('[Preview Debug] handleTrackClick - Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            audioUrl,
            previewUrl,
            trackName: track.name
          })
          setPlayingTrackId(null)
          audioRef.current = null
        })

        // When audio ends, reset playing state
        audio.addEventListener('ended', () => {
          console.log('[Preview Debug] handleTrackClick - Audio ended')
          setPlayingTrackId(null)
          audioRef.current = null
        })
        
        // Add error event listener for more details
        audio.addEventListener('error', (e) => {
          console.error('[Preview Debug] handleTrackClick - Audio error event:', {
            error: e,
            errorCode: audio.error?.code,
            errorMessage: audio.error?.message,
            networkState: audio.networkState,
            readyState: audio.readyState,
            src: audio.src,
            previewUrl,
            trackName: track.name
          })
        })
      } catch (error) {
        console.error('[Preview Debug] handleTrackClick - Error loading audio:', error)
        console.error('[Preview Debug] handleTrackClick - Error details:', {
          error,
          previewUrl,
          trackName: track.name
        })
        setPlayingTrackId(null)
      }
    } else {
      // No preview available from DB
      console.log('[Preview Debug] handleTrackClick - No preview URL available for track:', track.name)
    }
  }

  /**
   * Handle track title click - play preview (same as row click)
   */
  const handleTrackTitleClick = async (e: MouseEvent<HTMLAnchorElement>, track: Track) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Left click - play preview directly (bypass the link check in handleTrackClick)
    // Get preview URL from DB only
    let previewUrl = previewUrls[track.id] || null

    // If no preview URL available in DB, try to fetch from BPM API (which will search and update DB)
    if (!previewUrl && !loadingBpms.has(track.id)) {
      try {
        setLoadingBpms(prev => new Set(prev).add(track.id))
        const res = await fetch(`/api/bpm?spotifyTrackId=${track.id}&country=${countryCode}`)
        if (res.ok) {
          const data = await res.json()
          console.log('[Preview Debug] handleTrackTitleClick - BPM API response successfulUrl:', data.successfulUrl)
          console.log('[Preview Debug] handleTrackTitleClick - BPM API response urlsTried:', data.urlsTried)
          // Store the successful URL if found
          // For Deezer, prefer a URL from urlsTried if available
          if (data.successfulUrl) {
            const isDeezerSuccessful = data.successfulUrl && (
              data.successfulUrl.includes('deezer.com') || 
              data.successfulUrl.includes('cdn-preview') || 
              data.successfulUrl.includes('cdnt-preview')
            )
            
            if (isDeezerSuccessful && data.urlsTried && Array.isArray(data.urlsTried)) {
              // Find Deezer API search URLs in urlsTried
              const deezerApiUrls = data.urlsTried.filter((url: string) => 
                url.includes('api.deezer.com/search') || url.includes('api.deezer.com/album')
              )
              if (deezerApiUrls.length > 0) {
                // Use the API URL - we'll fetch it when loading audio to get the preview URL
                previewUrl = deezerApiUrls[deezerApiUrls.length - 1]
                console.log(`[Preview Debug] handleTrackTitleClick - Using Deezer API URL from urlsTried (will fetch preview):`, previewUrl)
                setPreviewUrls(prev => ({
                  ...prev,
                  [track.id]: previewUrl,
                }))
              } else {
                // Check for direct preview URLs
                const deezerPreviewUrls = data.urlsTried.filter((url: string) => {
                  const isDeezerUrl = url.includes('deezer.com') || url.includes('cdn-preview') || url.includes('cdnt-preview')
                  const isAudioFile = url.includes('.mp3') || url.includes('cdn-preview') || url.includes('cdnt-preview') || url.includes('/preview')
                  const isNotApiEndpoint = !url.includes('api.deezer.com/search') && !url.includes('api.deezer.com/album') && !url.includes('api.deezer.com/track')
                  return isDeezerUrl && isAudioFile && isNotApiEndpoint
                })
                if (deezerPreviewUrls.length > 0) {
                  previewUrl = deezerPreviewUrls[deezerPreviewUrls.length - 1]
                  console.log(`[Preview Debug] handleTrackTitleClick - Using Deezer preview URL from urlsTried:`, previewUrl)
                } else {
                  previewUrl = data.successfulUrl
                }
                setPreviewUrls(prev => ({
                  ...prev,
                  [track.id]: previewUrl,
                }))
              }
            } else {
              previewUrl = data.successfulUrl
              setPreviewUrls(prev => ({
                ...prev,
                [track.id]: data.successfulUrl,
              }))
            }
          }
        }
      } catch (error) {
        console.error('Error fetching preview URL:', error)
      } finally {
        setLoadingBpms(prev => {
          const next = new Set(prev)
          next.delete(track.id)
          return next
        })
      }
    }

    // If we have a preview URL from DB, play it
    if (previewUrl) {
      console.log('[Preview Debug] handleTrackTitleClick - Playing preview for track:', track.name, 'URL:', previewUrl)
      
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }

      // If clicking the same track that's playing, stop it
      if (playingTrackId === track.id) {
        console.log('[Preview Debug] handleTrackTitleClick - Stopping already playing track')
        setPlayingTrackId(null)
        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current.currentTime = 0
        }
        return
      }

      // Play the preview
      setPlayingTrackId(track.id)
      
      try {
        // Load audio with caching and CORS handling
        console.log('[Preview Debug] handleTrackTitleClick - Loading audio with cache...')
        const audioUrl = await loadAudioWithCache(previewUrl)
        console.log('[Preview Debug] handleTrackTitleClick - Audio URL loaded:', audioUrl)
        
        const audio = new Audio(audioUrl)
        audio.volume = 0.5
        audio.crossOrigin = 'anonymous' // Enable CORS for cross-origin audio
        audioRef.current = audio
        
        console.log('[Preview Debug] handleTrackTitleClick - Audio element created, attempting to play...')
        audio.play().then(() => {
          console.log('[Preview Debug] handleTrackTitleClick - Audio play() succeeded')
        }).catch((error) => {
          console.error('[Preview Debug] handleTrackTitleClick - Error playing preview:', error)
          console.error('[Preview Debug] handleTrackTitleClick - Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            audioUrl,
            previewUrl,
            trackName: track.name
          })
          setPlayingTrackId(null)
          audioRef.current = null
        })

        // When audio ends, reset playing state
        audio.addEventListener('ended', () => {
          console.log('[Preview Debug] handleTrackTitleClick - Audio ended')
          setPlayingTrackId(null)
          audioRef.current = null
        })
        
        // Add error event listener for more details
        audio.addEventListener('error', (e) => {
          console.error('[Preview Debug] handleTrackTitleClick - Audio error event:', {
            error: e,
            errorCode: audio.error?.code,
            errorMessage: audio.error?.message,
            networkState: audio.networkState,
            readyState: audio.readyState,
            src: audio.src,
            previewUrl,
            trackName: track.name
          })
          
          // If it's a Deezer URL that failed, clear it from previewUrls so we can try to refresh it
          if (previewUrl && (previewUrl.includes('deezer.com') || previewUrl.includes('cdn-preview') || previewUrl.includes('cdnt-preview'))) {
            console.log('[Preview Debug] Deezer preview failed, clearing from state to allow refresh')
            setPreviewUrls(prev => {
              const next = { ...prev }
              delete next[track.id]
              return next
            })
          }
        })
      } catch (error) {
        console.error('[Preview Debug] handleTrackTitleClick - Error loading audio:', error)
        console.error('[Preview Debug] handleTrackTitleClick - Error details:', {
          error,
          previewUrl,
          trackName: track.name
        })
        setPlayingTrackId(null)
      }
    } else {
      // No preview available from DB
      console.log('[Preview Debug] handleTrackTitleClick - No preview URL available for track:', track.name)
    }
  }
  
  /**
   * Handle track context menu (right-click)
   */
  const handleTrackContextMenu = (e: MouseEvent, track: Track) => {
    e.preventDefault()
    e.stopPropagation()
    if (track.external_urls?.spotify) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        spotifyUrl: track.external_urls.spotify,
        spotifyUri: `spotify:track:${track.id}`,
      })
    }
  }
  
  /**
   * Open Spotify app using URI scheme
   */
  const openSpotifyApp = (uri: string, webUrl: string) => {
    window.location.href = uri
    setTimeout(() => {
      window.open(webUrl, '_blank', 'noopener,noreferrer')
    }, 500)
  }
  
  /**
   * Handle artist click - open in Spotify app
   */
  const handleArtistClick = (e: MouseEvent<HTMLAnchorElement>, artist: { id?: string; external_urls?: { spotify: string } }) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Left click - open in Spotify app
    if (artist.external_urls?.spotify && artist.id) {
      openSpotifyApp(`spotify:artist:${artist.id}`, artist.external_urls.spotify)
    }
  }
  
  /**
   * Handle artist context menu (right-click)
   */
  const handleArtistContextMenu = (e: MouseEvent, artist: { id?: string; external_urls?: { spotify: string } }) => {
    e.preventDefault()
    e.stopPropagation()
    if (artist.external_urls?.spotify && artist.id) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        spotifyUrl: artist.external_urls.spotify,
        spotifyUri: `spotify:artist:${artist.id}`,
      })
    }
  }
  
  /**
   * Handle album click - open in Spotify app
   */
  const handleAlbumClick = (e: MouseEvent<HTMLAnchorElement>, album: { id?: string; external_urls?: { spotify: string } }) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Left click - open in Spotify app
    if (album.external_urls?.spotify && album.id) {
      openSpotifyApp(`spotify:album:${album.id}`, album.external_urls.spotify)
    }
  }
  
  /**
   * Handle album context menu (right-click)
   */
  const handleAlbumContextMenu = (e: MouseEvent, album: { id?: string; external_urls?: { spotify: string } }) => {
    e.preventDefault()
    e.stopPropagation()
    if (album.external_urls?.spotify && album.id) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        spotifyUrl: album.external_urls.spotify,
        spotifyUri: `spotify:album:${album.id}`,
      })
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
      <div className="min-h-screen flex flex-col bg-gray-50 p-4 sm:p-8">
        <div className="max-w-7xl mx-auto flex-1 w-full">
          <PageHeader
            subtitle="[user] playlists"
            backLink={{
              href: '/playlists',
              text: '← Back to Playlists'
            }}
          />
          <TrackTableSkeleton />
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

  if (error) {
    return (
      <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-gray-50">
        <div className="max-w-7xl mx-auto flex-1 w-full">
          <PageHeader
            subtitle="Search and sort your playlists with ease"
            backLink={{
              href: '/playlists',
              text: '← Back to Playlists'
            }}
            center
          />
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
        <PageHeader
          subtitle="[user] playlists"
          backLink={{
            href: '/playlists',
            text: '← Back to Playlists'
          }}
          rightButtons={
            isAdmin ? (
              <button
                onClick={() => setShowBpmDebug(!showBpmDebug)}
                className="text-xs sm:text-sm bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-1.5 px-3 sm:py-2 sm:px-4 rounded transition-colors"
              >
                {showBpmDebug ? 'Hide' : 'Show'} BPM Debug
              </button>
            ) : undefined
          }
        />
        
        {/* Show auth error with manual login option */}
        {error && (error.includes('Unauthorized') || error.includes('No access token') || error.includes('Please log in')) && (
          <div className="mb-6 p-6 bg-red-50 border-2 border-red-300 rounded-lg">
            <h2 className="text-xl font-bold text-red-800 mb-2">Authentication Required</h2>
            <p className="text-red-700 mb-4">{error}</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href="/api/auth/login"
                className="inline-block bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-6 rounded transition-colors text-center"
              >
                Login with Spotify
              </a>
              <button
                onClick={() => {
                  // Clear React Query cache and reset error state
                  queryClient.clear()
                  authErrorHandledRef.current = false
                  // Force refetch
                  queryClient.invalidateQueries({ queryKey: ['playlist', params.id] })
                  queryClient.invalidateQueries({ queryKey: ['playlistTracks', params.id] })
                }}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-6 rounded transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Show other errors */}
        {error && !error.includes('Unauthorized') && !error.includes('No access token') && !error.includes('Please log in') && (
          <div className="mb-6 p-4 bg-red-50 border border-red-300 rounded-lg">
            <p className="text-red-700">Error: {error}</p>
          </div>
        )}

        {showBpmDebug && (
          <div className="mb-6 p-4 bg-gray-100 rounded-lg border border-gray-300 overflow-auto max-h-96 text-xs sm:text-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-base sm:text-lg">BPM Debug Information</h3>
              <button
                onClick={handleRecalculateAll}
                disabled={recalculating}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-semibold py-1.5 px-4 rounded text-xs sm:text-sm transition-colors"
              >
                {recalculating ? 'Recalculating...' : 'Recalculate All BPM/Key/Scale'}
              </button>
            </div>
            <div className="space-y-2">
              {(() => {
                const totalTracks = tracks.length
                const songsInDb = tracks.filter(t => tracksInDb.has(t.id)).length
                const tracksToSearch = totalTracks - songsInDb
                return (
                  <div className="mb-3 pb-3 border-b border-gray-300">
                    <p><strong>Playlist:</strong> {totalTracks} songs</p>
                    <p><strong>In DB:</strong> {songsInDb} songs (with BPM or N/A)</p>
                    <p><strong>To search:</strong> {tracksToSearch} songs</p>
                  </div>
                )
              })()}
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

          // Calculate songs already in DB (tracks that have spotify_track_id in database)
          const songsInDb = tracks.filter(t => tracksInDb.has(t.id)).length
          
          // Tracks to search = total - tracks in DB
          const tracksToSearch = totalTracks - songsInDb
          
          // Tracks currently being processed (loading)
          const tracksLoading = loadingBpms.size
          
          // Tracks that were NOT in DB but have been processed in this session (have a result, not loading)
          // X = number of tracks from "to search" that have been processed
          const tracksProcessedFromSearch = tracks.filter(t => 
            !tracksInDb.has(t.id) && trackBpms[t.id] !== undefined && !loadingBpms.has(t.id)
          ).length
          
          // Remaining = total to search - processed (only subtract completed ones, not loading ones)
          // This starts at tracksToSearch and counts down to 0 as tracks are completed
          const tracksRemainingToSearch = Math.max(0, tracksToSearch - tracksProcessedFromSearch)
          
          // Tracks with BPM value (not null)
          const tracksWithBpm = tracks.filter(t => trackBpms[t.id] != null && trackBpms[t.id] !== undefined).length
          
          // Tracks with N/A (null BPM)
          const tracksWithNa = tracks.filter(t => trackBpms[t.id] === null).length
          
          // Check if processing is ongoing
          const isProcessing = tracksLoading > 0 || tracksRemainingToSearch > 0
          // Check if we've started processing (have processed at least one track or are currently loading)
          const hasStartedProcessing = tracksProcessedFromSearch > 0 || tracksLoading > 0
          // Show progress if we have tracks to search (even if processing hasn't started yet, show 0 of X)
          const shouldShowProgress = tracksToSearch > 0 && (isProcessing || hasStartedProcessing || bpmProcessingStartTime !== null)

          // Always show the indicator - never hide it
          return (
            <div className="mb-4 sm:mb-6 text-sm text-gray-600 space-y-1">
              {shouldShowProgress ? (
                <div>
                  BPM information processing ongoing ({tracksToSearch} remaining){' '}
                  <button
                    onClick={() => setShowBpmMoreInfo(true)}
                    className="text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    (more info)
                  </button>
                </div>
              ) : tracksWithNa > 0 ? (
                <div>
                  {tracksWithNa} of {totalTracks} tracks have no BPM information available. You can retry by clicking on the N/A value.{' '}
                  <button
                    onClick={() => setShowBpmMoreInfo(true)}
                    className="text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    (more info)
                  </button>
                </div>
              ) : (
                <div>
                  All {totalTracks} tracks have BPM information available.{' '}
                  <button
                    onClick={() => setShowBpmMoreInfo(true)}
                    className="text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    (more info)
                  </button>
                </div>
              )}
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

        {/* Cached Data Indicator - Discrete, just before table */}
        <div className="mb-2 flex items-center justify-between">
          {isCached && cachedAt && (
            <div className="text-right">
              <button
                onClick={() => setShowCacheModal(true)}
                className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
              >
                Using cached data
              </button>
            </div>
          )}
          <div className="text-xs text-gray-500 ml-auto">
            Right click on a track for play options
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="block sm:hidden space-y-3">
          {sortedTracks.map((track, index) => (
            <div
              key={track.id}
              className={`bg-white rounded-lg border shadow-sm p-4 cursor-pointer transition-colors ${
                playingTrackId === track.id
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
              onClick={(e) => {
                // Only handle left click
                if (e.button === 0 || !e.button) {
                  handleTrackClick(track, e)
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                handleTrackContextMenu(e, track)
              }}
              title={getPreviewTooltip(track.id)}
            >
              <div className="flex gap-3">
                <div className="text-gray-500 text-sm font-medium w-6 flex-shrink-0 pt-1 flex items-center justify-center">
                  {playingTrackId === track.id ? (
                    <svg className="w-4 h-4 text-green-600 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    index + 1
                  )}
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
                            onContextMenu={(e) => handleTrackContextMenu(e, track)}
                            title={getPreviewTooltip(track.id)}
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
                                className="text-green-600 hover:text-green-700"
                                onClick={(e) => handleArtistClick(e, artist)}
                                onContextMenu={(e) => handleArtistContextMenu(e, artist)}
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
                            className="text-green-600 hover:text-green-700"
                            onClick={(e) => handleAlbumClick(e, track.album)}
                            onContextMenu={(e) => handleAlbumContextMenu(e, track.album)}
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
                    className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none hidden md:table-cell max-w-[120px]"
                    onClick={() => handleSort('artists')}
                  >
                    <div className="flex items-center">
                      Artist
                      <SortIcon field="artists" />
                    </div>
                  </th>
                  <th
                    className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none hidden lg:table-cell max-w-[150px]"
                    onClick={() => handleSort('album')}
                  >
                    <div className="flex items-center">
                      Album
                      <SortIcon field="album" />
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
                    className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none hidden md:table-cell"
                    onClick={() => handleSort('tempo')}
                  >
                    <div className="flex items-center">
                      BPM
                      <SortIcon field="tempo" />
                    </div>
                  </th>
                  <th className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 hidden md:table-cell">
                    Key
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
                    className="px-3 lg:px-4 py-2 lg:py-3 text-right text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none hidden lg:table-cell"
                    onClick={() => handleSort('popularity')}
                  >
                    <div className="flex items-center justify-end">
                      Popularity
                      <SortIcon field="popularity" />
                    </div>
                  </th>
                  <th
                    className="px-3 lg:px-4 py-2 lg:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none hidden lg:table-cell"
                    onClick={() => handleSort('added_at')}
                  >
                    <div className="flex items-center">
                      Added
                      <SortIcon field="added_at" />
                    </div>
                  </th>
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
                      className={`transition-colors cursor-pointer ${
                        playingTrackId === track.id
                          ? 'bg-green-50 hover:bg-green-100'
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={(e) => {
                        // Only handle left click
                        if (e.button === 0 || !e.button) {
                          handleTrackClick(track, e)
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        handleTrackContextMenu(e, track)
                      }}
                      title={getPreviewTooltip(track.id)}
                    >
                      <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-500 text-xs sm:text-sm">
                        <div className="flex items-center justify-center">
                          {playingTrackId === track.id ? (
                            <svg className="w-4 h-4 text-green-600 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            index + 1
                          )}
                        </div>
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
                            onContextMenu={(e) => handleTrackContextMenu(e, track)}
                            title={getPreviewTooltip(track.id)}
                          >
                            {track.name}
                          </a>
                          {track.explicit && (
                            <span className="ml-1 text-xs bg-gray-200 text-gray-700 px-1 py-0.5 rounded">E</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-700 text-xs sm:text-sm hidden md:table-cell max-w-[120px] truncate" title={track.artists.map(a => a.name).join(', ')}>
                        {track.artists.map((artist, index) => (
                          <span key={artist.id || index}>
                            {artist.external_urls?.spotify ? (
                              <a
                                href={artist.external_urls.spotify}
                                className="text-green-600 hover:text-green-700 hover:underline"
                                onClick={(e) => handleArtistClick(e, artist)}
                                onContextMenu={(e) => handleArtistContextMenu(e, artist)}
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
                      <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-700 text-xs sm:text-sm hidden lg:table-cell max-w-[150px] truncate" title={track.album.name}>
                        {track.album.external_urls?.spotify ? (
                          <a
                            href={track.album.external_urls.spotify}
                            className="text-green-600 hover:text-green-700 hover:underline"
                            onClick={(e) => handleAlbumClick(e, track.album)}
                            onContextMenu={(e) => handleAlbumContextMenu(e, track.album)}
                          >
                            {track.album.name}
                          </a>
                        ) : (
                          <span>{track.album.name}</span>
                        )}
                      </td>
                      <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-600 text-xs sm:text-sm hidden md:table-cell">
                        {formatDuration(track.duration_ms)}
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
                      <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-600 text-xs sm:text-sm hidden md:table-cell">
                        {(() => {
                          const key = trackKeys[track.id]
                          const scale = trackScales[track.id]
                          if (key && scale) {
                            return `${key} ${scale}`
                          } else if (key) {
                            return key
                          } else if (scale) {
                            return scale
                          }
                          return '-'
                        })()}
                      </td>
                      <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-600 text-xs sm:text-sm">
                        {getYearString(track.album.release_date)}
                      </td>
                      <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-600 text-xs sm:text-sm text-right hidden lg:table-cell">
                        {track.popularity != null ? track.popularity : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-3 lg:px-4 py-2 lg:py-3 text-gray-600 text-xs sm:text-sm hidden lg:table-cell">
                        {track.added_at ? formatDate(track.added_at) : 'N/A'}
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
                        // Store successful preview URL from DB
                        if (data.successfulUrl) {
                          setPreviewUrls(prev => ({
                            ...prev,
                            [selectedBpmTrack.id]: data.successfulUrl,
                          }))
                        }
                        // Mark track as in DB (now it has an entry, whether BPM or N/A)
                        setTracksInDb(prev => new Set(prev).add(selectedBpmTrack.id))
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
                            } else if (data.source === 'itunes_search') {
                              errorMessage = 'No preview available on iTunes/Apple Music'
                            } else if (data.source === 'deezer_isrc' || data.source === 'deezer_search') {
                              errorMessage = 'No preview available on Deezer'
                            } else {
                              errorMessage = 'BPM calculation failed. No preview audio available.'
                            }
                          }
                          
                          // Make error messages more user-friendly
                          if (errorMessage.includes('Invalid base62 id') || errorMessage.includes('base62')) {
                            errorMessage = 'Invalid track ID format. This track may have been removed or is unavailable.'
                          } else if (errorMessage.includes('Invalid Spotify track ID')) {
                            errorMessage = 'Invalid track ID. This track may have been removed or is unavailable.'
                          }
                          setBpmDetails(prev => ({
                            ...prev,
                            [selectedBpmTrack.id]: {
                              source: data.source,
                              error: errorMessage,
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
      
      {/* Cache Info Modal */}
      {showCacheModal && isCached && cachedAt && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={refreshDone ? handleDone : undefined}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Cached Data</h2>
              {!isRefreshing && !refreshDone && (
                <button
                  onClick={() => setShowCacheModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              )}
            </div>
            
            <div className="space-y-4 text-sm text-gray-700">
              <p>
                This playlist is using cached data to reduce API calls to Spotify.
              </p>
              
              <p>
                The playlist content should be the same as the current version because we use Spotify&apos;s <strong>snapshot_id</strong> to verify that the playlist hasn&apos;t changed since it was cached.
              </p>
              
              <div className="pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  <strong>Retrieved on:</strong> {cachedAt.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              {refreshDone ? (
                <button
                  onClick={handleDone}
                  className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded transition-colors"
                >
                  Done
                </button>
              ) : (
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded transition-colors flex items-center gap-2"
                >
                  {isRefreshing ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white border border-gray-300 rounded-lg shadow-lg z-50 py-1 min-w-[180px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            onClick={() => {
              openSpotifyApp(contextMenu.spotifyUri, contextMenu.spotifyUrl)
              setContextMenu(null)
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Open in Spotify app
          </button>
          <button
            onClick={() => {
              window.open(contextMenu.spotifyUrl, '_blank', 'noopener,noreferrer')
              setContextMenu(null)
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Open in web player
          </button>
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
        .
      </footer>
    </div>
  )
}

