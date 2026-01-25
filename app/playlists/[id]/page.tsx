'use client'

import { useEffect, useReducer, useRef, useMemo, useCallback } from 'react'
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
import { usePlaylistFilters } from '../../hooks/usePlaylistFilters'
import { useBpmAnalysis, type BpmFallbackOverride } from '../../hooks/useBpmAnalysis'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
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

interface PlaylistTracksPageProps {
  params: {
    id: string
  }
}


type CreditsState = {
  creditsByTrackId: Record<
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
  creditsLoadingIds: Set<string>
  creditsErrorByTrackId: Record<string, string>
  showCreditsModal: boolean
  selectedCreditsTrack: Track | null
}


type UiState = {
  isAdmin: boolean
  loggedInUserName: string | null
  isHeaderRefreshing: boolean
  contextMenu: {
    x: number
    y: number
    spotifyUrl: string
    spotifyUri: string
    track?: Track
  } | null
}

type CacheState = {
  isRefreshing: boolean
  showCacheModal: boolean
  refreshDone: boolean
}


type SetAction<State> = {
  [K in keyof State]: {
    type: 'set'
    key: K
    value: State[K] | ((prev: State[K]) => State[K])
  }
}[keyof State]

const makeReducer = <State,>() => {
  return (state: State, action: SetAction<State>): State => {
    if (action.type !== 'set') return state
    const nextValue = typeof action.value === 'function'
      ? (action.value as (prev: State[typeof action.key]) => State[typeof action.key])(state[action.key])
      : action.value
    return {
      ...state,
      [action.key]: nextValue,
    }
  }
}

const creditsReducer = makeReducer<CreditsState>()
const uiReducer = makeReducer<UiState>()
const cacheReducer = makeReducer<CacheState>()


const createInitialCreditsState = (): CreditsState => ({
  creditsByTrackId: {},
  creditsLoadingIds: new Set(),
  creditsErrorByTrackId: {},
  showCreditsModal: false,
  selectedCreditsTrack: null,
})


const createInitialUiState = (): UiState => ({
  isAdmin: false,
  loggedInUserName: null,
  isHeaderRefreshing: false,
  contextMenu: null,
})

