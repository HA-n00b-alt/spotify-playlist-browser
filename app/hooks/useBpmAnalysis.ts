'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { SpotifyTrack, PreviewUrlEntry } from '@/lib/types'

type Track = SpotifyTrack
export type BpmFallbackOverride = 'never' | 'always' | 'bpm_only' | 'key_only' | 'default'

type BpmFullDataEntry = {
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
}

export type BpmState = {
  trackBpms: Record<string, number | null>
  trackKeys: Record<string, string | null>
  trackScales: Record<string, string | null>
  loadingBpmFields: Set<string>
  loadingKeyFields: Set<string>
  tracksNeedingBpm: Set<string>
  tracksNeedingKey: Set<string>
  tracksNeedingCalc: Set<string>
  loadingPreviewIds: Set<string>
  bpmStreamStatus: Record<string, 'partial' | 'final' | 'error'>
  showBpmDebug: boolean
  bpmDebugLevel: string
  bpmFallbackOverride: BpmFallbackOverride
  bpmConfidenceThreshold: string
  bpmDebugInfo: Record<string, any>
  bpmDetails: Record<string, { source?: string; error?: string }>
  musoPreviewStatus: { loading: boolean; success?: boolean; error?: string } | null
  mismatchPreviewUrls: { itunes?: string | null; spotify?: string | null; loading?: boolean }
  previewUrls: Record<string, string | null>
  bpmFullData: Record<string, BpmFullDataEntry>
  showBpmModal: boolean
  showBpmModalDebug: boolean
  recalcMode: 'standard' | 'force' | 'fallback'
  selectedBpmTrack: Track | null
  bpmProcessingStartTime: number | null
  bpmProcessingEndTime: number | null
  bpmTracksCalculated: number
  retryStatus: { loading: boolean; success?: boolean; error?: string } | null
  retryAttempted: boolean
  retryTrackId: string | null
  recalcStatus: { loading: boolean; success?: boolean; error?: string } | null
  manualBpm: string
  manualKey: string
  manualScale: string
  isUpdatingSelection: boolean
  showBpmMoreInfo: boolean
  countryCode: string
  tracksInDb: Set<string>
  recalculating: boolean
  showBpmInfo: boolean
  showBpmNotice: boolean
  showBpmRecalcPrompt: boolean
  pendingRecalcIds: { all: string[]; newOnly: string[] }
}

type SetAction<State, K extends keyof State = keyof State> = {
  type: 'set'
  key: K
  value: State[K] | ((prev: State[K]) => State[K])
}

const bpmReducer = (state: BpmState, action: SetAction<BpmState>): BpmState => {
  if (action.type !== 'set') return state
  const nextValue = typeof action.value === 'function'
    ? (action.value as (prev: BpmState[typeof action.key]) => BpmState[typeof action.key])(state[action.key])
    : action.value
  return {
    ...state,
    [action.key]: nextValue,
  }
}

const createInitialBpmState = (): BpmState => ({
  trackBpms: {},
  trackKeys: {},
  trackScales: {},
  loadingBpmFields: new Set(),
  loadingKeyFields: new Set(),
  tracksNeedingBpm: new Set(),
  tracksNeedingKey: new Set(),
  tracksNeedingCalc: new Set(),
  loadingPreviewIds: new Set(),
  bpmStreamStatus: {},
  showBpmDebug: false,
  bpmDebugLevel: 'minimal',
  bpmFallbackOverride: 'never',
  bpmConfidenceThreshold: '0.65',
  bpmDebugInfo: {},
  bpmDetails: {},
  musoPreviewStatus: null,
  mismatchPreviewUrls: {},
  previewUrls: {},
  bpmFullData: {},
  showBpmModal: false,
  showBpmModalDebug: false,
  recalcMode: 'standard',
  selectedBpmTrack: null,
  bpmProcessingStartTime: null,
  bpmProcessingEndTime: null,
  bpmTracksCalculated: 0,
  retryStatus: null,
  retryAttempted: false,
  retryTrackId: null,
  recalcStatus: null,
  manualBpm: '',
  manualKey: '',
  manualScale: 'major',
  isUpdatingSelection: false,
  showBpmMoreInfo: false,
  countryCode: 'us',
  tracksInDb: new Set(),
  recalculating: false,
  showBpmInfo: false,
  showBpmNotice: true,
  showBpmRecalcPrompt: false,
  pendingRecalcIds: { all: [], newOnly: [] },
})

