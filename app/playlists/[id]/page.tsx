'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import type { MouseEvent } from 'react'
import Link from 'next/link'
import PageHeader from '../../components/PageHeader'
import { TrackTableSkeleton } from '../../components/SkeletonLoader'
import PlaylistHeader from './components/PlaylistHeader'
import FilterControls from './components/FilterControls'
import TrackTable from './components/TrackTable'
import TrackCardList from './components/TrackCardList'
import BpmDetailsModal from './components/BpmDetailsModal'
import CreditsModal from './components/CreditsModal'
import { usePlaylist, useRefreshPlaylist } from '../../hooks/usePlaylist'
import { usePlaylistTracks, useRefreshPlaylistTracks } from '../../hooks/usePlaylistTracks'
import { useQueryClient } from '@tanstack/react-query'
import type { 
  SpotifyTrack, 
  SortField, 
  SortDirection,
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
type BpmFallbackOverride = 'never' | 'always' | 'bpm_only' | 'key_only' | 'default'

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
  const [bpmDebugLevel, setBpmDebugLevel] = useState('minimal')
  const [bpmFallbackOverride, setBpmFallbackOverride] = useState<BpmFallbackOverride>('never')
  const [bpmConfidenceThreshold, setBpmConfidenceThreshold] = useState('0.65')
  const [bpmDebugInfo, setBpmDebugInfo] = useState<Record<string, any>>({})
  const [bpmDetails, setBpmDetails] = useState<Record<string, { source?: string; error?: string }>>({})
  const [musoPreviewStatus, setMusoPreviewStatus] = useState<{ loading: boolean; success?: boolean; error?: string } | null>(null)
  const [mismatchPreviewUrls, setMismatchPreviewUrls] = useState<{ itunes?: string | null; spotify?: string | null; loading?: boolean }>({})
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
  const [showBpmModalDebug, setShowBpmModalDebug] = useState(false)
  const [recalcMode, setRecalcMode] = useState<'standard' | 'force' | 'fallback'>('standard')
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
        retrievedAt?: string | null
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
  useEffect(() => {
    setMusoPreviewStatus(null)
  }, [showBpmModal, selectedBpmTrack])
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
  const bpmRequestCache = useRef<Map<string, Promise<any>>>(new Map())
  
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

  const fetchBpmForTrack = useCallback(async (trackId: string, country?: string) => {
    const key = `${trackId}:${country || ''}`
    const existing = bpmRequestCache.current.get(key)
    if (existing) {
      return existing
    }
    const url = `/api/bpm?spotifyTrackId=${encodeURIComponent(trackId)}${country ? `&country=${encodeURIComponent(country)}` : ''}`
    const request = fetch(url, { method: 'GET' }).then(async (res) => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      return res.json()
    })
    bpmRequestCache.current.set(key, request)
    try {
      return await request
    } finally {
      bpmRequestCache.current.delete(key)
    }
  }, [])

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
          window.location.href = '/api/auth/login'
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

  const creditsRoleMap = {
    performedBy: 'artist',
    writtenBy: 'songwriter',
    producedBy: 'producer',
    mixedBy: 'mixer',
    masteredBy: 'engineer',
  } as const

  const creditsSearchHref = (name: string, role: string) => ({
    pathname: '/credits',
    query: { name, role },
  })

  const renderCreditLinks = (names: string[], role: string) =>
    names.map((person, index) => (
      <span key={`${role}-${person}-${index}`}>
        <Link
          href={creditsSearchHref(person, role)}
          className="text-green-600 hover:text-green-700 hover:underline"
        >
          {person}
        </Link>
        {index < names.length - 1 ? ', ' : ''}
      </span>
    ))

  const formatRetrievedMonthYear = (value?: string | null) => {
    if (!value) return 'Unknown'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Unknown'
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`
  }

  const closeBpmModal = useCallback(() => {
    setShowBpmModal(false)
    setRetryStatus(null)
    setRetryAttempted(false)
    setRetryTrackId(null)
    setManualBpm('')
    setManualKey('')
    setManualScale('major')
    setMusoPreviewStatus(null)
    setMismatchPreviewUrls({})
    setShowBpmModalDebug(false)
    setRecalcMode('standard')
  }, [])

  const closeCreditsModal = useCallback(() => {
    setShowCreditsModal(false)
  }, [])

  const updateBpmSelection = async (payload: {
    spotifyTrackId: string
    bpmSelected?: 'essentia' | 'librosa' | 'manual'
    keySelected?: 'essentia' | 'librosa' | 'manual'
    bpmManual?: number
    keyManual?: string
    scaleManual?: string
  }) => {
    setIsUpdatingSelection(true)
    try {
      const res = await fetch('/api/bpm/update-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        await fetchBpmsBatch()
      }
    } finally {
      setIsUpdatingSelection(false)
    }
  }

  const recalcTrackWithOptions = async (
    track: Track,
    options?: { fallbackOverride?: BpmFallbackOverride }
  ) => {
    setRecalcStatus({ loading: true })
    try {
      await fetch('/api/bpm/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds: [track.id] }),
      })
      const targetIds = new Set([track.id])
      streamBpmsForTracks([track], targetIds, targetIds, options)
      setRecalcStatus({ loading: false, success: true })
    } catch (error) {
      setRecalcStatus({
        loading: false,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to recalculate BPM/key',
      })
    }
  }

  useEffect(() => {
    if (!showBpmModal && !showCreditsModal) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showBpmModal) {
          closeBpmModal()
        }
        if (showCreditsModal) {
          closeCreditsModal()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showBpmModal, showCreditsModal, closeBpmModal, closeCreditsModal])

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

  const bpmRequestSettings = useMemo(() => {
    const parsedConfidence = Number.parseFloat(bpmConfidenceThreshold)
    const maxConfidence = Number.isFinite(parsedConfidence)
      ? Math.min(Math.max(parsedConfidence, 0), 1)
      : 0.65
    const debugLevel = bpmDebugLevel.trim() ? bpmDebugLevel.trim() : 'minimal'
    const fallbackOverride = bpmFallbackOverride === 'default' ? undefined : bpmFallbackOverride
    return {
      debugLevel,
      maxConfidence,
      fallbackOverride,
    }
  }, [bpmConfidenceThreshold, bpmDebugLevel, bpmFallbackOverride])

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
    needsKey?: Set<string>,
    options?: { fallbackOverride?: BpmFallbackOverride }
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
        const overrideFallback = options?.fallbackOverride
        const effectiveFallbackOverride = overrideFallback && overrideFallback !== 'default'
          ? overrideFallback
          : bpmRequestSettings.fallbackOverride
        const requestBody: Record<string, unknown> = {
          trackIds,
          country: countryCode,
          debug_level: bpmRequestSettings.debugLevel,
          max_confidence: bpmRequestSettings.maxConfidence,
        }
        if (effectiveFallbackOverride) {
          requestBody.fallback_override = effectiveFallbackOverride
        }

        const res = await fetch('/api/bpm/stream-batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
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
            const data = await fetchBpmForTrack(track.id, countryCode)
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
            fetchBpmForTrack(trackId)
              .then((data) => ({ trackId, data }))
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

  const handleMusoPreviewBpm = async (trackId: string) => {
    setMusoPreviewStatus({ loading: true })
    try {
      const res = await fetch('/api/bpm/muso-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotifyTrackId: trackId }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to calculate BPM from Muso preview')
      }
      const previewUrl = getPreviewUrlFromMeta({ urls: payload.urls })
      if (previewUrl) {
        setPreviewUrls((prev) => ({ ...prev, [trackId]: previewUrl }))
      }
      await fetchBpmsBatch()
      setMusoPreviewStatus({ loading: false, success: true })
    } catch (error) {
      setMusoPreviewStatus({
        loading: false,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to calculate BPM from Muso preview',
      })
    }
  }

  const fetchCreditsForTrack = async (track: Track) => {
    setSelectedCreditsTrack(track)
    setShowCreditsModal(true)
    if (creditsByTrackId[track.id]) {
      return
    }
    await loadCreditsForTrack(track, false)
  }

  const loadCreditsForTrack = async (track: Track, refresh: boolean) => {
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
      const refreshParam = refresh ? '&refresh=true' : ''
      const res = await fetch(`/api/musicbrainz/credits?isrc=${encodeURIComponent(isrc)}${refreshParam}`)
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
          retrievedAt: typeof data.retrievedAt === 'string' ? data.retrievedAt : null,
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
        // For iTunes and other sources, prefer proxy to avoid CORS retries.
        const proxyUrl = `/api/audio-proxy?url=${encodeURIComponent(url)}`
        console.log('[Preview Debug] Fetching audio via proxy (non-Deezer):', proxyUrl)
        const response = await fetch(proxyUrl)
        if (!response.ok) {
          const errorText = await response.text()
          console.error('[Preview Debug] Proxy fetch failed (non-Deezer):', response.status, errorText)
          audioCache.current.set(url, url)
          return url
        }
        const blob = await response.blob()
        const blobUrl = URL.createObjectURL(blob)
        audioCache.current.set(url, blobUrl)
        return blobUrl
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
        const data = await fetchBpmForTrack(track.id, countryCode)
        console.log('[Preview Debug] handleTrackClick - BPM API response urls:', data.urls)
        const previewUrlFromMeta = getPreviewUrlFromMeta({ urls: data.urls })
        if (previewUrlFromMeta) {
          previewUrl = previewUrlFromMeta
          setPreviewUrls(prev => ({
            ...prev,
            [track.id]: previewUrlFromMeta,
          }))
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
        const data = await fetchBpmForTrack(track.id, countryCode)
        console.log('[Preview Debug] handleTrackTitleClick - BPM API response urls:', data.urls)
        const previewUrlFromMeta = getPreviewUrlFromMeta({ urls: data.urls })
        if (previewUrlFromMeta) {
          previewUrl = previewUrlFromMeta
          setPreviewUrls(prev => ({
            ...prev,
            [track.id]: previewUrlFromMeta,
          }))
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

  const openBpmModalForTrack = useCallback((track: Track) => {
    setSelectedBpmTrack(track)
    setRetryStatus(null)
    setRetryAttempted(false)
    setShowBpmModal(true)
  }, [])

  const handleRetryBpmForTrack = () => {
    if (!selectedBpmTrack || !bpmModalData) return
    setRetryStatus({ loading: true })
    setRetryAttempted(true)
    setRetryTrackId(bpmModalData.trackId)
    const targetIds = new Set([bpmModalData.trackId])
    streamBpmsForTracks([selectedBpmTrack], targetIds, targetIds)
  }

  const handleRecalcTrack = (mode: 'standard' | 'force' | 'fallback') => {
    if (!selectedBpmTrack) return
    if (mode === 'standard') {
      recalcTrackWithOptions(selectedBpmTrack)
      return
    }
    recalcTrackWithOptions(selectedBpmTrack, { fallbackOverride: 'always' })
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
  const bpmModalSummary = useMemo(() => {
    if (!bpmModalData) return null
    const { fullData, bpmSelected, keySelected, currentBpm, currentKey, currentScale } = bpmModalData
    const bpmCandidates: Array<{
      id: 'essentia' | 'librosa'
      label: string
      value: number
      confidence?: number | null
      raw?: number | null
    }> = []
    if (fullData.bpmEssentia != null) {
      bpmCandidates.push({
        id: 'essentia',
        label: 'Essentia',
        value: fullData.bpmEssentia,
        confidence: fullData.bpmConfidenceEssentia ?? null,
        raw: fullData.bpmRawEssentia ?? null,
      })
    }
    if (fullData.bpmLibrosa != null) {
      bpmCandidates.push({
        id: 'librosa',
        label: 'Librosa',
        value: fullData.bpmLibrosa,
        confidence: fullData.bpmConfidenceLibrosa ?? null,
        raw: fullData.bpmRawLibrosa ?? null,
      })
    }

    const keyCandidates: Array<{
      id: 'essentia' | 'librosa'
      label: string
      key: string | null
      scale: string | null
      confidence?: number | null
    }> = []
    if (fullData.keyEssentia || fullData.scaleEssentia) {
      keyCandidates.push({
        id: 'essentia',
        label: 'Essentia',
        key: fullData.keyEssentia ?? null,
        scale: fullData.scaleEssentia ?? null,
        confidence: fullData.keyscaleConfidenceEssentia ?? null,
      })
    }
    if (fullData.keyLibrosa || fullData.scaleLibrosa) {
      keyCandidates.push({
        id: 'librosa',
        label: 'Librosa',
        key: fullData.keyLibrosa ?? null,
        scale: fullData.scaleLibrosa ?? null,
        confidence: fullData.keyscaleConfidenceLibrosa ?? null,
      })
    }

    const bpmSelectedLabel =
      bpmSelected === 'manual' ? 'Manual' : bpmSelected === 'librosa' ? 'Librosa' : 'Essentia'
    const keySelectedLabel =
      keySelected === 'manual' ? 'Manual' : keySelected === 'librosa' ? 'Librosa' : 'Essentia'

    const bpmSelectedConfidence =
      bpmSelected === 'librosa'
        ? fullData.bpmConfidenceLibrosa ?? null
        : bpmSelected === 'manual'
          ? null
          : fullData.bpmConfidenceEssentia ?? null
    const keySelectedConfidence =
      keySelected === 'librosa'
        ? fullData.keyscaleConfidenceLibrosa ?? null
        : keySelected === 'manual'
          ? null
          : fullData.keyscaleConfidenceEssentia ?? null

    return {
      bpmCandidates,
      keyCandidates,
      bpmSelectedLabel,
      keySelectedLabel,
      bpmSelectedConfidence,
      keySelectedConfidence,
      currentBpm,
      currentKey,
      currentScale,
    }
  }, [bpmModalData])
  const isrcMismatchDetails = useMemo(() => {
    if (!selectedBpmTrack) return null
    const error = bpmDetails[selectedBpmTrack.id]?.error || ''
    if (!error.toLowerCase().includes('isrc mismatch')) return null
    const spotifyIsrc = selectedBpmTrack.external_ids?.isrc || null
    const urls = bpmDebugInfo[selectedBpmTrack.id]?.urls || []
    const itunesEntry = urls.find((entry: any) => {
      const url = typeof entry?.url === 'string' ? entry.url : ''
      return url.includes('itunes.apple.com') || url.includes('mzstatic')
    })
    const previewEntry = itunesEntry || urls.find((entry: any) => entry?.isrc && entry.isrc !== spotifyIsrc)
    return {
      spotifyIsrc,
      previewIsrc: previewEntry?.isrc || null,
      previewUrl: previewEntry?.url || null,
    }
  }, [selectedBpmTrack, bpmDetails, bpmDebugInfo])
  useEffect(() => {
    if (!showBpmModal || !selectedBpmTrack || !isrcMismatchDetails) {
      setMismatchPreviewUrls({})
      return
    }
    const itunesUrl = isrcMismatchDetails.previewUrl || null
    setMismatchPreviewUrls((prev) => ({ ...prev, itunes: itunesUrl }))
    if (mismatchPreviewUrls.spotify || mismatchPreviewUrls.loading) {
      return
    }
    const fetchSpotifyPreview = async () => {
      setMismatchPreviewUrls((prev) => ({ ...prev, loading: true }))
      try {
        const res = await fetch('/api/muso/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spotifyTrackId: selectedBpmTrack.id }),
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(payload?.error || 'Unable to fetch Spotify preview')
        }
        setMismatchPreviewUrls((prev) => ({
          ...prev,
          spotify: payload.previewUrl || null,
          loading: false,
        }))
      } catch {
        setMismatchPreviewUrls((prev) => ({ ...prev, loading: false }))
      }
    }
    void fetchSpotifyPreview()
  }, [showBpmModal, selectedBpmTrack, isrcMismatchDetails, mismatchPreviewUrls.spotify, mismatchPreviewUrls.loading])

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

  const bpmAdminSettings = isAdmin ? (
    <>
      <div className="flex items-center justify-between text-sm text-gray-700">
        <span className="font-medium">BPM Debug Panel</span>
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
      <div className="space-y-1 text-sm text-gray-700">
        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400" htmlFor="bpm-debug-level">
          Debug level
        </label>
        <select
          id="bpm-debug-level"
          value={bpmDebugLevel}
          onChange={(e) => setBpmDebugLevel(e.target.value)}
          className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
        >
          <option value="minimal">Minimal</option>
          <option value="normal">Normal</option>
        </select>
      </div>
      <div className="space-y-1 text-sm text-gray-700">
        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400" htmlFor="bpm-fallback-override">
          Fallback override
        </label>
        <select
          id="bpm-fallback-override"
          value={bpmFallbackOverride}
          onChange={(e) => setBpmFallbackOverride(e.target.value as BpmFallbackOverride)}
          className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
        >
          <option value="never">Never use fallback</option>
          <option value="always">Always use fallback</option>
          <option value="bpm_only">BPM only</option>
          <option value="key_only">Key only</option>
          <option value="default">Confidence-based (legacy)</option>
        </select>
      </div>
      <div className="space-y-1 text-sm text-gray-700">
        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400" htmlFor="bpm-confidence-threshold">
          Confidence threshold
        </label>
        <input
          id="bpm-confidence-threshold"
          type="number"
          min="0"
          max="1"
          step="0.01"
          value={bpmConfidenceThreshold}
          onChange={(e) => setBpmConfidenceThreshold(e.target.value)}
          className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
        />
      </div>
    </>
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
            settingsItems={bpmAdminSettings ?? undefined}
          />
          <TrackTableSkeleton />
        </div>
        <footer className="mt-auto py-6 sm:py-8 text-center text-xs sm:text-sm text-gray-500 dark:text-slate-400 border-t border-gray-200">
          Created by{' '}
          <a href="mailto:delman@delman.it" className="text-green-600 hover:text-green-700 hover:underline">
            delman@delman.it
          </a>
          . Powered by{' '}
          <a href="https://spotify.com" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
            Spotify
          </a>
          ,{' '}
          <a href="https://muso.ai" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
            Muso.ai
          </a>{' '}
          and{' '}
          <a href="https://musicbrainz.org" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
            MusicBrainz
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
        <footer className="mt-auto py-6 sm:py-8 text-center text-xs sm:text-sm text-gray-500 dark:text-slate-400 border-t border-gray-200">
          Created by{' '}
          <a href="mailto:delman@delman.it" className="text-green-600 hover:text-green-700 hover:underline">
            delman@delman.it
          </a>
          . Powered by{' '}
          <a href="https://spotify.com" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
            Spotify
          </a>
          ,{' '}
          <a href="https://muso.ai" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
            Muso.ai
          </a>{' '}
          and{' '}
          <a href="https://musicbrainz.org" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
            MusicBrainz
          </a>
          .
        </footer>
      </div>
    )
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
          settingsItems={bpmAdminSettings ?? undefined}
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
                    <p className="text-gray-500 dark:text-slate-400">No searches with URLs tracked yet.</p>
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
          <PlaylistHeader
            playlistInfo={playlistInfo}
            tracksCount={tracks.length}
            isCached={isCached}
            cachedAt={cachedAt}
            isHeaderRefreshing={isHeaderRefreshing}
            bpmSummary={bpmSummary}
            showBpmNotice={showBpmNotice}
            onHeaderRefresh={handleHeaderRefresh}
            onShowCacheModal={() => setShowCacheModal(true)}
            onShowBpmMoreInfo={() => setShowBpmMoreInfo(true)}
            onDismissBpmNotice={() => setShowBpmNotice(false)}
          />
        )}

        <FilterControls
          searchQuery={searchQuery}
          showAdvanced={showAdvanced}
          yearFrom={yearFrom}
          yearTo={yearTo}
          bpmFrom={bpmFrom}
          bpmTo={bpmTo}
          includeHalfDoubleBpm={includeHalfDoubleBpm}
          pageSize={pageSize}
          safePage={safePage}
          totalPages={totalPages}
          searchInputRef={searchInputRef}
          onSearchQueryChange={setSearchQuery}
          onToggleAdvanced={() => setShowAdvanced((prev) => !prev)}
          onYearFromChange={setYearFrom}
          onYearToChange={setYearTo}
          onBpmFromChange={setBpmFrom}
          onBpmToChange={setBpmTo}
          onIncludeHalfDoubleBpmChange={setIncludeHalfDoubleBpm}
          onClearFilters={() => {
            setYearFrom('')
            setYearTo('')
            setBpmFrom('')
            setBpmTo('')
            setIncludeHalfDoubleBpm(false)
          }}
          onPageSizeChange={setPageSize}
          onPrevPage={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
          onNextPage={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
        />

        {/* Cached Data Indicator moved to header */}

        {/* Mobile Card View */}
        <TrackCardList
          tracks={paginatedTracks}
          pageSize={pageSize}
          safePage={safePage}
          playingTrackId={playingTrackId}
          isAdmin={isAdmin}
          trackBpms={trackBpms}
          trackKeys={trackKeys}
          trackScales={trackScales}
          loadingBpmFields={loadingBpmFields}
          loadingKeyFields={loadingKeyFields}
          tracksNeedingBpm={tracksNeedingBpm}
          tracksNeedingKey={tracksNeedingKey}
          bpmStreamStatus={bpmStreamStatus}
          getPreviewTooltip={getPreviewTooltip}
          formatDuration={formatDuration}
          getYearString={getYearString}
          onTrackClick={handleTrackClick}
          onTrackContextMenu={handleTrackContextMenu}
          onTrackTitleClick={handleTrackTitleClick}
          onArtistClick={handleArtistClick}
          onArtistContextMenu={handleArtistContextMenu}
          onAlbumClick={handleAlbumClick}
          onAlbumContextMenu={handleAlbumContextMenu}
          onOpenBpmModal={openBpmModalForTrack}
        />

        {/* Desktop Table View */}
        <TrackTable
          sortedTracks={sortedTracks}
          paginatedTracks={paginatedTracks}
          searchQuery={searchQuery}
          yearFrom={yearFrom}
          yearTo={yearTo}
          bpmFrom={bpmFrom}
          bpmTo={bpmTo}
          sortField={sortField}
          sortDirection={sortDirection}
          pageSize={pageSize}
          safePage={safePage}
          playingTrackId={playingTrackId}
          isAdmin={isAdmin}
          trackBpms={trackBpms}
          trackKeys={trackKeys}
          trackScales={trackScales}
          loadingBpmFields={loadingBpmFields}
          loadingKeyFields={loadingKeyFields}
          tracksNeedingBpm={tracksNeedingBpm}
          tracksNeedingKey={tracksNeedingKey}
          bpmStreamStatus={bpmStreamStatus}
          getPreviewTooltip={getPreviewTooltip}
          formatDuration={formatDuration}
          formatDate={formatDate}
          getYearString={getYearString}
          onSort={handleSort}
          onTrackClick={handleTrackClick}
          onTrackContextMenu={handleTrackContextMenu}
          onTrackTitleClick={handleTrackTitleClick}
          onArtistClick={handleArtistClick}
          onArtistContextMenu={handleArtistContextMenu}
          onAlbumClick={handleAlbumClick}
          onAlbumContextMenu={handleAlbumContextMenu}
          onOpenBpmModal={openBpmModalForTrack}
        />
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
              className="px-2 py-1 border border-gray-300 rounded disabled:text-gray-400 dark:text-slate-500 disabled:border-gray-200"
            >
              Prev
            </button>
            <span>
              Page {safePage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safePage >= totalPages}
              className="px-2 py-1 border border-gray-300 rounded disabled:text-gray-400 dark:text-slate-500 disabled:border-gray-200"
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
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 dark:bg-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">BPM Processing Information</h2>
              <button
                onClick={() => setShowBpmMoreInfo(false)}
                className="text-gray-400 dark:text-slate-500 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4 text-sm text-gray-700 dark:text-slate-300">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
                  Changing the country will reload the page and search stores in the selected country.
                </p>
              </div>

              <p className="text-xs text-gray-500 dark:text-slate-400">
                Some tracks may not have preview audio available in the selected country, which is why they show as N/A. 
                You can retry by clicking on the N/A value, or try selecting a different country.
              </p>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowBpmMoreInfo(false)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded transition-colors dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Close
              </button>
            </div>
              </div>
            </div>
          )}

      {/* BPM Details Modal */}
      <BpmDetailsModal
        isOpen={Boolean(isAdmin && bpmModalData && bpmModalSummary && selectedBpmTrack)}
        isAdmin={isAdmin}
        bpmModalData={bpmModalData}
        bpmModalSummary={bpmModalSummary}
        selectedBpmTrack={selectedBpmTrack}
        bpmStreamStatus={bpmStreamStatus}
        bpmDetails={bpmDetails}
        isrcMismatchDetails={isrcMismatchDetails}
        mismatchPreviewUrls={mismatchPreviewUrls}
        musoPreviewStatus={musoPreviewStatus}
        loadingBpmFields={loadingBpmFields}
        trackBpms={trackBpms}
        retryStatus={retryStatus}
        retryAttempted={retryAttempted}
        manualBpm={manualBpm}
        manualKey={manualKey}
        manualScale={manualScale}
        isUpdatingSelection={isUpdatingSelection}
        showBpmModalDebug={showBpmModalDebug}
        bpmDebugLevel={bpmDebugLevel}
        bpmConfidenceThreshold={bpmConfidenceThreshold}
        bpmDebugInfo={bpmDebugInfo}
        recalcMode={recalcMode}
        recalcStatus={recalcStatus}
        onClose={closeBpmModal}
        onUpdateBpmSelection={updateBpmSelection}
        onSetManualBpm={setManualBpm}
        onSetManualKey={setManualKey}
        onSetManualScale={setManualScale}
        onRetryBpm={handleRetryBpmForTrack}
        onFetchMusoPreview={handleMusoPreviewBpm}
        onSetShowBpmModalDebug={setShowBpmModalDebug}
        onSetBpmDebugLevel={setBpmDebugLevel}
        onSetBpmConfidenceThreshold={setBpmConfidenceThreshold}
        onSetRecalcMode={setRecalcMode}
        onRecalcTrack={handleRecalcTrack}
      />

      {/* Credits Modal */}
      <CreditsModal
        isOpen={showCreditsModal}
        selectedTrack={selectedCreditsTrack}
        creditsByTrackId={creditsByTrackId}
        creditsLoadingIds={creditsLoadingIds}
        creditsErrorByTrackId={creditsErrorByTrackId}
        creditsRoleMap={creditsRoleMap}
        formatRetrievedMonthYear={formatRetrievedMonthYear}
        renderCreditLinks={renderCreditLinks}
        onRefreshCredits={loadCreditsForTrack}
        onClose={closeCreditsModal}
      />
      
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
                  className="text-gray-400 dark:text-slate-500 hover:text-gray-600 text-2xl"
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
                <p className="text-xs text-gray-500 dark:text-slate-400">
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
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recalculate BPM & Key?</h2>
              <button
                onClick={() => setShowBpmRecalcPrompt(false)}
                className="text-gray-400 dark:text-slate-500 hover:text-gray-600 text-2xl"
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
      
      <footer className="mt-auto py-6 sm:py-8 text-center text-xs sm:text-sm text-gray-500 dark:text-slate-400 border-t border-gray-200">
        Created by{' '}
        <a href="mailto:delman@delman.it" className="text-green-600 hover:text-green-700 hover:underline">
          delman@delman.it
        </a>
        . Powered by{' '}
        <a href="https://spotify.com" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
          Spotify
        </a>
        ,{' '}
        <a href="https://muso.ai" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
          Muso.ai
        </a>{' '}
        and{' '}
        <a href="https://musicbrainz.org" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 hover:underline">
          MusicBrainz
        </a>
        .
      </footer>
    </div>
  )
}