const createInitialCacheState = (): CacheState => ({
  isRefreshing: false,
  showCacheModal: false,
  refreshDone: false,
})


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
  const {
    state: bpmState,
    setState: setBpmState,
    fetchTracksInDbForIds,
    fetchBpmForTrack,
    getPreviewUrlFromMeta,
    fetchBpmsBatch,
    streamBpmsForTracks,
    updateBpmSelection,
    recalcTrackWithOptions,
    handleMusoPreviewBpm,
    bpmSummary,
    loadingTrackIds,
    isTrackLoading,
  } = useBpmAnalysis(tracks)
  const [creditsState, creditsDispatch] = useReducer(creditsReducer, undefined, createInitialCreditsState)
  const [uiState, uiDispatch] = useReducer(uiReducer, undefined, createInitialUiState)
  const [cacheState, cacheDispatch] = useReducer(cacheReducer, undefined, createInitialCacheState)

  const {
    trackBpms,
    trackKeys,
    trackScales,
    loadingBpmFields,
    loadingKeyFields,
    tracksNeedingBpm,
    tracksNeedingKey,
    tracksNeedingCalc,
    loadingPreviewIds,
    bpmStreamStatus,
    showBpmDebug,
    bpmDebugLevel,
    bpmFallbackOverride,
    bpmConfidenceThreshold,
    bpmDebugInfo,
    bpmDetails,
    musoPreviewStatus,
    mismatchPreviewUrls,
    previewUrls,
    bpmFullData,
    showBpmModal,
    showBpmModalDebug,
    recalcMode,
    selectedBpmTrack,
    bpmProcessingStartTime,
    bpmProcessingEndTime,
    bpmTracksCalculated,
    retryStatus,
    retryAttempted,
    retryTrackId,
    recalcStatus,
    manualBpm,
    manualKey,
    manualScale,
    isUpdatingSelection,
    showBpmMoreInfo,
    countryCode,
    tracksInDb,
    recalculating,
    showBpmInfo,
    showBpmNotice,
    showBpmRecalcPrompt,
    pendingRecalcIds,
  } = bpmState

  const {
    creditsByTrackId,
    creditsLoadingIds,
    creditsErrorByTrackId,
    showCreditsModal,
    selectedCreditsTrack,
  } = creditsState

  const {
    filteredTracks,
    sortedTracks,
    paginatedTracks,
    totalPages,
    safePage,
    searchQuery,
    sortField,
    sortDirection,
    showAdvanced,
    yearFrom,
    yearTo,
    bpmFrom,
    bpmTo,
    includeHalfDoubleBpm,
    pageSize,
    currentPage,
    setSearchQuery,
    setSortField,
    setSortDirection,
    setShowAdvanced,
    setYearFrom,
    setYearTo,
    setBpmFrom,
    setBpmTo,
    setIncludeHalfDoubleBpm,
    setPageSize,
    setCurrentPage,
    handleSort,
    getYearString,
  } = usePlaylistFilters(tracks, trackBpms)

  const {
    playingTrackId,
    handleTrackClick,
    handleTrackTitleClick,
    getPreviewTooltip,
  } = useAudioPlayer({
    previewUrls,
    setPreviewUrls,
    loadingPreviewIds,
    setLoadingPreviewIds,
    fetchPreviewMeta: fetchBpmForTrack,
    getPreviewUrlFromMeta,
    countryCode,
  })

  const {
    isAdmin,
    loggedInUserName,
    isHeaderRefreshing,
    contextMenu,
  } = uiState

  const {
    isRefreshing,
    showCacheModal,
    refreshDone,
  } = cacheState


  const setTrackBpms = (value: BpmState['trackBpms'] | ((prev: BpmState['trackBpms']) => BpmState['trackBpms'])) => {
    setBpmState('trackBpms', value)
  }
  const setTrackKeys = (value: BpmState['trackKeys'] | ((prev: BpmState['trackKeys']) => BpmState['trackKeys'])) => {
    setBpmState('trackKeys', value)
  }
  const setTrackScales = (value: BpmState['trackScales'] | ((prev: BpmState['trackScales']) => BpmState['trackScales'])) => {
    setBpmState('trackScales', value)
  }
  const setLoadingBpmFields = (value: BpmState['loadingBpmFields'] | ((prev: BpmState['loadingBpmFields']) => BpmState['loadingBpmFields'])) => {
    setBpmState('loadingBpmFields', value)
  }
  const setLoadingKeyFields = (value: BpmState['loadingKeyFields'] | ((prev: BpmState['loadingKeyFields']) => BpmState['loadingKeyFields'])) => {
    setBpmState('loadingKeyFields', value)
  }
  const setTracksNeedingBpm = (value: BpmState['tracksNeedingBpm'] | ((prev: BpmState['tracksNeedingBpm']) => BpmState['tracksNeedingBpm'])) => {
    setBpmState('tracksNeedingBpm', value)
  }
  const setTracksNeedingKey = (value: BpmState['tracksNeedingKey'] | ((prev: BpmState['tracksNeedingKey']) => BpmState['tracksNeedingKey'])) => {
    setBpmState('tracksNeedingKey', value)
  }
  const setTracksNeedingCalc = (value: BpmState['tracksNeedingCalc'] | ((prev: BpmState['tracksNeedingCalc']) => BpmState['tracksNeedingCalc'])) => {
    setBpmState('tracksNeedingCalc', value)
  }
  const setLoadingPreviewIds = (value: BpmState['loadingPreviewIds'] | ((prev: BpmState['loadingPreviewIds']) => BpmState['loadingPreviewIds'])) => {
    setBpmState('loadingPreviewIds', value)
  }
  const setBpmStreamStatus = (value: BpmState['bpmStreamStatus'] | ((prev: BpmState['bpmStreamStatus']) => BpmState['bpmStreamStatus'])) => {
    setBpmState('bpmStreamStatus', value)
  }
  const setShowBpmDebug = (value: BpmState['showBpmDebug'] | ((prev: BpmState['showBpmDebug']) => BpmState['showBpmDebug'])) => {
    setBpmState('showBpmDebug', value)
  }
  const setBpmDebugLevel = (value: BpmState['bpmDebugLevel'] | ((prev: BpmState['bpmDebugLevel']) => BpmState['bpmDebugLevel'])) => {
    setBpmState('bpmDebugLevel', value)
  }
  const setBpmFallbackOverride = (value: BpmState['bpmFallbackOverride'] | ((prev: BpmState['bpmFallbackOverride']) => BpmState['bpmFallbackOverride'])) => {
    setBpmState('bpmFallbackOverride', value)
  }
  const setBpmConfidenceThreshold = (value: BpmState['bpmConfidenceThreshold'] | ((prev: BpmState['bpmConfidenceThreshold']) => BpmState['bpmConfidenceThreshold'])) => {
    setBpmState('bpmConfidenceThreshold', value)
  }
  const setBpmDebugInfo = (value: BpmState['bpmDebugInfo'] | ((prev: BpmState['bpmDebugInfo']) => BpmState['bpmDebugInfo'])) => {
    setBpmState('bpmDebugInfo', value)
  }
  const setBpmDetails = (value: BpmState['bpmDetails'] | ((prev: BpmState['bpmDetails']) => BpmState['bpmDetails'])) => {
    setBpmState('bpmDetails', value)
  }
  const setMusoPreviewStatus = (value: BpmState['musoPreviewStatus'] | ((prev: BpmState['musoPreviewStatus']) => BpmState['musoPreviewStatus'])) => {
    setBpmState('musoPreviewStatus', value)
  }
  const setMismatchPreviewUrls = (value: BpmState['mismatchPreviewUrls'] | ((prev: BpmState['mismatchPreviewUrls']) => BpmState['mismatchPreviewUrls'])) => {
    setBpmState('mismatchPreviewUrls', value)
  }
  const setPreviewUrls = (value: BpmState['previewUrls'] | ((prev: BpmState['previewUrls']) => BpmState['previewUrls'])) => {
    setBpmState('previewUrls', value)
  }
  const setBpmFullData = (value: BpmState['bpmFullData'] | ((prev: BpmState['bpmFullData']) => BpmState['bpmFullData'])) => {
    setBpmState('bpmFullData', value)
  }
  const setShowBpmModal = (value: BpmState['showBpmModal'] | ((prev: BpmState['showBpmModal']) => BpmState['showBpmModal'])) => {
    setBpmState('showBpmModal', value)
  }
  const setShowBpmModalDebug = (value: BpmState['showBpmModalDebug'] | ((prev: BpmState['showBpmModalDebug']) => BpmState['showBpmModalDebug'])) => {
    setBpmState('showBpmModalDebug', value)
  }
  const setRecalcMode = (value: BpmState['recalcMode'] | ((prev: BpmState['recalcMode']) => BpmState['recalcMode'])) => {
    setBpmState('recalcMode', value)
  }
  const setSelectedBpmTrack = (value: BpmState['selectedBpmTrack'] | ((prev: BpmState['selectedBpmTrack']) => BpmState['selectedBpmTrack'])) => {
    setBpmState('selectedBpmTrack', value)
  }
  const setBpmProcessingStartTime = (value: BpmState['bpmProcessingStartTime'] | ((prev: BpmState['bpmProcessingStartTime']) => BpmState['bpmProcessingStartTime'])) => {
    setBpmState('bpmProcessingStartTime', value)
  }
  const setBpmProcessingEndTime = (value: BpmState['bpmProcessingEndTime'] | ((prev: BpmState['bpmProcessingEndTime']) => BpmState['bpmProcessingEndTime'])) => {
    setBpmState('bpmProcessingEndTime', value)
  }
  const setBpmTracksCalculated = (value: BpmState['bpmTracksCalculated'] | ((prev: BpmState['bpmTracksCalculated']) => BpmState['bpmTracksCalculated'])) => {
    setBpmState('bpmTracksCalculated', value)
  }
  const setRetryStatus = (value: BpmState['retryStatus'] | ((prev: BpmState['retryStatus']) => BpmState['retryStatus'])) => {
    setBpmState('retryStatus', value)
  }
  const setRetryAttempted = (value: BpmState['retryAttempted'] | ((prev: BpmState['retryAttempted']) => BpmState['retryAttempted'])) => {
    setBpmState('retryAttempted', value)
  }
  const setRetryTrackId = (value: BpmState['retryTrackId'] | ((prev: BpmState['retryTrackId']) => BpmState['retryTrackId'])) => {
    setBpmState('retryTrackId', value)
  }
  const setRecalcStatus = (value: BpmState['recalcStatus'] | ((prev: BpmState['recalcStatus']) => BpmState['recalcStatus'])) => {
    setBpmState('recalcStatus', value)
  }
  const setManualBpm = (value: BpmState['manualBpm'] | ((prev: BpmState['manualBpm']) => BpmState['manualBpm'])) => {
    setBpmState('manualBpm', value)
  }
  const setManualKey = (value: BpmState['manualKey'] | ((prev: BpmState['manualKey']) => BpmState['manualKey'])) => {
    setBpmState('manualKey', value)
  }
  const setManualScale = (value: BpmState['manualScale'] | ((prev: BpmState['manualScale']) => BpmState['manualScale'])) => {
    setBpmState('manualScale', value)
  }
  const setIsUpdatingSelection = (value: BpmState['isUpdatingSelection'] | ((prev: BpmState['isUpdatingSelection']) => BpmState['isUpdatingSelection'])) => {
    setBpmState('isUpdatingSelection', value)
  }
  const setShowBpmMoreInfo = (value: BpmState['showBpmMoreInfo'] | ((prev: BpmState['showBpmMoreInfo']) => BpmState['showBpmMoreInfo'])) => {
    setBpmState('showBpmMoreInfo', value)
  }
  const setCountryCode = (value: BpmState['countryCode'] | ((prev: BpmState['countryCode']) => BpmState['countryCode'])) => {
    setBpmState('countryCode', value)
  }
  const setTracksInDb = (value: BpmState['tracksInDb'] | ((prev: BpmState['tracksInDb']) => BpmState['tracksInDb'])) => {
    setBpmState('tracksInDb', value)
  }
  const setRecalculating = (value: BpmState['recalculating'] | ((prev: BpmState['recalculating']) => BpmState['recalculating'])) => {
    setBpmState('recalculating', value)
  }
  const setShowBpmInfo = (value: BpmState['showBpmInfo'] | ((prev: BpmState['showBpmInfo']) => BpmState['showBpmInfo'])) => {
    setBpmState('showBpmInfo', value)
  }
  const setShowBpmNotice = (value: BpmState['showBpmNotice'] | ((prev: BpmState['showBpmNotice']) => BpmState['showBpmNotice'])) => {
    setBpmState('showBpmNotice', value)
  }
  const setShowBpmRecalcPrompt = (value: BpmState['showBpmRecalcPrompt'] | ((prev: BpmState['showBpmRecalcPrompt']) => BpmState['showBpmRecalcPrompt'])) => {
    setBpmState('showBpmRecalcPrompt', value)
  }
  const setPendingRecalcIds = (value: BpmState['pendingRecalcIds'] | ((prev: BpmState['pendingRecalcIds']) => BpmState['pendingRecalcIds'])) => {
    setBpmState('pendingRecalcIds', value)
  }

  const setCreditsByTrackId = (value: CreditsState['creditsByTrackId'] | ((prev: CreditsState['creditsByTrackId']) => CreditsState['creditsByTrackId'])) => {
    creditsDispatch({ type: 'set', key: 'creditsByTrackId', value })
  }
  const setCreditsLoadingIds = (value: CreditsState['creditsLoadingIds'] | ((prev: CreditsState['creditsLoadingIds']) => CreditsState['creditsLoadingIds'])) => {
    creditsDispatch({ type: 'set', key: 'creditsLoadingIds', value })
  }
  const setCreditsErrorByTrackId = (value: CreditsState['creditsErrorByTrackId'] | ((prev: CreditsState['creditsErrorByTrackId']) => CreditsState['creditsErrorByTrackId'])) => {
    creditsDispatch({ type: 'set', key: 'creditsErrorByTrackId', value })
  }
  const setShowCreditsModal = (value: CreditsState['showCreditsModal'] | ((prev: CreditsState['showCreditsModal']) => CreditsState['showCreditsModal'])) => {
    creditsDispatch({ type: 'set', key: 'showCreditsModal', value })
  }
  const setSelectedCreditsTrack = (value: CreditsState['selectedCreditsTrack'] | ((prev: CreditsState['selectedCreditsTrack']) => CreditsState['selectedCreditsTrack'])) => {
    creditsDispatch({ type: 'set', key: 'selectedCreditsTrack', value })
  }

  const setIsAdmin = (value: UiState['isAdmin'] | ((prev: UiState['isAdmin']) => UiState['isAdmin'])) => {
    uiDispatch({ type: 'set', key: 'isAdmin', value })
  }
  const setLoggedInUserName = (value: UiState['loggedInUserName'] | ((prev: UiState['loggedInUserName']) => UiState['loggedInUserName'])) => {
    uiDispatch({ type: 'set', key: 'loggedInUserName', value })
  }
  const setIsHeaderRefreshing = (value: UiState['isHeaderRefreshing'] | ((prev: UiState['isHeaderRefreshing']) => UiState['isHeaderRefreshing'])) => {
    uiDispatch({ type: 'set', key: 'isHeaderRefreshing', value })
  }
  const setContextMenu = (value: UiState['contextMenu'] | ((prev: UiState['contextMenu']) => UiState['contextMenu'])) => {
    uiDispatch({ type: 'set', key: 'contextMenu', value })
  }

  const setIsRefreshing = (value: CacheState['isRefreshing'] | ((prev: CacheState['isRefreshing']) => CacheState['isRefreshing'])) => {
    cacheDispatch({ type: 'set', key: 'isRefreshing', value })
  }
  const setShowCacheModal = (value: CacheState['showCacheModal'] | ((prev: CacheState['showCacheModal']) => CacheState['showCacheModal'])) => {
    cacheDispatch({ type: 'set', key: 'showCacheModal', value })
  }
  const setRefreshDone = (value: CacheState['refreshDone'] | ((prev: CacheState['refreshDone']) => CacheState['refreshDone'])) => {
    cacheDispatch({ type: 'set', key: 'refreshDone', value })
  }

  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const authErrorHandledRef = useRef(false) // Prevent infinite loops on auth errors
  
  // Get cache info from React Query data
  const isCached = playlistInfo?.is_cached ?? false
  const cachedAt = playlistInfo?.cached_at ? new Date(playlistInfo.cached_at) : null

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
          uiDispatch({
            type: 'set',
            key: 'loggedInUserName',
            value: data.user.display_name || data.user.id || null,
          })
          return
        }
        if (!data?.authenticated) {
          window.location.href = '/api/auth/login'
        }
      })
      .catch(() => {})
  }, [uiDispatch])
  
  // Close context menu on click outside or escape key
  useEffect(() => {
    const handleClickOutside = () => {
      uiDispatch({ type: 'set', key: 'contextMenu', value: null })
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        uiDispatch({ type: 'set', key: 'contextMenu', value: null })
      }
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
  }, [contextMenu, uiDispatch])

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
          uiDispatch({ type: 'set', key: 'isAdmin', value: data.isAdmin || false })
        }
      } catch (e) {
        console.error('Error checking admin status:', e)
      }
    }

    checkAdmin()
  }, [uiDispatch])
  
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
    setBpmState('showBpmModal', false)
    setBpmState('retryStatus', null)
    setBpmState('retryAttempted', false)
    setBpmState('retryTrackId', null)
    setBpmState('manualBpm', '')
    setBpmState('manualKey', '')
    setBpmState('manualScale', 'major')
    setBpmState('musoPreviewStatus', null)
    setBpmState('mismatchPreviewUrls', {})
    setBpmState('showBpmModalDebug', false)
    setBpmState('recalcMode', 'standard')
  }, [setBpmState])

  const closeCreditsModal = useCallback(() => {
    creditsDispatch({ type: 'set', key: 'showCreditsModal', value: false })
  }, [creditsDispatch])

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

  const openBpmModalForTrack = (track: Track) => {
    setSelectedBpmTrack(track)
    setRetryStatus(null)
    setRetryAttempted(false)
    setShowBpmModal(true)
  }

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
        onRefreshCredits={(track, force) => loadCreditsForTrack(track, Boolean(force))}
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
