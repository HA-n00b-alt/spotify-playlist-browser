'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
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
  BpmDetails,
  PreviewUrlEntry
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
  const [loadingBpmFields, setLoadingBpmFields] = useState<Set<string>>(new Set())
  const [loadingKeyFields, setLoadingKeyFields] = useState<Set<string>>(new Set())
  const [tracksNeedingBpm, setTracksNeedingBpm] = useState<Set<string>>(new Set())
  const [tracksNeedingKey, setTracksNeedingKey] = useState<Set<string>>(new Set())
  const [tracksNeedingCalc, setTracksNeedingCalc] = useState<Set<string>>(new Set())
  const [loadingPreviewIds, setLoadingPreviewIds] = useState<Set<string>>(new Set())
  const [bpmStreamStatus, setBpmStreamStatus] = useState<Record<string, 'partial' | 'final' | 'error'>>({})
  const streamAbortRef = useRef<AbortController | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
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
  const [retryTrackId, setRetryTrackId] = useState<string | null>(null)
  const [recalcStatus, setRecalcStatus] = useState<{ loading: boolean; success?: boolean; error?: string } | null>(null)
  const [creditsByTrackId, setCreditsByTrackId] = useState<
    Record<
      string,
      {
        performedBy: string[]
        writtenBy: string[]
        producedBy: string[]
        mixedBy: string[]
        masteredBy: string[]
        releaseId?: string | null
      }
    >
  >({})
  const [creditsLoadingIds, setCreditsLoadingIds] = useState<Set<string>>(new Set())
  const [creditsErrorByTrackId, setCreditsErrorByTrackId] = useState<Record<string, string>>({})
  const [showCreditsModal, setShowCreditsModal] = useState(false)
  const [selectedCreditsTrack, setSelectedCreditsTrack] = useState<Track | null>(null)
  const [pageSize, setPageSize] = useState<number | 'all'>(50)
  const [currentPage, setCurrentPage] = useState(1)
  // State for manual override in modal
  const [manualBpm, setManualBpm] = useState<string>('')
  const [manualKey, setManualKey] = useState<string>('')
  const [manualScale, setManualScale] = useState<string>('major')
  const [isUpdatingSelection, setIsUpdatingSelection] = useState(false)
  
  // Initialize manual values when modal opens
  useEffect(() => {
    if (showBpmModal && selectedBpmTrack) {
      const fullData = bpmFullData[selectedBpmTrack.id]
      if (fullData?.bpmManual) {
        setManualBpm(String(fullData.bpmManual))
      }
      if (fullData?.keyManual) {
        setManualKey(fullData.keyManual)
      }
      if (fullData?.scaleManual) {
        setManualScale(fullData.scaleManual)
      }
    } else {
      // Reset when modal closes
      setManualBpm('')
      setManualKey('')
      setManualScale('major')
    }
  }, [showBpmModal, selectedBpmTrack, bpmFullData])
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
  const [showBpmNotice, setShowBpmNotice] = useState(true)
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null)
  const [loggedInUserName, setLoggedInUserName] = useState<string | null>(null)
  const [showBpmRecalcPrompt, setShowBpmRecalcPrompt] = useState(false)
  const [pendingRecalcIds, setPendingRecalcIds] = useState<{ all: string[]; newOnly: string[] }>({ all: [], newOnly: [] })
  const [isHeaderRefreshing, setIsHeaderRefreshing] = useState(false)
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
    track?: Track
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
    
    const handlePageHide = () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      setPlayingTrackId(null)
      audioRef.current = null
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)
    
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
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [])

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    fetch('/api/auth/status')
      .then((res) => res.json())
      .then((data) => {
        if (data?.authenticated && data?.user) {
          setLoggedInUserName(data.user.display_name || data.user.id || null)
          return
        }
        if (!data?.authenticated) {
          window.location.href = '/'
        }
      })
      .catch(() => {})
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
        window.location.href = '/'
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

  const fetchTracksInDbForIds = async (trackIds: string[]) => {
    if (trackIds.length === 0) {
      return new Set<string>()
    }
    try {
      const res = await fetch('/api/bpm/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds }),
      })
      if (!res.ok) {
        return new Set<string>()
      }
      const data = await res.json()
      const inDbSet = new Set<string>()
      for (const [trackId, result] of Object.entries(data.results || {})) {
        const r = result as any
        if (r && (r.source !== undefined || r.error !== undefined || r.bpmRaw !== undefined || r.cached === true)) {
          inDbSet.add(trackId)
        }
      }
      return inDbSet
    } catch (error) {
      console.error('[BPM Client] Error checking tracks in DB:', error)
      return new Set<string>()
    }
  }

  const handleHeaderRefresh = async () => {
    setIsHeaderRefreshing(true)
    try {
      const [, refreshedTracks] = await Promise.all([
        refreshPlaylist(),
        refreshTracks(),
      ])
      const trackIds = refreshedTracks.map((t) => t.id)
      const inDbSet = await fetchTracksInDbForIds(trackIds)
      setTracksInDb(inDbSet)
      const newOnly = trackIds.filter((id) => !inDbSet.has(id))
      setPendingRecalcIds({ all: trackIds, newOnly })
      setShowBpmRecalcPrompt(true)
    } catch (error) {
      console.error('Error refreshing playlist:', error)
    } finally {
      setIsHeaderRefreshing(false)
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

  const getPreviewUrlFromMeta = (meta: { urls?: PreviewUrlEntry[] }) => {
    if (!meta) return null
    const successful = meta.urls?.find((entry) => entry.successful)
    return successful?.url || null
  }

  const selectBestBpm = (
    bpmEssentia: number | null | undefined,
    bpmConfidenceEssentia: number | null | undefined,
    bpmLibrosa: number | null | undefined,
    bpmConfidenceLibrosa: number | null | undefined
  ): 'essentia' | 'librosa' => {
    if (bpmLibrosa == null) return 'essentia'
    if (bpmEssentia == null) return 'librosa'
    const essentiaConf = bpmConfidenceEssentia ?? 0
    const librosaConf = bpmConfidenceLibrosa ?? 0
    return librosaConf > essentiaConf ? 'librosa' : 'essentia'
  }

  const selectBestKey = (
    keyEssentia: string | null | undefined,
    keyscaleConfidenceEssentia: number | null | undefined,
    keyLibrosa: string | null | undefined,
    keyscaleConfidenceLibrosa: number | null | undefined
  ): 'essentia' | 'librosa' => {
    if (keyLibrosa == null) return 'essentia'
    if (keyEssentia == null) return 'librosa'
    const essentiaConf = keyscaleConfidenceEssentia ?? 0
    const librosaConf = keyscaleConfidenceLibrosa ?? 0
    return librosaConf > essentiaConf ? 'librosa' : 'essentia'
  }

  const loadingTrackIds = useMemo(() => {
    const ids = new Set<string>()
    loadingBpmFields.forEach(id => ids.add(id))
    loadingKeyFields.forEach(id => ids.add(id))
    return ids
  }, [loadingBpmFields, loadingKeyFields])

  const isTrackLoading = (trackId: string) => loadingTrackIds.has(trackId)

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
      const tracksLoading = loadingTrackIds.size
      
      // Processing is complete when no tracks are loading and all tracks have been attempted
      // Only set end time if at least one track was calculated (not just all cached)
      if (tracksLoading === 0 && tracksWithoutBpm === 0 && tracksWithBpm > 0) {
        setBpmProcessingEndTime(Date.now())
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackBpms, loadingTrackIds, tracks.length, bpmProcessingStartTime, bpmProcessingEndTime])

  // Batch fetch BPMs from cache
  const fetchBpmsBatch = async () => {
    const trackIds = tracks.map(t => t.id)
    if (trackIds.length === 0) return

    // Reset loading before selectively streaming uncached tracks
    setLoadingBpmFields(new Set())
    setLoadingKeyFields(new Set())
    setTracksNeedingBpm(new Set())
    setTracksNeedingKey(new Set())
    setTracksNeedingCalc(new Set())
    setBpmStreamStatus({})
    // Show spinners while cached results are being fetched
    setLoadingBpmFields(new Set(trackIds))
    setLoadingKeyFields(new Set(trackIds))

    const applyBatchResults = (results: Record<string, any>) => {
      const newBpms: Record<string, number | null> = {}
      const newKeys: Record<string, string | null> = {}
      const newScales: Record<string, string | null> = {}
      const newDetails: Record<string, { source?: string; error?: string }> = {}
      const newPreviewUrls: Record<string, string | null> = {}
      const needsBpm = new Set<string>()
      const needsKey = new Set<string>()
      const needsCalc = new Set<string>()
      const nextStreamStatus: Record<string, 'partial' | 'final' | 'error'> = {}

      for (const [trackId, result] of Object.entries(results || {})) {
        const r = result as any
        newBpms[trackId] = r.bpm
        if (r.key !== undefined) {
          newKeys[trackId] = r.key || null
        }
        if (r.scale !== undefined) {
          newScales[trackId] = r.scale || null
        }
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
        const previewUrlFromMeta = getPreviewUrlFromMeta({ urls: r.urls })
        if (previewUrlFromMeta) {
          newPreviewUrls[trackId] = previewUrlFromMeta
        }
        if (r.source || r.error || r.urls) {
          newDetails[trackId] = {
            source: r.source,
            error: r.error,
          }
        }
        if (r.source || r.error || r.urls) {
          setBpmDebugInfo(prev => ({
            ...prev,
            [trackId]: {
              ...r,
              urls: r.urls || [],
            },
          }))
        }

        const hasError = Boolean(r.error)
        const hasBpm = r.bpm != null
        const hasKey = r.key != null
        const hasScale = r.scale != null
        const needsBpmValue = !hasBpm
        const needsKeyValue = !hasKey || !hasScale

        if (hasError) {
          nextStreamStatus[trackId] = 'error'
          newBpms[trackId] = r.bpm ?? null
          if (r.key === undefined) {
            newKeys[trackId] = null
          }
          if (r.scale === undefined) {
            newScales[trackId] = null
          }
        } else {
          if (needsBpmValue) {
            needsBpm.add(trackId)
          }
          if (needsKeyValue) {
            needsKey.add(trackId)
          }
          if (needsBpmValue || needsKeyValue) {
            needsCalc.add(trackId)
          }
        }
      }

      setTrackBpms(newBpms)
      setTrackKeys(prev => ({ ...prev, ...newKeys }))
      setTrackScales(prev => ({ ...prev, ...newScales }))
      setBpmDetails(newDetails)
      setPreviewUrls(prev => ({ ...prev, ...newPreviewUrls }))
      setTracksNeedingBpm(needsBpm)
      setTracksNeedingKey(needsKey)
      setTracksNeedingCalc(needsCalc)
      setLoadingBpmFields(new Set(needsBpm))
      setLoadingKeyFields(new Set(needsKey))
      if (Object.keys(nextStreamStatus).length > 0) {
        setBpmStreamStatus(prev => ({ ...prev, ...nextStreamStatus }))
      }

      const inDbSet = new Set<string>()
      for (const [trackId, result] of Object.entries(results || {})) {
        const r = result as any
        if (r && (r.source !== undefined || r.error !== undefined || r.bpmRaw !== undefined || r.cached === true)) {
          inDbSet.add(trackId)
        }
      }
      setTracksInDb(prev => {
        const combined = new Set(prev)
        inDbSet.forEach(id => combined.add(id))
        return combined
      })

      const calculatedFromBatch = Object.values(results || {}).filter((r: any) => r.bpm !== null && !r.cached).length
      setBpmTracksCalculated(prev => prev + calculatedFromBatch)

      const uncachedTracks = tracks.filter(t => needsCalc.has(t.id))
      if (uncachedTracks.length > 0) {
        console.log(`[BPM Client] Streaming ${uncachedTracks.length} uncached tracks`)
        streamBpmsForTracks(uncachedTracks, needsBpm, needsKey)
      } else {
        setBpmProcessingStartTime(null)
      }
    }

    try {
      console.log(`[BPM Client] Fetching BPM batch for ${trackIds.length} tracks`)
      const chunkSize = 100
      const combinedResults: Record<string, any> = {}
      for (let i = 0; i < trackIds.length; i += chunkSize) {
        const chunkIds = trackIds.slice(i, i + chunkSize)
        const res = await fetch('/api/bpm/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ trackIds: chunkIds }),
        })

        if (res.ok) {
          const data = await res.json()
          console.log(`[BPM Client] Batch BPM data received:`, data)
          Object.assign(combinedResults, data.results || {})
        } else {
          console.error(`[BPM Client] Batch fetch failed:`, res.status)
          fetchBpmsForTracks(tracks.filter(t => chunkIds.includes(t.id)))
        }
      }

      applyBatchResults(combinedResults)
    } catch (error) {
      console.error(`[BPM Client] Batch fetch error:`, error)
      fetchBpmsForTracks(tracks)
    }
  }

  const streamBpmsForTracks = async (
    tracksToFetch: Track[],
    needsBpm?: Set<string>,
    needsKey?: Set<string>
  ) => {
    if (tracksToFetch.length === 0) return

    const batchSize = 20
    const fallbackNeedsBpm = needsBpm || new Set(tracksToFetch.map(track => track.id))
    const fallbackNeedsKey = needsKey || new Set(tracksToFetch.map(track => track.id))

    setTracksNeedingBpm(prev => {
      const next = new Set(prev)
      fallbackNeedsBpm.forEach(id => next.add(id))
      return next
    })
    setTracksNeedingKey(prev => {
      const next = new Set(prev)
      fallbackNeedsKey.forEach(id => next.add(id))
      return next
    })
    setTracksNeedingCalc(prev => {
      const next = new Set(prev)
      tracksToFetch.forEach(track => next.add(track.id))
      return next
    })

    for (let i = 0; i < tracksToFetch.length; i += batchSize) {
      const batch = tracksToFetch.slice(i, i + batchSize)
      const trackIds = batch.map(track => track.id)

      setLoadingBpmFields(prev => {
        const next = new Set(prev)
        trackIds.forEach(id => {
          if (fallbackNeedsBpm.has(id)) {
            next.add(id)
          }
        })
        return next
      })
      setLoadingKeyFields(prev => {
        const next = new Set(prev)
        trackIds.forEach(id => {
          if (fallbackNeedsKey.has(id)) {
            next.add(id)
          }
        })
        return next
      })

      try {
        const res = await fetch('/api/bpm/stream-batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ trackIds, country: countryCode }),
        })

        if (!res.ok) {
          console.error(`[BPM Client] Stream batch failed:`, res.status)
          fetchBpmsForTracks(batch)
          continue
        }

        const data = await res.json()
        const immediateResults = data.immediateResults || {}
        const previewMeta = data.previewMeta || {}

        for (const [trackId, result] of Object.entries(immediateResults)) {
          const r = result as any
          setTrackBpms(prev => ({ ...prev, [trackId]: null }))
          setTrackKeys(prev => ({ ...prev, [trackId]: null }))
          setTrackScales(prev => ({ ...prev, [trackId]: null }))
          setBpmDetails(prev => ({
            ...prev,
            [trackId]: { source: r.source, error: r.error },
          }))
          setBpmDebugInfo(prev => ({
            ...prev,
            [trackId]: {
              ...r,
              urls: r.urls || [],
            },
          }))
          const previewUrl = getPreviewUrlFromMeta({ urls: r.urls })
          if (previewUrl) {
            setPreviewUrls(prev => ({ ...prev, [trackId]: previewUrl }))
          }
          setBpmStreamStatus(prev => ({ ...prev, [trackId]: 'error' }))
          setLoadingBpmFields(prev => {
            const next = new Set(prev)
            next.delete(trackId)
            return next
          })
          setLoadingKeyFields(prev => {
            const next = new Set(prev)
            next.delete(trackId)
            return next
          })
          setTracksInDb(prev => new Set(prev).add(trackId))
          if (retryTrackId === trackId) {
            setRetryStatus({ loading: false, success: false, error: r.error || 'BPM calculation failed' })
            setRetryTrackId(null)
          }
        }

        for (const [trackId, meta] of Object.entries(previewMeta)) {
          const previewUrl = getPreviewUrlFromMeta(meta as any)
          if (previewUrl) {
            setPreviewUrls(prev => ({ ...prev, [trackId]: previewUrl }))
          }
        }

        const indexToTrackIdEntries = Object.entries(data.indexToTrackId || {})
        if (!data.batchId || indexToTrackIdEntries.length === 0) {
          const fallbackTracks = batch.filter(track => !immediateResults[track.id])
          if (fallbackTracks.length > 0) {
            fetchBpmsForTracks(fallbackTracks)
          }
        } else {
          const indexToTrackId = new Map<number, string>()
          for (const [indexStr, trackId] of indexToTrackIdEntries) {
            indexToTrackId.set(Number(indexStr), trackId as string)
          }

          await streamBatchResults(data.batchId, indexToTrackId, previewMeta)
        }
      } catch (error) {
        console.error('[BPM Client] Stream batch error:', error)
        fetchBpmsForTracks(batch)
      }

      if (i + batchSize < tracksToFetch.length) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }
  }

  const streamBatchResults = async (
    batchId: string,
    indexToTrackId: Map<number, string>,
    previewMeta: Record<string, any>
  ) => {
    if (streamAbortRef.current) {
      streamAbortRef.current.abort()
    }

    const abortController = new AbortController()
    streamAbortRef.current = abortController
    const finalizedTracks = new Set<string>()

    try {
      const response = await fetch(`/api/stream/${batchId}`, {
        signal: abortController.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      if (!response.body) {
        throw new Error('No response body')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const maybeYield = async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
      }

      const handleStreamResult = async (data: any) => {
        if (typeof data.index !== 'number') return
        const trackId = indexToTrackId.get(data.index)
        if (!trackId) return

        const meta = previewMeta[trackId]
        const bpmSelected = selectBestBpm(
          data.bpm_essentia,
          data.bpm_confidence_essentia,
          data.bpm_librosa,
          data.bpm_confidence_librosa
        )
        const keySelected = selectBestKey(
          data.key_essentia,
          data.keyscale_confidence_essentia,
          data.key_librosa,
          data.keyscale_confidence_librosa
        )

        const selectedBpm =
          bpmSelected === 'librosa'
            ? data.bpm_librosa ?? data.bpm_essentia ?? null
            : data.bpm_essentia ?? data.bpm_librosa ?? null

        const selectedKey =
          keySelected === 'librosa'
            ? data.key_librosa ?? data.key_essentia ?? null
            : data.key_essentia ?? data.key_librosa ?? null

        const selectedScale =
          keySelected === 'librosa'
            ? data.scale_librosa ?? data.scale_essentia ?? null
            : data.scale_essentia ?? data.scale_librosa ?? null

        setTrackBpms(prev => ({ ...prev, [trackId]: selectedBpm }))
        if (selectedKey != null) {
          setTrackKeys(prev => ({ ...prev, [trackId]: selectedKey }))
        }
        if (selectedScale != null) {
          setTrackScales(prev => ({ ...prev, [trackId]: selectedScale }))
        }
        if (selectedBpm != null) {
          setLoadingBpmFields(prev => {
            const next = new Set(prev)
            next.delete(trackId)
            return next
          })
        }
        if (selectedKey != null || selectedScale != null) {
          setLoadingKeyFields(prev => {
            const next = new Set(prev)
            next.delete(trackId)
            return next
          })
        }

        setBpmFullData(prev => ({
          ...prev,
          [trackId]: {
            ...prev[trackId],
            bpmEssentia: data.bpm_essentia !== undefined ? data.bpm_essentia : prev[trackId]?.bpmEssentia,
            bpmRawEssentia: data.bpm_raw_essentia !== undefined ? data.bpm_raw_essentia : prev[trackId]?.bpmRawEssentia,
            bpmConfidenceEssentia: data.bpm_confidence_essentia !== undefined ? data.bpm_confidence_essentia : prev[trackId]?.bpmConfidenceEssentia,
            bpmLibrosa: data.bpm_librosa !== undefined ? data.bpm_librosa : prev[trackId]?.bpmLibrosa,
            bpmRawLibrosa: data.bpm_raw_librosa !== undefined ? data.bpm_raw_librosa : prev[trackId]?.bpmRawLibrosa,
            bpmConfidenceLibrosa: data.bpm_confidence_librosa !== undefined ? data.bpm_confidence_librosa : prev[trackId]?.bpmConfidenceLibrosa,
            keyEssentia: data.key_essentia !== undefined ? data.key_essentia : prev[trackId]?.keyEssentia,
            scaleEssentia: data.scale_essentia !== undefined ? data.scale_essentia : prev[trackId]?.scaleEssentia,
            keyscaleConfidenceEssentia: data.keyscale_confidence_essentia !== undefined ? data.keyscale_confidence_essentia : prev[trackId]?.keyscaleConfidenceEssentia,
            keyLibrosa: data.key_librosa !== undefined ? data.key_librosa : prev[trackId]?.keyLibrosa,
            scaleLibrosa: data.scale_librosa !== undefined ? data.scale_librosa : prev[trackId]?.scaleLibrosa,
            keyscaleConfidenceLibrosa: data.keyscale_confidence_librosa !== undefined ? data.keyscale_confidence_librosa : prev[trackId]?.keyscaleConfidenceLibrosa,
            bpmSelected: bpmSelected,
            keySelected: keySelected,
            debugTxt: data.debug_txt !== undefined ? data.debug_txt : prev[trackId]?.debugTxt,
          },
        }))

        if (meta) {
          setBpmDetails(prev => ({
            ...prev,
            [trackId]: { source: meta.source, error: undefined },
          }))
          setBpmDebugInfo(prev => ({
            ...prev,
            [trackId]: {
              ...data,
              source: meta.source,
              urls: meta.urls || [],
            },
          }))
          const previewUrl = getPreviewUrlFromMeta(meta)
          if (previewUrl) {
            setPreviewUrls(prev => ({ ...prev, [trackId]: previewUrl }))
          }
        }

        const status =
          data.result_status === 'partial' || data.result_status === 'final'
            ? data.result_status
            : data.status === 'partial' || data.status === 'final'
              ? data.status
              : 'final'
        setBpmStreamStatus(prev => ({ ...prev, [trackId]: status }))

        if (status === 'final') {
          if (selectedBpm == null) {
            setTrackBpms(prev => ({ ...prev, [trackId]: null }))
            setLoadingBpmFields(prev => {
              const next = new Set(prev)
              next.delete(trackId)
              return next
            })
          }
          if (selectedKey == null || selectedScale == null) {
            setTrackKeys(prev => ({ ...prev, [trackId]: selectedKey ?? null }))
            setTrackScales(prev => ({ ...prev, [trackId]: selectedScale ?? null }))
            setLoadingKeyFields(prev => {
              const next = new Set(prev)
              next.delete(trackId)
              return next
            })
          }
          if (!finalizedTracks.has(trackId)) {
            finalizedTracks.add(trackId)
            setTracksInDb(prev => new Set(prev).add(trackId))
            if (meta) {
              setBpmTracksCalculated(prev => prev + 1)
              fetch('/api/bpm/ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  trackId,
                  result: data,
                  previewMeta: meta,
                }),
              }).catch((error) => {
                console.warn('[BPM Client] Failed to ingest BPM result:', error)
              })
            }
            if (retryTrackId === trackId) {
              setRetryStatus({ loading: false, success: true })
              setRetryTrackId(null)
            }
          }
        }
      }

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.trim() === '') continue
          try {
            const data = JSON.parse(line)
            if (data?.type === 'result') {
              await handleStreamResult(data)
              await maybeYield()
            } else if (data?.type === 'error') {
              console.warn('[BPM Client] Stream error:', data.message)
            }
          } catch (parseError) {
            console.error('[BPM Client] Failed to parse stream line:', parseError)
          }
        }
      }

      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer.trim())
          if (data?.type === 'result') {
            await handleStreamResult(data)
            await maybeYield()
          }
        } catch (parseError) {
          console.error('[BPM Client] Failed to parse stream buffer:', parseError)
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      console.error('[BPM Client] Stream processing error:', error)
    } finally {
      const remainingTracks = Array.from(indexToTrackId.values()).filter(
        (trackId) => !finalizedTracks.has(trackId)
      )
      if (remainingTracks.length > 0) {
        const fallbackTracks = tracks.filter(track => remainingTracks.includes(track.id))
        fetchBpmsForTracks(fallbackTracks)
      }
    }
  }

  // Function to fetch BPM for individual tracks (for uncached tracks)
  const fetchBpmsForTracks = async (tracksToFetch: Track[]) => {
    // Process in smaller batches to avoid overwhelming the server
    const batchSize = 20
    for (let i = 0; i < tracksToFetch.length; i += batchSize) {
      const batch = tracksToFetch.slice(i, i + batchSize)
      
      await Promise.all(
        batch.map(async (track) => {
          if (isTrackLoading(track.id)) {
            return
          }

          const hasBpm = trackBpms[track.id] !== undefined
          const hasKey = trackKeys[track.id] != null && trackScales[track.id] != null
          if (hasBpm && hasKey && bpmStreamStatus[track.id] !== 'partial') {
            return // Already fetched or in progress
          }
          
          setLoadingBpmFields(prev => new Set(prev).add(track.id))
          setLoadingKeyFields(prev => new Set(prev).add(track.id))
          
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
              const previewUrl = getPreviewUrlFromMeta({ urls: data.urls })
              if (previewUrl) {
                setPreviewUrls(prev => ({
                  ...prev,
                  [track.id]: previewUrl,
                }))
              }
              setBpmDetails(prev => ({
                ...prev,
                [track.id]: {
                  source: data.source,
                  error: data.error,
                },
              }))
              // Store full BPM data for modal
              if (data.bpmEssentia !== undefined || data.bpmLibrosa !== undefined || data.bpmSelected || 
                  data.keyEssentia !== undefined || data.keyLibrosa !== undefined || data.keySelected) {
                setBpmFullData(prev => ({
                  ...prev,
                  [track.id]: {
                    bpmEssentia: data.bpmEssentia,
                    bpmRawEssentia: data.bpmRawEssentia,
                    bpmConfidenceEssentia: data.bpmConfidenceEssentia,
                    bpmLibrosa: data.bpmLibrosa,
                    bpmRawLibrosa: data.bpmRawLibrosa,
                    bpmConfidenceLibrosa: data.bpmConfidenceLibrosa,
                    keyEssentia: data.keyEssentia,
                    scaleEssentia: data.scaleEssentia,
                    keyscaleConfidenceEssentia: data.keyscaleConfidenceEssentia,
                    keyLibrosa: data.keyLibrosa,
                    scaleLibrosa: data.scaleLibrosa,
                    keyscaleConfidenceLibrosa: data.keyscaleConfidenceLibrosa,
                    bpmSelected: data.bpmSelected || 'essentia',
                    keySelected: data.keySelected || 'essentia',
                    bpmManual: data.bpmManual,
                    keyManual: data.keyManual,
                    scaleManual: data.scaleManual,
                    debugTxt: data.debugTxt,
                  },
                }))
              }
              setBpmDebugInfo(prev => ({
                ...prev,
                [track.id]: {
                  ...data,
                  urls: data.urls || [],
                },
              }))
              // Mark track as in DB (now it has an entry, whether BPM or N/A)
              setTracksInDb(prev => new Set(prev).add(track.id))
              // Increment calculated count (this track was just calculated, not cached)
              setBpmTracksCalculated(prev => prev + 1)
              setBpmStreamStatus(prev => ({ ...prev, [track.id]: 'final' }))
              setLoadingBpmFields(prev => {
                const next = new Set(prev)
                next.delete(track.id)
                return next
              })
              setLoadingKeyFields(prev => {
                const next = new Set(prev)
                next.delete(track.id)
                return next
              })
              if (retryTrackId === track.id) {
                setRetryStatus({
                  loading: false,
                  success: data.bpm != null,
                  error: data.bpm != null ? undefined : data.error || 'BPM calculation failed',
                })
                setRetryTrackId(null)
              }
            } else {
              const errorData = await res.json().catch(() => ({}))
              setTrackBpms(prev => ({
                ...prev,
                [track.id]: null,
              }))
              setTrackKeys(prev => ({
                ...prev,
                [track.id]: null,
              }))
              setTrackScales(prev => ({
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
                  urls: errorData.urls || [],
                },
              }))
              setBpmStreamStatus(prev => ({ ...prev, [track.id]: 'error' }))
              setLoadingBpmFields(prev => {
                const next = new Set(prev)
                next.delete(track.id)
                return next
              })
              setLoadingKeyFields(prev => {
                const next = new Set(prev)
                next.delete(track.id)
                return next
              })
              if (retryTrackId === track.id) {
                setRetryStatus({
                  loading: false,
                  success: false,
                  error: errorData.error || 'Failed to fetch BPM',
                })
                setRetryTrackId(null)
              }
            }
          } catch (error) {
            console.error(`[BPM Client] Error fetching BPM for ${track.id}:`, error)
            setTrackBpms(prev => ({
              ...prev,
              [track.id]: null,
            }))
            setTrackKeys(prev => ({
              ...prev,
              [track.id]: null,
            }))
            setTrackScales(prev => ({
              ...prev,
              [track.id]: null,
            }))
            setBpmStreamStatus(prev => ({ ...prev, [track.id]: 'error' }))
            setLoadingBpmFields(prev => {
              const next = new Set(prev)
              next.delete(track.id)
              return next
            })
            setLoadingKeyFields(prev => {
              const next = new Set(prev)
              next.delete(track.id)
              return next
            })
            if (retryTrackId === track.id) {
              setRetryStatus({ loading: false, success: false, error: 'Network error. Please try again.' })
              setRetryTrackId(null)
            }
          } finally {
            setLoadingBpmFields(prev => {
              const next = new Set(prev)
              next.delete(track.id)
              return next
            })
            setLoadingKeyFields(prev => {
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
  const triggerRecalculateTracks = async (trackIds: string[]) => {
    if (trackIds.length === 0) {
      setShowBpmRecalcPrompt(false)
      return
    }

    setRecalculating(true)
    setShowBpmRecalcPrompt(false)
    setLoadingBpmFields(prev => {
      const next = new Set(prev)
      trackIds.forEach(id => next.add(id))
      return next
    })
    setLoadingKeyFields(prev => {
      const next = new Set(prev)
      trackIds.forEach(id => next.add(id))
      return next
    })
    try {
      const res = await fetch('/api/bpm/recalculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playlistId: params.id,
          trackIds,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to recalculate BPM/key')
      }

      setTrackBpms(prev => {
        const next = { ...prev }
        trackIds.forEach(id => delete next[id])
        return next
      })
      setTrackKeys(prev => {
        const next = { ...prev }
        trackIds.forEach(id => delete next[id])
        return next
      })
      setTrackScales(prev => {
        const next = { ...prev }
        trackIds.forEach(id => delete next[id])
        return next
      })
      setTracksNeedingBpm(prev => {
        const next = new Set(prev)
        trackIds.forEach(id => next.add(id))
        return next
      })
      setTracksNeedingKey(prev => {
        const next = new Set(prev)
        trackIds.forEach(id => next.add(id))
        return next
      })
      setBpmFullData(prev => {
        const next = { ...prev }
        trackIds.forEach(id => delete next[id])
        return next
      })
      setBpmDetails(prev => {
        const next = { ...prev }
        trackIds.forEach(id => delete next[id])
        return next
      })
      setBpmDebugInfo(prev => {
        const next = { ...prev }
        trackIds.forEach(id => delete next[id])
        return next
      })
      setTracksInDb(prev => {
        const next = new Set(prev)
        trackIds.forEach(id => next.delete(id))
        return next
      })

      const BATCH_SIZE = 5
      for (let i = 0; i < trackIds.length; i += BATCH_SIZE) {
        const batch = trackIds.slice(i, i + BATCH_SIZE)
        await Promise.allSettled(
          batch.map(trackId =>
            fetch(`/api/bpm?spotifyTrackId=${encodeURIComponent(trackId)}`, {
              method: 'GET',
            })
              .then(res => {
                if (!res.ok) {
                  throw new Error(`HTTP ${res.status}`)
                }
                return res.json().then(data => ({ trackId, data }))
              })
              .then(({ trackId, data }) => {
                if (data.bpm != null) {
                  setTrackBpms(prev => ({ ...prev, [trackId]: data.bpm }))
                  setTracksNeedingBpm(prev => {
                    const next = new Set(prev)
                    next.delete(trackId)
                    return next
                  })
                }
                if (data.key) {
                  setTrackKeys(prev => ({ ...prev, [trackId]: data.key }))
                  setTracksNeedingKey(prev => {
                    const next = new Set(prev)
                    next.delete(trackId)
                    return next
                  })
                }
                if (data.scale) {
                  setTrackScales(prev => ({ ...prev, [trackId]: data.scale }))
                }
                setLoadingBpmFields(prev => {
                  const next = new Set(prev)
                  next.delete(trackId)
                  return next
                })
                setLoadingKeyFields(prev => {
                  const next = new Set(prev)
                  next.delete(trackId)
                  return next
                })
                if (
                  data.bpmEssentia !== undefined ||
                  data.bpmLibrosa !== undefined ||
                  data.bpmSelected ||
                  data.keyEssentia !== undefined ||
                  data.keyLibrosa !== undefined ||
                  data.keySelected
                ) {
                  setBpmFullData(prev => ({
                    ...prev,
                    [trackId]: {
                      bpmEssentia: data.bpmEssentia,
                      bpmRawEssentia: data.bpmRawEssentia,
                      bpmConfidenceEssentia: data.bpmConfidenceEssentia,
                      bpmLibrosa: data.bpmLibrosa,
                      bpmRawLibrosa: data.bpmRawLibrosa,
                      bpmConfidenceLibrosa: data.bpmConfidenceLibrosa,
                      keyEssentia: data.keyEssentia,
                      scaleEssentia: data.scaleEssentia,
                      keyscaleConfidenceEssentia: data.keyscaleConfidenceEssentia,
                      keyLibrosa: data.keyLibrosa,
                      scaleLibrosa: data.scaleLibrosa,
                      keyscaleConfidenceLibrosa: data.keyscaleConfidenceLibrosa,
                      bpmSelected: data.bpmSelected || 'essentia',
                      keySelected: data.keySelected || 'essentia',
                      bpmManual: data.bpmManual,
                      keyManual: data.keyManual,
                      scaleManual: data.scaleManual,
                      debugTxt: data.debugTxt,
                    },
                  }))
                }
                setBpmDetails(prev => ({
                  ...prev,
                  [trackId]: { source: data.source, error: data.error },
                }))
              })
              .catch(() => {
                setLoadingBpmFields(prev => {
                  const next = new Set(prev)
                  next.delete(trackId)
                  return next
                })
                setLoadingKeyFields(prev => {
                  const next = new Set(prev)
                  next.delete(trackId)
                  return next
                })
              })
          )
        )

        if (i + BATCH_SIZE < trackIds.length) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      await fetchBpmsBatch()
    } catch (error) {
      console.error('[BPM Client] Error recalculating:', error)
    } finally {
      setRecalculating(false)
    }
  }

  const handleRecalculateAll = async () => {
    if (!confirm('This will clear the cache and force recalculation of BPM/key/scale for all tracks in this playlist. Continue?')) {
      return
    }
    await triggerRecalculateTracks(tracks.map(t => t.id))
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
  const refreshPreviewForTrack = async (trackId: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/bpm/preview-refresh?spotifyTrackId=${trackId}&country=${countryCode}`)
      if (!res.ok) {
        return null
      }
      const data = await res.json()
      const previewUrl = getPreviewUrlFromMeta({ urls: data.urls })
      if (previewUrl) {
        setPreviewUrls(prev => ({ ...prev, [trackId]: previewUrl }))
      }
      return previewUrl
    } catch {
      return null
    }
  }

  const fetchCreditsForTrack = async (track: Track) => {
    setSelectedCreditsTrack(track)
    setShowCreditsModal(true)
    if (creditsByTrackId[track.id]) {
      return
    }
    const isrc = track.external_ids?.isrc
    if (!isrc) {
      setCreditsErrorByTrackId(prev => ({
        ...prev,
        [track.id]: 'Missing ISRC for this track',
      }))
      return
    }
    setCreditsLoadingIds(prev => new Set(prev).add(track.id))
    try {
      const res = await fetch(`/api/musicbrainz/credits?isrc=${encodeURIComponent(isrc)}`)
      if (!res.ok) {
        let message = 'Unable to fetch credits'
        try {
          const errorPayload = await res.json()
          if (typeof errorPayload?.error === 'string') {
            message = errorPayload.error
          } else if (typeof errorPayload?.details === 'string' && errorPayload.details.trim()) {
            message = errorPayload.details
          }
        } catch {
          // Keep fallback message when response is not JSON.
        }
        throw new Error(message)
      }
      const data = await res.json()
      setCreditsByTrackId(prev => ({
        ...prev,
        [track.id]: {
          performedBy: data.performedBy || data.performers || [],
          writtenBy: data.writtenBy || data.composition || [],
          producedBy: data.producedBy || data.production || [],
          mixedBy: data.mixedBy || [],
          masteredBy: data.masteredBy || [],
          releaseId: typeof data.releaseId === 'string' ? data.releaseId : null,
        },
      }))
      setCreditsErrorByTrackId(prev => {
        const next = { ...prev }
        delete next[track.id]
        return next
      })
    } catch (error) {
      setCreditsErrorByTrackId(prev => ({
        ...prev,
        [track.id]: error instanceof Error ? error.message : 'Unable to fetch credits',
      }))
    } finally {
      setCreditsLoadingIds(prev => {
        const next = new Set(prev)
        next.delete(track.id)
        return next
      })
    }
  }

  const loadAudioWithCache = async (url: string, trackId?: string, allowRefresh = true): Promise<string> => {
    console.log('[Preview Debug] loadAudioWithCache called with URL:', url)
    
    const originalUrl = url // Keep original for cache key if it's an API URL
    
    // Check if it's a Deezer API URL - if so, fetch it to get the preview URL
    if (url.includes('api.deezer.com')) {
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
            if (response.status === 403 && trackId && allowRefresh) {
              const refreshed = await refreshPreviewForTrack(trackId)
              if (refreshed && refreshed !== url) {
                return await loadAudioWithCache(refreshed, trackId, false)
              }
            }
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
    if (loadingPreviewIds.has(trackId)) {
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
    if (!previewUrl && !loadingPreviewIds.has(track.id)) {
      try {
        setLoadingPreviewIds(prev => new Set(prev).add(track.id))
        const res = await fetch(`/api/bpm?spotifyTrackId=${track.id}&country=${countryCode}`)
        if (res.ok) {
          const data = await res.json()
          console.log('[Preview Debug] handleTrackClick - BPM API response urls:', data.urls)
          const previewUrlFromMeta = getPreviewUrlFromMeta({ urls: data.urls })
          if (previewUrlFromMeta) {
            previewUrl = previewUrlFromMeta
            setPreviewUrls(prev => ({
              ...prev,
              [track.id]: previewUrlFromMeta,
            }))
          }
        }
      } catch (error) {
        console.error('Error fetching preview URL:', error)
      } finally {
        setLoadingPreviewIds(prev => {
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
        const audioUrl = await loadAudioWithCache(previewUrl, track.id)
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
          setPlayingTrackId(null)
          audioRef.current = null
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
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      setPlayingTrackId(null)
      audioRef.current = null
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
    if (!previewUrl && !loadingPreviewIds.has(track.id)) {
      try {
        setLoadingPreviewIds(prev => new Set(prev).add(track.id))
        const res = await fetch(`/api/bpm?spotifyTrackId=${track.id}&country=${countryCode}`)
        if (res.ok) {
          const data = await res.json()
          console.log('[Preview Debug] handleTrackTitleClick - BPM API response urls:', data.urls)
          const previewUrlFromMeta = getPreviewUrlFromMeta({ urls: data.urls })
          if (previewUrlFromMeta) {
            previewUrl = previewUrlFromMeta
            setPreviewUrls(prev => ({
              ...prev,
              [track.id]: previewUrlFromMeta,
            }))
          }
        }
      } catch (error) {
        console.error('Error fetching preview URL:', error)
      } finally {
        setLoadingPreviewIds(prev => {
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
        const audioUrl = await loadAudioWithCache(previewUrl, track.id)
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
          setPlayingTrackId(null)
          audioRef.current = null
          
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
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      setPlayingTrackId(null)
      audioRef.current = null
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
        track,
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
      case 'tempo': {
        const rawA = trackBpms[a.id]
        const rawB = trackBpms[b.id]
        const fallbackA = a.tempo ?? -1
        const fallbackB = b.tempo ?? -1
        const parsedA = typeof rawA === 'string' ? Number(rawA) : rawA
        const parsedB = typeof rawB === 'string' ? Number(rawB) : rawB
        const normalizedA =
          typeof parsedA === 'number' && !Number.isNaN(parsedA) ? parsedA : fallbackA
        const normalizedB =
          typeof parsedB === 'number' && !Number.isNaN(parsedB) ? parsedB : fallbackB
        aValue = normalizedA
        bValue = normalizedB
        break
      }
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

  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(sortedTracks.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedTracks =
    pageSize === 'all'
      ? sortedTracks
      : sortedTracks.slice((safePage - 1) * pageSize, safePage * pageSize)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, sortField, sortDirection, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  // Compute BPM modal data (must be before any early returns)
  const bpmModalData = useMemo(() => {
    if (!showBpmModal || !selectedBpmTrack) return null
    
    const trackId = selectedBpmTrack.id
    const fullData = bpmFullData[trackId] || {}
    const currentBpm = trackBpms[trackId]
    const currentKey = trackKeys[trackId]
    const currentScale = trackScales[trackId]
    const bpmSelected = fullData?.bpmSelected || 'essentia'
    const keySelected = fullData?.keySelected || 'essentia'
    const hasEssentiaBpm = fullData?.bpmEssentia != null
    const hasLibrosaBpm = fullData?.bpmLibrosa != null
    const hasEssentiaKey = fullData?.keyEssentia != null
    const hasLibrosaKey = fullData?.keyLibrosa != null
    
    return {
      trackId,
      fullData,
      currentBpm,
      currentKey,
      currentScale,
      bpmSelected,
      keySelected,
      hasEssentiaBpm,
      hasLibrosaBpm,
      hasEssentiaKey,
      hasLibrosaKey,
    }
  }, [showBpmModal, selectedBpmTrack, bpmFullData, trackBpms, trackKeys, trackScales])

  const bpmSummary = useMemo(() => {
    const totalTracks = tracks.length
    if (totalTracks === 0) return null

    const tracksToSearch = tracksNeedingCalc.size
    const tracksLoading = loadingTrackIds.size
    const tracksProcessedFromSearch = tracks.filter(t =>
      tracksNeedingCalc.has(t.id) && !loadingTrackIds.has(t.id)
    ).length
    const tracksRemainingToSearch = Math.max(0, tracksToSearch - tracksProcessedFromSearch)
    const tracksWithBpm = tracks.filter(t => trackBpms[t.id] != null && trackBpms[t.id] !== undefined).length
    const tracksWithNa = tracks.filter(t => trackBpms[t.id] === null).length
    const isProcessing = tracksLoading > 0 || tracksRemainingToSearch > 0
    const hasStartedProcessing = tracksProcessedFromSearch > 0 || tracksLoading > 0
    const shouldShowProgress = tracksToSearch > 0 && (isProcessing || hasStartedProcessing || bpmProcessingStartTime !== null)

    return {
      totalTracks,
      tracksToSearch,
      tracksLoading,
      tracksProcessedFromSearch,
      tracksRemainingToSearch,
      tracksWithBpm,
      tracksWithNa,
      shouldShowProgress,
    }
  }, [tracks, tracksNeedingCalc, loadingTrackIds, trackBpms, bpmProcessingStartTime])

  useEffect(() => {
    if (bpmSummary) {
      setShowBpmNotice(true)
    }
  }, [bpmSummary])


  // Load preferred page size from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem('playlistPageSize')
    if (!saved) return
    if (saved === 'all') {
      setPageSize('all')
      return
    }
    const parsed = Number(saved)
    if (!Number.isNaN(parsed) && parsed > 0) {
      setPageSize(parsed)
    }
  }, [])

  // Persist page size preference
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('playlistPageSize', String(pageSize))
  }, [pageSize])

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <span className="ml-1 text-gray-300 text-[10px]">
          ↕
        </span>
      )
    }
    return (
      <span className="ml-1 text-gray-700 text-[10px]">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    )
  }

  const bpmDebugSetting = isAdmin ? (
    <div className="flex items-center justify-between text-sm text-gray-700">
      <span className="font-medium">BPM Debug</span>
      <button
        type="button"
        role="switch"
        aria-checked={showBpmDebug}
        onClick={() => setShowBpmDebug(!showBpmDebug)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
          showBpmDebug ? 'bg-emerald-500' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
            showBpmDebug ? 'translate-x-4' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  ) : null

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-transparent p-4 sm:p-8">
        <div className="max-w-7xl mx-auto flex-1 w-full">
          <PageHeader
            subtitle=""
            breadcrumbs={[
              { label: 'Home', href: '/' },
              { label: '[user] playlists', href: '/playlists' },
              { label: 'Playlist' },
            ]}
            settingsItems={bpmDebugSetting ?? undefined}
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
          </a>{' '}and{' '}
          <a href="https://musicbrainz.org" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
            Musicbrainz
          </a>
          .
        </footer>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-transparent">
        <div className="max-w-7xl mx-auto flex-1 w-full">
          <PageHeader
            subtitle="Search and sort your playlists with ease"
            breadcrumbs={[
              { label: 'Home', href: '/' },
              { label: '[user] playlists', href: '/playlists' },
              { label: 'Playlist' },
            ]}
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
          </a>{' '}and{' '}
          <a href="https://musicbrainz.org" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
            Musicbrainz
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
    <div className="min-h-screen flex flex-col p-4 sm:p-8 bg-transparent">
      <div className="max-w-7xl mx-auto flex-1 w-full">
        <PageHeader
          subtitle=""
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: '[user] playlists', href: '/playlists' },
            { label: playlistInfo?.name ?? 'Playlist' },
          ]}
          settingsItems={bpmDebugSetting ?? undefined}
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
                const tracksToSearch = tracksNeedingCalc.size
                const songsInDb = Math.max(0, totalTracks - tracksToSearch)
                return (
                  <div className="mb-3 pb-3 border-b border-gray-300">
                    <p><strong>Playlist:</strong> {totalTracks} songs</p>
                    <p><strong>In DB:</strong> {songsInDb} songs</p>
                    <p><strong>To calculate:</strong> {tracksToSearch} songs</p>
                  </div>
                )
              })()}
              <p><strong>Total tracks:</strong> {tracks.length}</p>
              <p><strong>Tracks with BPM:</strong> {Object.values(trackBpms).filter(bpm => bpm !== null && bpm !== undefined).length}</p>
              <p><strong>Tracks loading:</strong> {loadingTrackIds.size}</p>
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
                      data?.urls && data.urls.length > 0
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
                          <p className="font-semibold mb-1">URLs tried ({data.urls.length}):</p>
                          <ul className="list-disc list-inside space-y-1 text-gray-700">
                            {data.urls.map((entry: PreviewUrlEntry, idx: number) => (
                              <li key={idx} className={`break-all ${entry.successful ? 'text-green-600 font-semibold' : ''}`}>
                                {entry.successful ? '✓ ' : ''}{entry.url}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    })}
                  {Object.entries(bpmDebugInfo).filter(([id, data]: [string, any]) => 
                    data?.urls && data.urls.length > 0
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
                      loading: isTrackLoading(t.id),
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
          <div className="relative mb-6 rounded-2xl bg-white p-4 shadow-[0_4px_24px_rgba(0,0,0,0.06)] border-t border-gray-100 sm:p-5">
            <div className="absolute right-4 top-4 flex items-center gap-2">
              {isCached && cachedAt && (
                <button
                  onClick={() => setShowCacheModal(true)}
                  className="group relative inline-flex h-6 w-6 items-center justify-center rounded-full border border-blue-200 text-[11px] font-semibold text-blue-700"
                  aria-label="Using cached data"
                >
                  C
                  <span className="pointer-events-none absolute right-0 top-8 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 opacity-0 shadow-sm transition-opacity duration-0 group-hover:opacity-100">
                    Using cached data
                  </span>
                </button>
              )}
              <button
                onClick={handleHeaderRefresh}
                className="group relative inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:text-gray-700"
                aria-label="Refresh playlist"
                disabled={isHeaderRefreshing}
              >
                {isHeaderRefreshing ? (
                  <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                <span className="pointer-events-none absolute right-0 top-8 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 opacity-0 shadow-sm transition-opacity duration-0 group-hover:opacity-100">
                  Refresh playlist
                </span>
              </button>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {playlistInfo.images && playlistInfo.images[0] && (
                <Image
                  src={playlistInfo.images[0].url}
                  alt={playlistInfo.name}
                  width={150}
                  height={150}
                  className="h-[150px] w-[150px] rounded-xl object-cover shadow-[0_6px_18px_rgba(0,0,0,0.16)]"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="space-y-2">
                  {playlistInfo.external_urls?.spotify ? (
                    <a
                      href={playlistInfo.external_urls.spotify}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-2xl font-bold tracking-tight text-[#171923] hover:text-emerald-600"
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
                    <h1 className="text-2xl font-bold tracking-tight text-[#171923]">
                      {playlistInfo.name}
                    </h1>
                  )}
                  {playlistInfo.description && (
                    <p className="text-sm text-gray-600">
                      {stripHtmlTags(playlistInfo.description)}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                    {playlistInfo.owner.external_urls?.spotify ? (
                      <>
                        <span>By </span>
                        <a
                          href={playlistInfo.owner.external_urls.spotify}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-600 hover:text-emerald-700 hover:underline"
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
                        <span>|</span>
                      </>
                    ) : (
                      <>
                        <span>By {playlistInfo.owner.display_name}</span>
                        <span>|</span>
                      </>
                    )}
                    <span>{playlistInfo.tracks?.total ?? tracks.length} tracks</span>
                  </div>
                  {playlistInfo.external_urls?.spotify && (
                    <div className="flex flex-col items-start gap-2">
                      <a
                        href={playlistInfo.external_urls.spotify}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-fit items-center rounded-full bg-[#1ED760] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1BC457]"
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
                    </div>
                  )}
                </div>
              </div>
            </div>
            {bpmSummary && showBpmNotice && (
              <div className="mt-4 inline-flex items-start gap-2 rounded-full border border-amber-200/70 bg-amber-50/80 px-3 py-1 text-xs text-amber-700">
                <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 h-4 w-4">
                  <path
                    d="M10 2.5 18.5 17H1.5L10 2.5Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                  <path d="M10 7.5v4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <circle cx="10" cy="14.5" r="0.8" fill="currentColor" />
                </svg>
                <span>
                  {bpmSummary.shouldShowProgress
                    ? `BPM information processing (${bpmSummary.tracksRemainingToSearch} remaining).`
                    : bpmSummary.tracksWithNa > 0
                      ? `${bpmSummary.tracksWithNa} of ${bpmSummary.totalTracks} tracks missing BPM.`
                      : `All ${bpmSummary.totalTracks} tracks have BPM information.`}
                </span>
                <button
                  type="button"
                  onClick={() => setShowBpmMoreInfo(true)}
                  className="text-amber-700 underline-offset-2 hover:text-amber-900 hover:underline"
                >
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => setShowBpmNotice(false)}
                  className="text-amber-700 hover:text-amber-900"
                  aria-label="Dismiss notice"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search tracks... (Cmd/Ctrl+F)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              ref={searchInputRef}
              className="w-full rounded-lg bg-[#F3F4F6] py-3 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 underline py-1"
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced Filters
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs sm:text-sm text-gray-600">Per page</label>
            <select
              value={pageSize}
              onChange={(e) => {
                const value = e.target.value
                setPageSize(value === 'all' ? 'all' : Number(value))
              }}
              className="px-2 py-1 border border-gray-300 rounded text-gray-900 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="all">All</option>
            </select>
            {pageSize !== 'all' && (
              <div
                className={`flex items-center gap-2 ml-auto text-xs sm:text-sm text-gray-600 ${
                  totalPages <= 1 ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={safePage <= 1}
                  className="px-2 py-1 border border-gray-300 rounded disabled:text-gray-400 disabled:border-gray-200"
                >
                  Prev
                </button>
                <span>
                  Page {safePage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={safePage >= totalPages}
                  className="px-2 py-1 border border-gray-300 rounded disabled:text-gray-400 disabled:border-gray-200"
                >
                  Next
                </button>
              </div>
            )}
          </div>

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

        {/* Cached Data Indicator moved to header */}

        {/* Mobile Card View */}
        <div className="block sm:hidden space-y-3">
          {paginatedTracks.map((track, index) => (
            <div
              key={track.id}
              className={`bg-white rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.06)] p-4 cursor-pointer transition-colors ${
                playingTrackId === track.id
                  ? 'bg-emerald-50'
                  : 'hover:bg-[#F9FAFB]'
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
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-2">
                  <div className="text-gray-500 text-xs font-medium w-6 h-6 flex items-center justify-center">
                    {playingTrackId === track.id ? (
                      <svg className="w-4 h-4 text-green-600 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      pageSize === 'all'
                        ? index + 1
                        : (safePage - 1) * (pageSize as number) + index + 1
                    )}
                  </div>
                  {track.album.images && track.album.images[0] ? (
                    <Image
                      src={track.album.images[0].url}
                      alt={track.album.name}
                      width={56}
                      height={56}
                      className="w-14 h-14 object-cover rounded-xl flex-shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 bg-gray-200 rounded-xl flex-shrink-0 flex items-center justify-center">
                      <span className="text-gray-400 text-[10px]">No image</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href="#"
                      className="block truncate text-sm font-semibold text-[#171923] hover:text-emerald-600 hover:underline"
                      onClick={(e) => handleTrackTitleClick(e, track)}
                      onContextMenu={(e) => handleTrackContextMenu(e, track)}
                      title={getPreviewTooltip(track.id)}
                    >
                      {track.name}
                      {track.explicit && (
                        <span className="ml-1 text-[10px] bg-gray-200 text-gray-700 px-1 py-0.5 rounded">E</span>
                      )}
                    </a>
                    <button
                      type="button"
                      onClick={(e) => handleTrackContextMenu(e, track)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      aria-label="More options"
                    >
                      ...
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 truncate">
                    {track.artists.map((artist, index) => (
                      <span key={artist.id || index}>
                        {artist.external_urls?.spotify ? (
                          <a
                            href={artist.external_urls.spotify}
                            className="text-emerald-600 hover:text-emerald-700"
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
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-gray-400">
                    <span className="truncate">
                      {track.album.external_urls?.spotify ? (
                        <a
                          href={track.album.external_urls.spotify}
                          className="text-emerald-600 hover:text-emerald-700"
                          onClick={(e) => handleAlbumClick(e, track.album)}
                          onContextMenu={(e) => handleAlbumContextMenu(e, track.album)}
                        >
                          {track.album.name}
                        </a>
                      ) : (
                        <span>{track.album.name}</span>
                      )}
                    </span>
                    <span aria-hidden="true">•</span>
                    <span>{getYearString(track.album.release_date)}</span>
                    <span aria-hidden="true">•</span>
                    <span>{formatDuration(track.duration_ms)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    {loadingBpmFields.has(track.id) ? (
                      <span className="inline-flex w-16 items-center justify-center text-gray-400">
                        <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      </span>
                    ) : trackBpms[track.id] != null ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedBpmTrack(track)
                          setRetryStatus(null)
                          setShowBpmModal(true)
                        }}
                        className="inline-flex w-16 items-center justify-center rounded-full border border-blue-200 bg-transparent px-2.5 py-0.5 text-[11px] font-medium text-blue-700"
                      >
                        {Math.round(trackBpms[track.id]!)}
                      </button>
                    ) : (tracksNeedingBpm.has(track.id) || bpmStreamStatus[track.id] === 'error') ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedBpmTrack(track)
                          setShowBpmModal(true)
                        }}
                        className="inline-flex w-16 items-center justify-center rounded-full border border-amber-200 bg-transparent px-2.5 py-0.5 text-[11px] font-medium text-amber-700"
                      >
                        N/A
                      </button>
                    ) : track.tempo != null ? (
                      <span className="inline-flex w-16 items-center justify-center rounded-full border border-blue-200 bg-transparent px-2.5 py-0.5 text-[11px] font-medium text-blue-700">
                        {Math.round(track.tempo)}
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedBpmTrack(track)
                          setShowBpmModal(true)
                        }}
                        className="inline-flex w-16 items-center justify-center rounded-full border border-amber-200 bg-transparent px-2.5 py-0.5 text-[11px] font-medium text-amber-700"
                      >
                        N/A
                      </button>
                    )}
                    {(() => {
                      if (loadingKeyFields.has(track.id)) {
                        return (
                          <span className="inline-flex w-24 items-center justify-center text-gray-400">
                            <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          </span>
                        )
                      }
                      const key = trackKeys[track.id]
                      const scale = trackScales[track.id]
                      if (key || scale) {
                        return (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedBpmTrack(track)
                              setRetryStatus(null)
                              setRetryAttempted(false)
                              setShowBpmModal(true)
                            }}
                            className="inline-flex w-24 items-center justify-center rounded-full border border-slate-200 bg-transparent px-2.5 py-0.5 text-[11px] font-medium text-slate-700 whitespace-nowrap"
                          >
                            {key && scale ? `${key} ${scale}` : key || scale}
                          </button>
                        )
                      }
                      if (tracksNeedingKey.has(track.id) || bpmStreamStatus[track.id] === 'error') {
                        return (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedBpmTrack(track)
                              setRetryStatus(null)
                              setRetryAttempted(false)
                              setShowBpmModal(true)
                            }}
                            className="inline-flex w-24 items-center justify-center rounded-full border border-amber-200 bg-transparent px-2.5 py-0.5 text-[11px] font-medium text-amber-700"
                          >
                            N/A
                          </button>
                        )
                      }
                      return (
                        <span className="inline-flex w-24 items-center justify-center rounded-full border border-gray-200 bg-transparent px-2.5 py-0.5 text-[11px] font-medium text-gray-500">
                          -
                        </span>
                      )
                    })()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block overflow-hidden rounded-2xl bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06)] border-t border-gray-100">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/70">
                <tr>
                  <th className="px-3 lg:px-4 py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] w-12">
                    #
                  </th>
                  <th
                    className="px-3 lg:px-4 py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] w-12 lg:w-16"
                    aria-label="Cover"
                  >
                  </th>
                  <th
                    className="px-3 lg:px-4 py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] cursor-pointer hover:text-gray-700 select-none"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center">
                      Track
                      <SortIcon field="name" />
                    </div>
                  </th>
                  <th
                    className="px-3 lg:px-4 py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] cursor-pointer hover:text-gray-700 select-none hidden md:table-cell max-w-[120px]"
                    onClick={() => handleSort('artists')}
                  >
                    <div className="flex items-center">
                      Artist
                      <SortIcon field="artists" />
                    </div>
                  </th>
                  <th
                    className="px-3 lg:px-4 py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] cursor-pointer hover:text-gray-700 select-none hidden lg:table-cell max-w-[150px]"
                    onClick={() => handleSort('album')}
                  >
                    <div className="flex items-center">
                      Album
                      <SortIcon field="album" />
                    </div>
                  </th>
                  <th
                    className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] cursor-pointer hover:text-gray-700 select-none hidden md:table-cell"
                    onClick={() => handleSort('duration')}
                  >
                    <div className="flex items-center justify-end">
                      Duration
                      <SortIcon field="duration" />
                    </div>
                  </th>
                  <th
                    className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] cursor-pointer hover:text-gray-700 select-none hidden md:table-cell"
                    onClick={() => handleSort('tempo')}
                  >
                    <div className="flex items-center justify-end">
                      BPM
                      <SortIcon field="tempo" />
                    </div>
                  </th>
                  <th className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] hidden md:table-cell min-w-[96px]">
                    Key
                  </th>
                  <th
                    className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] cursor-pointer hover:text-gray-700 select-none"
                    onClick={() => handleSort('release_date')}
                  >
                    <div className="flex items-center justify-end">
                      Year
                      <SortIcon field="release_date" />
                    </div>
                  </th>
                  <th
                    className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] cursor-pointer hover:text-gray-700 select-none hidden lg:table-cell"
                    onClick={() => handleSort('popularity')}
                  >
                    <div className="flex items-center justify-end">
                      Popularity
                      <SortIcon field="popularity" />
                    </div>
                  </th>
                  <th
                    className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] cursor-pointer hover:text-gray-700 select-none hidden lg:table-cell"
                    onClick={() => handleSort('added_at')}
                  >
                    <div className="flex items-center justify-end">
                      Added
                      <SortIcon field="added_at" />
                    </div>
                  </th>
                  <th className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0]">
                    <span className="sr-only">Options</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTracks.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                      {(searchQuery || yearFrom || yearTo || bpmFrom || bpmTo) ? 'No tracks match your filters' : 'No tracks found'}
                    </td>
                  </tr>
                ) : (
                  paginatedTracks.map((track, index) => (
                    <tr 
                      key={track.id} 
                      className={`group transition-colors cursor-pointer ${
                        playingTrackId === track.id
                          ? 'bg-emerald-50 hover:bg-emerald-100'
                          : 'hover:bg-[#F9FAFB]'
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
                      <td className="px-3 lg:px-4 py-4 text-gray-400 text-xs sm:text-sm">
                        <div className="flex items-center justify-center">
                          {playingTrackId === track.id ? (
                            <svg className="w-4 h-4 text-green-600 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            pageSize === 'all'
                              ? index + 1
                              : (safePage - 1) * (pageSize as number) + index + 1
                          )}
                        </div>
                      </td>
                      <td className="px-3 lg:px-4 py-4">
                        {track.album.images && track.album.images[0] ? (
                          <Image
                            src={track.album.images[0].url}
                            alt={track.album.name}
                            width={40}
                            height={40}
                            className="w-8 h-8 sm:w-10 sm:h-10 object-cover rounded-xl flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 rounded-xl flex-shrink-0 flex items-center justify-center">
                            <span className="text-gray-400 text-xs">No image</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 lg:px-4 py-4">
                        <div className="flex items-center gap-2">
                          <a
                            href="#"
                            className="font-semibold text-[#171923] text-xs sm:text-sm hover:text-emerald-600 hover:underline"
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
                      <td className="px-3 lg:px-4 py-4 text-gray-500 text-xs sm:text-sm hidden md:table-cell max-w-[120px] truncate" title={track.artists.map(a => a.name).join(', ')}>
                        {track.artists.map((artist, index) => (
                          <span key={artist.id || index}>
                            {artist.external_urls?.spotify ? (
                              <a
                                href={artist.external_urls.spotify}
                                className="text-emerald-600 hover:text-emerald-700 hover:underline"
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
                      <td className="px-3 lg:px-4 py-4 text-gray-500 text-xs sm:text-sm hidden lg:table-cell max-w-[150px] truncate" title={track.album.name}>
                        {track.album.external_urls?.spotify ? (
                          <a
                            href={track.album.external_urls.spotify}
                            className="text-emerald-600 hover:text-emerald-700 hover:underline"
                            onClick={(e) => handleAlbumClick(e, track.album)}
                            onContextMenu={(e) => handleAlbumContextMenu(e, track.album)}
                          >
                            {track.album.name}
                          </a>
                        ) : (
                          <span>{track.album.name}</span>
                        )}
                      </td>
                      <td className="px-3 lg:px-4 py-4 text-gray-500 text-xs sm:text-sm hidden md:table-cell text-right">
                        {formatDuration(track.duration_ms)}
                      </td>
                      <td className="px-3 lg:px-4 py-4 text-xs sm:text-sm hidden md:table-cell text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end">
                          {loadingBpmFields.has(track.id) ? (
                            <div className="flex w-16 items-center justify-end gap-1 text-gray-400">
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
                                className="inline-flex w-16 items-center justify-center rounded-full border border-blue-200 bg-transparent px-2.5 py-1 text-xs font-medium text-blue-700"
                                title="Click for BPM details"
                              >
                                {Math.round(trackBpms[track.id]!)}
                                {bpmStreamStatus[track.id] === 'partial' && (
                                  <span className="ml-1 text-[10px] text-blue-600">partial</span>
                                )}
                              </button>
                            )
                            : (tracksNeedingBpm.has(track.id) || bpmStreamStatus[track.id] === 'error')
                              ? (
                                <button
                                  onClick={() => {
                                    setSelectedBpmTrack(track)
                                    setRetryStatus(null)
                                    setRetryAttempted(false)
                                    setShowBpmModal(true)
                                  }}
                                  className="inline-flex w-16 items-center justify-center rounded-full border border-amber-200 bg-transparent px-2.5 py-1 text-xs font-medium text-amber-700"
                                  title="Click to see why BPM is not available"
                                >
                                  N/A
                                </button>
                              )
                              : track.tempo != null
                                ? (
                                  <span className="inline-flex w-16 items-center justify-center rounded-full border border-blue-200 bg-transparent px-2.5 py-1 text-xs font-medium text-blue-700">
                                    {Math.round(track.tempo)}
                                  </span>
                                )
                                : (
                                  <button
                                    onClick={() => {
                                      setSelectedBpmTrack(track)
                                      setRetryStatus(null)
                                      setRetryAttempted(false)
                                      setShowBpmModal(true)
                                    }}
                                    className="inline-flex w-16 items-center justify-center rounded-full border border-amber-200 bg-transparent px-2.5 py-1 text-xs font-medium text-amber-700"
                                    title="Click to see why BPM is not available"
                                  >
                                    N/A
                                  </button>
                                )}
                        </div>
                      </td>
                      <td className="px-3 lg:px-4 py-4 text-xs sm:text-sm hidden md:table-cell whitespace-nowrap min-w-[96px] text-right">
                        <div className="flex justify-end">
                          {(() => {
                            if (loadingKeyFields.has(track.id)) {
                              return (
                                <span className="inline-flex w-24 items-center justify-center gap-1 text-gray-400">
                                  <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  <span>...</span>
                                </span>
                              )
                            }
                            const key = trackKeys[track.id]
                            const scale = trackScales[track.id]
                            if (key || scale) {
                              return (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedBpmTrack(track)
                                    setRetryStatus(null)
                                    setRetryAttempted(false)
                                    setShowBpmModal(true)
                                  }}
                                  className="inline-flex w-24 items-center justify-center rounded-full border border-slate-200 bg-transparent px-2.5 py-1 text-xs font-medium text-slate-700 whitespace-nowrap"
                                >
                                  {key && scale ? `${key} ${scale}` : key || scale}
                                </button>
                              )
                            }
                            if (tracksNeedingKey.has(track.id) || bpmStreamStatus[track.id] === 'error') {
                              return (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedBpmTrack(track)
                                    setRetryStatus(null)
                                    setRetryAttempted(false)
                                    setShowBpmModal(true)
                                  }}
                                  className="inline-flex w-24 items-center justify-center rounded-full border border-amber-200 bg-transparent px-2.5 py-1 text-xs font-medium text-amber-700"
                                >
                                  N/A
                                </button>
                              )
                            }
                            return (
                              <span className="inline-flex w-24 items-center justify-center rounded-full border border-gray-200 bg-transparent px-2.5 py-1 text-xs font-medium text-gray-500">
                                -
                              </span>
                            )
                          })()}
                        </div>
                      </td>
                      <td className="px-3 lg:px-4 py-4 text-gray-500 text-xs sm:text-sm text-right">
                        {getYearString(track.album.release_date)}
                      </td>
                      <td className="px-3 lg:px-4 py-4 text-gray-500 text-xs sm:text-sm text-right hidden lg:table-cell">
                        {track.popularity != null ? track.popularity : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-3 lg:px-4 py-4 text-gray-500 text-xs sm:text-sm text-right hidden lg:table-cell">
                        {track.added_at ? formatDate(track.added_at) : 'N/A'}
                      </td>
                      <td className="px-3 lg:px-4 py-4 text-right">
                        <button
                          type="button"
                          className="opacity-0 transition-opacity text-gray-400 hover:text-gray-600 group-hover:opacity-100"
                          onClick={(e) => handleTrackContextMenu(e, track)}
                          aria-label="More options"
                        >
                          ...
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-4 text-xs sm:text-sm text-gray-600">
          Showing {paginatedTracks.length} of {tracks.length} tracks
        </div>
        {pageSize !== 'all' && (
          <div
            className={`mt-3 flex items-center justify-end gap-2 text-xs sm:text-sm text-gray-600 ${
              totalPages <= 1 ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={safePage <= 1}
              className="px-2 py-1 border border-gray-300 rounded disabled:text-gray-400 disabled:border-gray-200"
            >
              Prev
            </button>
            <span>
              Page {safePage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safePage >= totalPages}
              className="px-2 py-1 border border-gray-300 rounded disabled:text-gray-400 disabled:border-gray-200"
            >
              Next
            </button>
          </div>
        )}
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
      {bpmModalData && selectedBpmTrack && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => {
              setShowBpmModal(false)
              setRetryStatus(null)
              setRetryAttempted(false)
              setRetryTrackId(null)
              setManualBpm('')
              setManualKey('')
              setManualScale('major')
            }}
          >
            <div 
              className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">BPM & Key Information</h2>
                <button
                  onClick={() => {
                    setShowBpmModal(false)
                    setRetryStatus(null)
                    setRetryAttempted(false)
                    setRetryTrackId(null)
                    setManualBpm('')
                    setManualKey('')
                    setManualScale('major')
                  }}
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
                {bpmStreamStatus[bpmModalData.trackId] === 'partial' && (
                  <div className="mt-2 inline-flex items-center text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-1 rounded">
                    Partial results streaming...
                  </div>
                )}
                <div className="mt-2">
                  <button
                    onClick={async () => {
                      if (!selectedBpmTrack) return
                      setRecalcStatus({ loading: true })
                      try {
                        await fetch('/api/bpm/recalculate', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ trackIds: [bpmModalData.trackId] }),
                        })
                        const targetIds = new Set([bpmModalData.trackId])
                        streamBpmsForTracks([selectedBpmTrack], targetIds, targetIds)
                        setRecalcStatus({ loading: false, success: true })
                      } catch (error) {
                        setRecalcStatus({
                          loading: false,
                          success: false,
                          error: error instanceof Error ? error.message : 'Failed to recalculate BPM/key',
                        })
                      }
                    }}
                    disabled={recalcStatus?.loading}
                    className="bg-gray-200 hover:bg-gray-300 disabled:bg-gray-200 disabled:text-gray-400 text-gray-800 text-xs font-semibold py-1.5 px-3 rounded"
                  >
                    {recalcStatus?.loading ? 'Recalculating...' : 'Recalculate BPM/Key'}
                  </button>
                  {recalcStatus?.error && (
                    <div className="mt-1 text-xs text-red-600">{recalcStatus.error}</div>
                  )}
                </div>
              </div>

              {!bpmModalData.hasEssentiaBpm && !bpmModalData.hasLibrosaBpm && bpmModalData.currentBpm == null ? (
                // No BPM data available
                <div className="space-y-3">
                  <div>
                    <span className="font-semibold text-gray-700">BPM: </span>
                    <span className="text-gray-600">Not available</span>
                  </div>
                  {bpmDetails[bpmModalData.trackId]?.error ? (
                    <div>
                      <span className="font-semibold text-gray-700">Reason: </span>
                      <span className="text-gray-600">{bpmDetails[bpmModalData.trackId].error}</span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-gray-600 text-sm">
                        BPM data is being calculated or no preview audio is available for this track.
                      </span>
                    </div>
                  )}
                  {loadingBpmFields.has(bpmModalData.trackId) && trackBpms[bpmModalData.trackId] == null && (
                    <div className="text-xs text-gray-500">
                      Waiting for first partial result...
                    </div>
                  )}
                  {trackBpms[bpmModalData.trackId] == null && !retryAttempted && (
                    <button
                      onClick={() => {
                        if (!selectedBpmTrack) return
                        setRetryStatus({ loading: true })
                        setRetryAttempted(true)
                        setRetryTrackId(bpmModalData.trackId)
                        const targetIds = new Set([bpmModalData.trackId])
                        streamBpmsForTracks([selectedBpmTrack], targetIds, targetIds)
                      }}
                      disabled={retryStatus?.loading}
                      className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded transition-colors"
                    >
                      {retryStatus?.loading ? 'Retrying...' : 'Retry'}
                    </button>
                  )}
                </div>
              ) : (
                // Show BPM and Key data with switching and manual override
                <div className="space-y-6">
                  {/* BPM Section */}
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3">BPM</h4>
                    <div className="space-y-3">
                      {/* Essentia BPM */}
                      {bpmModalData.hasEssentiaBpm && (
                        <div className={`p-3 rounded border-2 ${bpmModalData.bpmSelected === 'essentia' ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-700">Essentia:</span>
                                <span className="text-gray-900">{bpmModalData.fullData?.bpmEssentia != null ? Math.round(bpmModalData.fullData.bpmEssentia) : 'N/A'}</span>
                                {bpmModalData.fullData?.bpmConfidenceEssentia != null && (
                                  <span className="text-xs text-gray-500">
                                    (confidence: {(bpmModalData.fullData.bpmConfidenceEssentia * 100).toFixed(0)}%)
                                  </span>
                                )}
                              </div>
                              {typeof bpmModalData.fullData?.bpmRawEssentia === 'number' && bpmModalData.fullData.bpmRawEssentia !== bpmModalData.fullData.bpmEssentia && (
                                <div className="text-xs text-gray-500 mt-1">
                                  Raw: {bpmModalData.fullData.bpmRawEssentia.toFixed(1)}
                                </div>
                              )}
                            </div>
                            {bpmModalData.bpmSelected === 'essentia' && (
                              <span className="text-xs bg-green-500 text-white px-2 py-1 rounded font-semibold">Selected</span>
                            )}
                            {bpmModalData.bpmSelected !== 'essentia' && bpmModalData.hasLibrosaBpm && (
                              <button
                                onClick={async () => {
                                  setIsUpdatingSelection(true)
                                  try {
                                    const res = await fetch('/api/bpm/update-selection', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        spotifyTrackId: bpmModalData.trackId,
                                        bpmSelected: 'essentia',
                                      }),
                                    })
                                    if (res.ok) {
                                      // Refresh BPM data
                                      await fetchBpmsBatch()
                                    }
                                  } finally {
                                    setIsUpdatingSelection(false)
                                  }
                                }}
                                disabled={isUpdatingSelection}
                                className="text-xs bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-2 py-1 rounded transition-colors"
                              >
                                Use This
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Librosa BPM */}
                      {bpmModalData.hasLibrosaBpm && (
                        <div className={`p-3 rounded border-2 ${bpmModalData.bpmSelected === 'librosa' ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-700">Librosa:</span>
                                <span className="text-gray-900">{bpmModalData.fullData?.bpmLibrosa != null ? Math.round(bpmModalData.fullData.bpmLibrosa) : 'N/A'}</span>
                                {bpmModalData.fullData?.bpmConfidenceLibrosa != null && (
                                  <span className="text-xs text-gray-500">
                                    (confidence: {(bpmModalData.fullData.bpmConfidenceLibrosa * 100).toFixed(0)}%)
                                  </span>
                                )}
                              </div>
                              {typeof bpmModalData.fullData?.bpmRawLibrosa === 'number' && bpmModalData.fullData.bpmRawLibrosa !== bpmModalData.fullData.bpmLibrosa && (
                                <div className="text-xs text-gray-500 mt-1">
                                  Raw: {bpmModalData.fullData.bpmRawLibrosa.toFixed(1)}
                                </div>
                              )}
                            </div>
                            {bpmModalData.bpmSelected === 'librosa' && (
                              <span className="text-xs bg-green-500 text-white px-2 py-1 rounded font-semibold">Selected</span>
                            )}
                            {bpmModalData.bpmSelected !== 'librosa' && (
                              <button
                                onClick={async () => {
                                  setIsUpdatingSelection(true)
                                  try {
                                    const res = await fetch('/api/bpm/update-selection', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        spotifyTrackId: bpmModalData.trackId,
                                        bpmSelected: 'librosa',
                                      }),
                                    })
                                    if (res.ok) {
                                      await fetchBpmsBatch()
                                    }
                                  } finally {
                                    setIsUpdatingSelection(false)
                                  }
                                }}
                                disabled={isUpdatingSelection}
                                className="text-xs bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-2 py-1 rounded transition-colors"
                              >
                                Use This
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Manual BPM Override */}
                      <div className={`p-3 rounded border-2 ${bpmModalData.bpmSelected === 'manual' ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-gray-700">Manual Override:</span>
                          {bpmModalData.bpmSelected === 'manual' && bpmModalData.fullData?.bpmManual != null && (
                            <span className="text-xs bg-green-500 text-white px-2 py-1 rounded font-semibold">Selected: {Math.round(bpmModalData.fullData.bpmManual)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={manualBpm || bpmModalData.fullData?.bpmManual || ''}
                            onChange={(e) => setManualBpm(e.target.value)}
                            placeholder="Enter BPM"
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                            min="1"
                            max="300"
                          />
                          <button
                            onClick={async () => {
                              const bpmValue = parseFloat(manualBpm || String(bpmModalData.fullData?.bpmManual || ''))
                              if (isNaN(bpmValue) || bpmValue < 1 || bpmValue > 300) {
                                alert('Please enter a valid BPM between 1 and 300')
                                return
                              }
                              setIsUpdatingSelection(true)
                              try {
                                const res = await fetch('/api/bpm/update-selection', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    spotifyTrackId: bpmModalData.trackId,
                                    bpmSelected: 'manual',
                                    bpmManual: bpmValue,
                                  }),
                                })
                                if (res.ok) {
                                  await fetchBpmsBatch()
                                  setManualBpm('')
                                }
                              } finally {
                                setIsUpdatingSelection(false)
                              }
                            }}
                            disabled={isUpdatingSelection || (!manualBpm && !bpmModalData.fullData?.bpmManual)}
                            className="text-xs bg-purple-500 hover:bg-purple-600 disabled:bg-purple-300 text-white px-3 py-1 rounded transition-colors"
                          >
                            {isUpdatingSelection ? 'Saving...' : 'Save Manual'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Key/Scale Section */}
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3">Key & Scale</h4>
                    <div className="space-y-3">
                      {/* Essentia Key */}
                      {bpmModalData.hasEssentiaKey && (
                        <div className={`p-3 rounded border-2 ${bpmModalData.keySelected === 'essentia' ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-700">Essentia:</span>
                                <span className="text-gray-900">
                                  {bpmModalData.fullData?.keyEssentia || 'N/A'} {bpmModalData.fullData?.scaleEssentia || ''}
                                </span>
                                {bpmModalData.fullData?.keyscaleConfidenceEssentia != null && (
                                  <span className="text-xs text-gray-500">
                                    (confidence: {(bpmModalData.fullData.keyscaleConfidenceEssentia * 100).toFixed(0)}%)
                                  </span>
                                )}
                              </div>
                            </div>
                            {bpmModalData.keySelected === 'essentia' && (
                              <span className="text-xs bg-green-500 text-white px-2 py-1 rounded font-semibold">Selected</span>
                            )}
                            {bpmModalData.keySelected !== 'essentia' && bpmModalData.hasLibrosaKey && (
                              <button
                                onClick={async () => {
                                  setIsUpdatingSelection(true)
                                  try {
                                    const res = await fetch('/api/bpm/update-selection', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        spotifyTrackId: bpmModalData.trackId,
                                        keySelected: 'essentia',
                                      }),
                                    })
                                    if (res.ok) {
                                      await fetchBpmsBatch()
                                    }
                                  } finally {
                                    setIsUpdatingSelection(false)
                                  }
                                }}
                                disabled={isUpdatingSelection}
                                className="text-xs bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-2 py-1 rounded transition-colors"
                              >
                                Use This
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Librosa Key */}
                      {bpmModalData.hasLibrosaKey && (
                        <div className={`p-3 rounded border-2 ${bpmModalData.keySelected === 'librosa' ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-700">Librosa:</span>
                                <span className="text-gray-900">
                                  {bpmModalData.fullData?.keyLibrosa || 'N/A'} {bpmModalData.fullData?.scaleLibrosa || ''}
                                </span>
                                {bpmModalData.fullData?.keyscaleConfidenceLibrosa != null && (
                                  <span className="text-xs text-gray-500">
                                    (confidence: {(bpmModalData.fullData.keyscaleConfidenceLibrosa * 100).toFixed(0)}%)
                                  </span>
                                )}
                              </div>
                            </div>
                            {bpmModalData.keySelected === 'librosa' && (
                              <span className="text-xs bg-green-500 text-white px-2 py-1 rounded font-semibold">Selected</span>
                            )}
                            {bpmModalData.keySelected !== 'librosa' && (
                              <button
                                onClick={async () => {
                                  setIsUpdatingSelection(true)
                                  try {
                                    const res = await fetch('/api/bpm/update-selection', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        spotifyTrackId: bpmModalData.trackId,
                                        keySelected: 'librosa',
                                      }),
                                    })
                                    if (res.ok) {
                                      await fetchBpmsBatch()
                                    }
                                  } finally {
                                    setIsUpdatingSelection(false)
                                  }
                                }}
                                disabled={isUpdatingSelection}
                                className="text-xs bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-2 py-1 rounded transition-colors"
                              >
                                Use This
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Manual Key Override */}
                      <div className={`p-3 rounded border-2 ${bpmModalData.keySelected === 'manual' ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-gray-700">Manual Override:</span>
                          {bpmModalData.keySelected === 'manual' && bpmModalData.fullData?.keyManual && (
                            <span className="text-xs bg-green-500 text-white px-2 py-1 rounded font-semibold">
                              Selected: {bpmModalData.fullData.keyManual} {bpmModalData.fullData.scaleManual}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={manualKey || bpmModalData.fullData?.keyManual || ''}
                            onChange={(e) => setManualKey(e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            <option value="">Select Key</option>
                            {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map(k => (
                              <option key={k} value={k}>{k}</option>
                            ))}
                          </select>
                            <select
                              value={manualScale || bpmModalData.fullData?.scaleManual || 'major'}
                            onChange={(e) => setManualScale(e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            <option value="major">Major</option>
                            <option value="minor">Minor</option>
                          </select>
                          <button
                            onClick={async () => {
                              const key = manualKey || bpmModalData.fullData?.keyManual
                              const scale = manualScale || bpmModalData.fullData?.scaleManual || 'major'
                              if (!key) {
                                alert('Please select a key')
                                return
                              }
                              setIsUpdatingSelection(true)
                              try {
                                const res = await fetch('/api/bpm/update-selection', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    spotifyTrackId: bpmModalData.trackId,
                                    keySelected: 'manual',
                                    keyManual: key,
                                    scaleManual: scale,
                                  }),
                                })
                                if (res.ok) {
                                  await fetchBpmsBatch()
                                  setManualKey('')
                                  setManualScale('major')
                                }
                              } finally {
                                setIsUpdatingSelection(false)
                              }
                            }}
                            disabled={isUpdatingSelection || (!manualKey && !bpmModalData.fullData?.keyManual)}
                            className="text-xs bg-purple-500 hover:bg-purple-600 disabled:bg-purple-300 text-white px-3 py-1 rounded transition-colors"
                          >
                            {isUpdatingSelection ? 'Saving...' : 'Save Manual'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Status Messages */}
                  {retryStatus && (
                    <div className={`p-3 rounded text-sm ${
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
                  
                  {isUpdatingSelection && (
                    <div className="p-3 rounded text-sm bg-blue-50 text-blue-700">
                      Updating selection...
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => {
                    setShowBpmModal(false)
                    setRetryStatus(null)
                    setRetryAttempted(false)
                    setRetryTrackId(null)
                    setManualBpm('')
                    setManualKey('')
                    setManualScale('major')
                  }}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
      )}

      {/* Credits Modal */}
      {showCreditsModal && selectedCreditsTrack && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowCreditsModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Song Credits</h2>
              <button
                onClick={() => setShowCreditsModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="mb-4">
              <h3 className="font-semibold text-gray-900">{selectedCreditsTrack.name}</h3>
              <p className="text-sm text-gray-600">
                {selectedCreditsTrack.artists.map(a => a.name).join(', ')}
              </p>
              {creditsByTrackId[selectedCreditsTrack.id]?.releaseId && (
                <a
                  href={`https://musicbrainz.org/release/${encodeURIComponent(creditsByTrackId[selectedCreditsTrack.id].releaseId as string)}`}
                  className="text-xs text-gray-500 hover:text-gray-600"
                  target="_blank"
                  rel="noreferrer"
                >
                  View on MusicBrainz
                </a>
              )}
            </div>
            {creditsLoadingIds.has(selectedCreditsTrack.id) ? (
              <div className="text-sm text-gray-600">Loading credits...</div>
            ) : creditsErrorByTrackId[selectedCreditsTrack.id] ? (
              <div className="text-sm text-red-600">{creditsErrorByTrackId[selectedCreditsTrack.id]}</div>
            ) : (
              <div className="space-y-4 text-sm text-gray-700">
                <div>
                  <div className="font-semibold text-gray-900">Performed by</div>
                  {creditsByTrackId[selectedCreditsTrack.id]?.performedBy?.length ? (
                    <div>{creditsByTrackId[selectedCreditsTrack.id].performedBy.join(', ')}</div>
                  ) : (
                    <div className="text-gray-400">Not available</div>
                  )}
                </div>
                <div>
                  <div className="font-semibold text-gray-900">Written by</div>
                  {creditsByTrackId[selectedCreditsTrack.id]?.writtenBy?.length ? (
                    <div>{creditsByTrackId[selectedCreditsTrack.id].writtenBy.join(', ')}</div>
                  ) : (
                    <div className="text-gray-400">Not available</div>
                  )}
                </div>
                <div>
                  <div className="font-semibold text-gray-900">Produced by</div>
                  {creditsByTrackId[selectedCreditsTrack.id]?.producedBy?.length ? (
                    <div>{creditsByTrackId[selectedCreditsTrack.id].producedBy.join(', ')}</div>
                  ) : (
                    <div className="text-gray-400">Not available</div>
                  )}
                </div>
                <div>
                  <div className="font-semibold text-gray-900">Mixed by</div>
                  {creditsByTrackId[selectedCreditsTrack.id]?.mixedBy?.length ? (
                    <div>{creditsByTrackId[selectedCreditsTrack.id].mixedBy.join(', ')}</div>
                  ) : (
                    <div className="text-gray-400">Not available</div>
                  )}
                </div>
                <div>
                  <div className="font-semibold text-gray-900">Mastered by</div>
                  {creditsByTrackId[selectedCreditsTrack.id]?.masteredBy?.length ? (
                    <div>{creditsByTrackId[selectedCreditsTrack.id].masteredBy.join(', ')}</div>
                  ) : (
                    <div className="text-gray-400">Not available</div>
                  )}
                </div>
              </div>
            )}
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowCreditsModal(false)}
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

      {showBpmRecalcPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
          onClick={() => setShowBpmRecalcPrompt(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#171923]">Recalculate BPM & Key?</h2>
              <button
                onClick={() => setShowBpmRecalcPrompt(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Choose whether to recalculate only new tracks or every track in this playlist.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => triggerRecalculateTracks(pendingRecalcIds.all)}
                className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300 hover:text-gray-900"
                disabled={recalculating}
              >
                All tracks
              </button>
              <button
                onClick={() => triggerRecalculateTracks(pendingRecalcIds.newOnly)}
                className="rounded-full bg-[#18B45A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#149A4C]"
                disabled={recalculating}
              >
                Only new tracks
              </button>
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
          {contextMenu.track ? (
            <button
              onClick={() => {
                fetchCreditsForTrack(contextMenu.track as Track)
                setContextMenu(null)
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              Show credits
            </button>
          ) : null}
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
        </a>{' '}and{' '}
        <a href="https://musicbrainz.org" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
          Musicbrainz
        </a>
        .
      </footer>
    </div>
  )
}