export function useBpmAnalysis(tracks: Track[]) {
  const [state, dispatch] = useReducer(bpmReducer, undefined, createInitialBpmState)
  const streamAbortRef = useRef<AbortController | null>(null)
  const bpmRequestCache = useRef<Map<string, Promise<any>>>(new Map())

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
  } = state

  const setState = useCallback(<K extends keyof BpmState>(key: K, value: BpmState[K] | ((prev: BpmState[K]) => BpmState[K])) => {
    dispatch({ type: 'set', key, value })
  }, [])

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

  const getPreviewUrlFromMeta = useCallback((meta: { urls?: PreviewUrlEntry[] }): string | null => {
    if (!meta.urls || meta.urls.length === 0) return null
    const isDeezerApi = (url: string) => url.includes('api.deezer.com')
    const isDeezerTimed = (url: string) =>
      url.includes('cdn-preview') || url.includes('cdnt-preview') || url.includes('e-cdn-preview')
    const toDeezerApi = (entry: PreviewUrlEntry) => {
      const isrc = (entry as { isrc?: string | null }).isrc
      if (isrc && isDeezerTimed(entry.url)) {
        return `https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`
      }
      return entry.url
    }

    const pickBest = (entries: PreviewUrlEntry[]) => {
      const deezerApi = entries.find((entry) => isDeezerApi(entry.url))
      if (deezerApi) return deezerApi
      const stable = entries.find((entry) => !isDeezerTimed(entry.url))
      if (stable) return stable
      return entries[0] || null
    }

    const successful = meta.urls.filter((entry) => entry.successful)
    if (successful.length > 0) {
      const entry = pickBest(successful)
      return entry ? toDeezerApi(entry) : null
    }
    const entry = pickBest(meta.urls)
    return entry ? toDeezerApi(entry) : null
  }, [])

  const selectBestBpm = useCallback((
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
  }, [])

  const selectBestKey = useCallback((
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
  }, [])

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

  const fetchTracksInDbForIds = useCallback(async (trackIds: string[]) => {
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
  }, [])

  const streamBatchResults = useCallback(async (
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

        setState('bpmFullData', (prev) => ({
          ...prev,
          [trackId]: {
            bpmEssentia: data.bpm_essentia,
            bpmRawEssentia: data.bpm_raw_essentia,
            bpmConfidenceEssentia: data.bpm_confidence_essentia,
            bpmLibrosa: data.bpm_librosa,
            bpmRawLibrosa: data.bpm_raw_librosa,
            bpmConfidenceLibrosa: data.bpm_confidence_librosa,
            keyEssentia: data.key_essentia,
            scaleEssentia: data.scale_essentia,
            keyscaleConfidenceEssentia: data.keyscale_confidence_essentia,
            keyLibrosa: data.key_librosa,
            scaleLibrosa: data.scale_librosa,
            keyscaleConfidenceLibrosa: data.keyscale_confidence_librosa,
            bpmSelected,
            keySelected,
            debugTxt: data.debug_txt,
          },
        }))

        if (data.bpm_essentia != null || data.bpm_librosa != null) {
          const selectedBpm = bpmSelected === 'librosa' ? data.bpm_librosa : data.bpm_essentia
          setState('trackBpms', (prev) => ({ ...prev, [trackId]: selectedBpm }))
        }
        if (data.key_essentia || data.key_librosa || data.scale_essentia || data.scale_librosa) {
          const selectedKey = keySelected === 'librosa' ? data.key_librosa : data.key_essentia
          const selectedScale = keySelected === 'librosa' ? data.scale_librosa : data.scale_essentia
          setState('trackKeys', (prev) => ({ ...prev, [trackId]: selectedKey || null }))
          setState('trackScales', (prev) => ({ ...prev, [trackId]: selectedScale || null }))
        }

        if (meta) {
          const previewUrl = getPreviewUrlFromMeta(meta)
          if (previewUrl) {
            setState('previewUrls', (prev) => ({ ...prev, [trackId]: previewUrl }))
          }
        }

        setState('bpmStreamStatus', (prev) => ({ ...prev, [trackId]: 'partial' }))

        if (data.final) {
          finalizedTracks.add(trackId)
          setState('bpmStreamStatus', (prev) => ({ ...prev, [trackId]: 'final' }))
          setState('loadingBpmFields', (prev) => {
            const next = new Set(prev)
            next.delete(trackId)
            return next
          })
          setState('loadingKeyFields', (prev) => {
            const next = new Set(prev)
            next.delete(trackId)
            return next
          })
          setState('tracksNeedingBpm', (prev) => {
            const next = new Set(prev)
            next.delete(trackId)
            return next
          })
          setState('tracksNeedingKey', (prev) => {
            const next = new Set(prev)
            next.delete(trackId)
            return next
          })
        }

        await maybeYield()
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line)
            await handleStreamResult(data)
          } catch (err) {
            console.error('[BPM Client] Error parsing stream data:', err)
          }
        }
      }
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer)
          await handleStreamResult(data)
        } catch (err) {
          console.error('[BPM Client] Error parsing final stream data:', err)
        }
      }
    } catch (error) {
      console.error('[BPM Client] Stream error:', error)
      indexToTrackId.forEach((trackId) => {
        if (!finalizedTracks.has(trackId)) {
          setState('loadingBpmFields', (prev) => {
            const next = new Set(prev)
            next.delete(trackId)
            return next
          })
          setState('loadingKeyFields', (prev) => {
            const next = new Set(prev)
            next.delete(trackId)
            return next
          })
        }
      })
    }
  }, [getPreviewUrlFromMeta, selectBestBpm, selectBestKey, setState])

  const applyBatchResults = useCallback((results: Record<string, any>) => {
    const newBpms: Record<string, number | null> = {}
    const newKeys: Record<string, string | null> = {}
    const newScales: Record<string, string | null> = {}
    const newDetails: Record<string, { source?: string; error?: string }> = {}
    const newDebug: Record<string, any> = {}
    const newFullData: Record<string, BpmFullDataEntry> = {}

    const tracksToAdd = new Set<string>()
    for (const [trackId, result] of Object.entries(results)) {
      const r = result as any
      newDetails[trackId] = { source: r.source, error: r.error }
      newDebug[trackId] = r

      if (r.source || r.error || r.bpmRaw !== undefined || r.cached === true) {
        tracksToAdd.add(trackId)
      }

      if (r.bpm != null) {
        newBpms[trackId] = r.bpm
      } else if (r.bpm === null) {
        newBpms[trackId] = null
      }

      if (r.key != null) {
        newKeys[trackId] = r.key
      } else if (r.key === null) {
        newKeys[trackId] = null
      }

      if (r.scale != null) {
        newScales[trackId] = r.scale
      } else if (r.scale === null) {
        newScales[trackId] = null
      }

      if (r.bpmEssentia || r.bpmLibrosa || r.keyEssentia || r.keyLibrosa || r.scaleEssentia || r.scaleLibrosa) {
        newFullData[trackId] = {
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
          bpmSelected: r.bpmSelected,
          keySelected: r.keySelected,
          bpmManual: r.bpmManual,
          keyManual: r.keyManual,
          scaleManual: r.scaleManual,
          debugTxt: r.debugTxt,
        }
      }
    }

    setState('trackBpms', (prev) => ({ ...prev, ...newBpms }))
    setState('trackKeys', (prev) => ({ ...prev, ...newKeys }))
    setState('trackScales', (prev) => ({ ...prev, ...newScales }))
    setState('bpmDetails', (prev) => ({ ...prev, ...newDetails }))
    setState('bpmDebugInfo', (prev) => ({ ...prev, ...newDebug }))
    setState('bpmFullData', (prev) => ({ ...prev, ...newFullData }))
    if (tracksToAdd.size > 0) {
      setState('tracksInDb', (prev) => {
        const next = new Set(prev)
        tracksToAdd.forEach((trackId) => next.add(trackId))
        return next
      })
    }
  }, [setState])

  const fetchBpmsForTracks = useCallback(async (tracksToFetch: Track[]) => {
    if (tracksToFetch.length === 0) return

    const batchSize = 50
    const results: Record<string, any> = {}

    for (let i = 0; i < tracksToFetch.length; i += batchSize) {
      const batch = tracksToFetch.slice(i, i + batchSize)
      const trackIds = batch.map(track => track.id)
      try {
        const res = await fetch('/api/bpm/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackIds, country: countryCode }),
        })
        if (!res.ok) {
          console.error(`[BPM Client] Batch fetch failed:`, res.status)
          continue
        }
        const data = await res.json()
        Object.assign(results, data.results || {})
      } catch (error) {
        console.error(`[BPM Client] Batch fetch error:`, error)
      }
    }

    applyBatchResults(results)
  }, [applyBatchResults, countryCode])

  const streamBpmsForTracks = useCallback(async (
    tracksToFetch: Track[],
    needsBpm?: Set<string>,
    needsKey?: Set<string>,
    options?: { fallbackOverride?: BpmFallbackOverride }
  ) => {
    if (tracksToFetch.length === 0) return

    const batchSize = 20
    const fallbackNeedsBpm = needsBpm || new Set(tracksToFetch.map(track => track.id))
    const fallbackNeedsKey = needsKey || new Set(tracksToFetch.map(track => track.id))

    setState('tracksNeedingBpm', (prev) => {
      const next = new Set(prev)
      fallbackNeedsBpm.forEach(id => next.add(id))
      return next
    })
    setState('tracksNeedingKey', (prev) => {
      const next = new Set(prev)
      fallbackNeedsKey.forEach(id => next.add(id))
      return next
    })
    setState('tracksNeedingCalc', (prev) => {
      const next = new Set(prev)
      tracksToFetch.forEach(track => next.add(track.id))
      return next
    })

    for (let i = 0; i < tracksToFetch.length; i += batchSize) {
      const batch = tracksToFetch.slice(i, i + batchSize)
      const trackIds = batch.map(track => track.id)

      setState('loadingBpmFields', (prev) => {
        const next = new Set(prev)
        trackIds.forEach(id => {
          if (fallbackNeedsBpm.has(id)) {
            next.add(id)
          }
        })
        return next
      })
      setState('loadingKeyFields', (prev) => {
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
          setState('trackBpms', (prev) => ({ ...prev, [trackId]: null }))
          setState('trackKeys', (prev) => ({ ...prev, [trackId]: null }))
          setState('trackScales', (prev) => ({ ...prev, [trackId]: null }))
          setState('bpmDetails', (prev) => ({
            ...prev,
            [trackId]: { source: r.source, error: r.error },
          }))
          setState('bpmDebugInfo', (prev) => ({
            ...prev,
            [trackId]: {
              ...r,
              urls: r.urls || [],
            },
          }))
          const previewUrl = getPreviewUrlFromMeta({ urls: r.urls })
          if (previewUrl) {
            setState('previewUrls', (prev) => ({ ...prev, [trackId]: previewUrl }))
          }
          setState('bpmStreamStatus', (prev) => ({ ...prev, [trackId]: 'error' }))
          setState('loadingBpmFields', (prev) => {
            const next = new Set(prev)
            next.delete(trackId)
            return next
          })
          setState('loadingKeyFields', (prev) => {
            const next = new Set(prev)
            next.delete(trackId)
            return next
          })
          setState('tracksInDb', (prev) => new Set(prev).add(trackId))
          if (retryTrackId === trackId) {
            setState('retryStatus', { loading: false, success: false, error: r.error || 'BPM calculation failed' })
            setState('retryTrackId', null)
          }
        }

        for (const [trackId, meta] of Object.entries(previewMeta)) {
          const previewUrl = getPreviewUrlFromMeta(meta as any)
          if (previewUrl) {
            setState('previewUrls', (prev) => ({ ...prev, [trackId]: previewUrl }))
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
  }, [bpmRequestSettings, countryCode, fetchBpmsForTracks, getPreviewUrlFromMeta, retryTrackId, setState, streamBatchResults])

  const fetchBpmsBatch = useCallback(async () => {
    const trackIds = tracks.map(t => t.id)
    if (trackIds.length === 0) return

    setState('loadingBpmFields', new Set())
    setState('loadingKeyFields', new Set())
    setState('tracksNeedingBpm', new Set())
    setState('tracksNeedingKey', new Set())
    setState('tracksNeedingCalc', new Set())

    try {
      const res = await fetch('/api/bpm/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds, country: countryCode }),
      })
      if (!res.ok) {
        throw new Error('Unable to fetch BPM batch')
      }
      const data = await res.json()
      applyBatchResults(data.results || {})

      const tracksInDbSet = await fetchTracksInDbForIds(trackIds)
      setState('tracksInDb', tracksInDbSet)

      const tracksToCalculate = tracks.filter(track => !tracksInDbSet.has(track.id))
      if (tracksToCalculate.length > 0) {
        const idsToCalculate = new Set(tracksToCalculate.map(track => track.id))
        setState('tracksNeedingBpm', idsToCalculate)
        setState('tracksNeedingKey', idsToCalculate)
        setState('tracksNeedingCalc', idsToCalculate)
        streamBpmsForTracks(tracksToCalculate, idsToCalculate, idsToCalculate)
      }
    } catch (error) {
      console.error('[BPM Client] Batch fetch error:', error)
      streamBpmsForTracks(tracks)
    }
  }, [tracks, countryCode, fetchTracksInDbForIds, streamBpmsForTracks, applyBatchResults, setState])

  const updateBpmSelection = async (payload: {
    spotifyTrackId: string
    bpmSelected?: 'essentia' | 'librosa' | 'manual'
    keySelected?: 'essentia' | 'librosa' | 'manual'
    bpmManual?: number | null
    keyManual?: string | null
    scaleManual?: string | null
  }) => {
    const trackId = payload.spotifyTrackId
    const previousBpm = trackBpms[trackId]
    const previousKey = trackKeys[trackId]
    const previousScale = trackScales[trackId]
    const previousFullData = bpmFullData[trackId]
    const optimisticFullData: BpmFullDataEntry = {
      ...(previousFullData || {}),
      ...(payload.bpmSelected ? { bpmSelected: payload.bpmSelected } : {}),
      ...(payload.keySelected ? { keySelected: payload.keySelected } : {}),
      ...(payload.bpmManual !== undefined ? { bpmManual: payload.bpmManual } : {}),
      ...(payload.keyManual !== undefined ? { keyManual: payload.keyManual } : {}),
      ...(payload.scaleManual !== undefined ? { scaleManual: payload.scaleManual } : {}),
    }
    const nextBpmSelection = optimisticFullData.bpmSelected
    const nextKeySelection = optimisticFullData.keySelected
    const resolveBpmValue = (
      selection: BpmFullDataEntry['bpmSelected'] | undefined,
      fullData: BpmFullDataEntry
    ) => {
      if (!selection) return undefined
      if (selection === 'manual') {
        if (payload.bpmManual !== undefined) return payload.bpmManual
        return fullData.bpmManual ?? null
      }
      if (selection === 'essentia') return fullData.bpmEssentia ?? null
      if (selection === 'librosa') return fullData.bpmLibrosa ?? null
      return undefined
    }
    const resolveKeyValue = (
      selection: BpmFullDataEntry['keySelected'] | undefined,
      fullData: BpmFullDataEntry
    ) => {
      if (!selection) return { key: undefined, scale: undefined }
      if (selection === 'manual') {
        const key = payload.keyManual !== undefined ? payload.keyManual : fullData.keyManual
        const scale = payload.scaleManual !== undefined ? payload.scaleManual : fullData.scaleManual
        return { key: key ?? null, scale: scale ?? null }
      }
      if (selection === 'essentia') {
        return { key: fullData.keyEssentia ?? null, scale: fullData.scaleEssentia ?? null }
      }
      if (selection === 'librosa') {
        return { key: fullData.keyLibrosa ?? null, scale: fullData.scaleLibrosa ?? null }
      }
      return { key: undefined, scale: undefined }
    }
    const nextBpmValue = resolveBpmValue(nextBpmSelection, optimisticFullData)
    const { key: nextKeyValue, scale: nextScaleValue } = resolveKeyValue(nextKeySelection, optimisticFullData)
    const shouldUpdateBpm = payload.bpmSelected !== undefined || payload.bpmManual !== undefined
    const shouldUpdateKey = payload.keySelected !== undefined || payload.keyManual !== undefined || payload.scaleManual !== undefined
    const shouldUpdateFullData = shouldUpdateBpm || shouldUpdateKey

    setState('isUpdatingSelection', true)
    if (shouldUpdateBpm && nextBpmValue !== undefined) {
      setState('trackBpms', (prev) => ({ ...prev, [trackId]: nextBpmValue }))
    }
    if (shouldUpdateKey && nextKeyValue !== undefined) {
      setState('trackKeys', (prev) => ({ ...prev, [trackId]: nextKeyValue }))
    }
    if (shouldUpdateKey && nextScaleValue !== undefined) {
      setState('trackScales', (prev) => ({ ...prev, [trackId]: nextScaleValue }))
    }
    if (shouldUpdateFullData) {
      setState('bpmFullData', (prev) => ({ ...prev, [trackId]: optimisticFullData }))
    }
    try {
      const res = await fetch('/api/bpm/update-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        throw new Error('Failed to update BPM selection')
      }
      await fetchBpmsBatch()
    } catch (error) {
      if (shouldUpdateBpm) {
        setState('trackBpms', (prev) => {
          const next = { ...prev }
          if (previousBpm === undefined) {
            delete next[trackId]
          } else {
            next[trackId] = previousBpm
          }
          return next
        })
      }
      if (shouldUpdateKey) {
        setState('trackKeys', (prev) => {
          const next = { ...prev }
          if (previousKey === undefined) {
            delete next[trackId]
          } else {
            next[trackId] = previousKey
          }
          return next
        })
        setState('trackScales', (prev) => {
          const next = { ...prev }
          if (previousScale === undefined) {
            delete next[trackId]
          } else {
            next[trackId] = previousScale
          }
          return next
        })
      }
      console.error('[BPM Client] Update selection error:', error)
      if (shouldUpdateFullData) {
        setState('bpmFullData', (prev) => {
          const next = { ...prev }
          if (previousFullData === undefined) {
            delete next[trackId]
          } else {
            next[trackId] = previousFullData
          }
          return next
        })
      }
    } finally {
      setState('isUpdatingSelection', false)
    }
  }

  const recalcTrackWithOptions = async (
    track: Track,
    options?: { fallbackOverride?: BpmFallbackOverride }
  ) => {
    setState('recalcStatus', { loading: true })
    try {
      await fetch('/api/bpm/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds: [track.id] }),
      })
      const targetIds = new Set([track.id])
      streamBpmsForTracks([track], targetIds, targetIds, options)
      setState('recalcStatus', { loading: false, success: true })
    } catch (error) {
      setState('recalcStatus', {
        loading: false,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to recalculate BPM/key',
      })
    }
  }

  const handleMusoPreviewBpm = async (trackId: string) => {
    setState('musoPreviewStatus', { loading: true })
    try {
      const res = await fetch('/api/muso/preview-bpm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotifyTrackId: trackId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Unable to fetch Muso preview')
      }
      setState('musoPreviewStatus', { loading: false, success: true })
      await fetchBpmsBatch()
    } catch (error) {
      setState('musoPreviewStatus', {
        loading: false,
        success: false,
        error: error instanceof Error ? error.message : 'Unable to fetch Muso preview',
      })
    }
  }

  useEffect(() => {
    if (tracks.length > 0 && Object.keys(trackBpms).length === 0) {
      setState('bpmProcessingStartTime', Date.now())
      fetchBpmsBatch()
    }
  }, [tracks.length, trackBpms, fetchBpmsBatch, setState])

  useEffect(() => {
    if (tracks.length > 0 && bpmProcessingStartTime && !bpmProcessingEndTime) {
      const tracksWithBpm = Object.values(trackBpms).filter(bpm => bpm !== null && bpm !== undefined).length
      const tracksWithoutBpm = tracks.filter(t =>
        trackBpms[t.id] === undefined || trackBpms[t.id] === null
      ).length
      const tracksLoading = loadingTrackIds.size
      if (tracksLoading === 0 && tracksWithoutBpm === 0 && tracksWithBpm > 0) {
        setState('bpmProcessingEndTime', Date.now())
      }
    }
  }, [trackBpms, loadingTrackIds, tracks, bpmProcessingStartTime, bpmProcessingEndTime, setState])

  useEffect(() => {
    if (showBpmModal && selectedBpmTrack) {
      const fullData = bpmFullData[selectedBpmTrack.id]
      if (fullData?.bpmManual) {
        setState('manualBpm', String(fullData.bpmManual))
      }
      if (fullData?.keyManual) {
        setState('manualKey', fullData.keyManual || '')
      }
      if (fullData?.scaleManual) {
        setState('manualScale', fullData.scaleManual || 'major')
      }
    } else {
      setState('manualBpm', '')
      setState('manualKey', '')
      setState('manualScale', 'major')
    }
  }, [showBpmModal, selectedBpmTrack, bpmFullData, setState])

  useEffect(() => {
    setState('musoPreviewStatus', null)
  }, [showBpmModal, selectedBpmTrack, setState])

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort()
    }
  }, [])

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
      setState('showBpmNotice', true)
    }
  }, [bpmSummary, setState])

  return {
    state,
    setState,
    fetchTracksInDbForIds,
    fetchBpmForTrack,
    getPreviewUrlFromMeta,
    fetchBpmsBatch,
    streamBpmsForTracks,
    updateBpmSelection,
    recalcTrackWithOptions,
    handleMusoPreviewBpm,
    bpmRequestSettings,
    bpmSummary,
    loadingTrackIds,
    isTrackLoading,
  }
}
