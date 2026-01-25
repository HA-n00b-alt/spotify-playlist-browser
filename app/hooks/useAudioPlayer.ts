'use client'

import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import type { SpotifyTrack } from '@/lib/types'

type Track = SpotifyTrack

type AudioPlayerOptions = {
  previewUrls: Record<string, string | null>
  setPreviewUrls: (value: Record<string, string | null> | ((prev: Record<string, string | null>) => Record<string, string | null>)) => void
  loadingPreviewIds: Set<string>
  setLoadingPreviewIds: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void
  fetchPreviewMeta: (trackId: string, country?: string) => Promise<any>
  getPreviewUrlFromMeta: (meta: { urls?: Array<{ url: string; successful?: boolean }> }) => string | null
  countryCode: string
}

export function useAudioPlayer({
  previewUrls,
  setPreviewUrls,
  loadingPreviewIds,
  setLoadingPreviewIds,
  fetchPreviewMeta,
  getPreviewUrlFromMeta,
  countryCode,
}: AudioPlayerOptions) {
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCache = useRef<Map<string, string>>(new Map())

  const loadAudioWithCache = async (url: string, trackId: string): Promise<string> => {
    if (!url) return url
    if (audioCache.current.has(url)) {
      return audioCache.current.get(url)!
    }

    try {
      const originalUrl = url
      const isDeezerApi = url.includes('api.deezer.com')
      if (isDeezerApi) {
        const apiUrl = `/api/deezer-preview?url=${encodeURIComponent(url)}`
        console.log('[Preview Debug] Resolving Deezer API preview:', apiUrl)
        const response = await fetch(apiUrl)
        if (!response.ok) {
          const errorText = await response.text()
          console.error('[Preview Debug] Deezer preview resolve failed:', response.status, errorText)
          throw new Error(`Deezer preview resolve failed: ${response.status}`)
        }
        const data = await response.json()
        if (!data?.previewUrl) {
          throw new Error('Deezer preview URL missing')
        }
        url = data.previewUrl
      }

      const isDeezer = url.includes('deezer.com') || url.includes('cdn-preview') || url.includes('cdnt-preview') || url.includes('e-cdn-preview')

      if (isDeezer) {
        const proxyUrl = `/api/audio-proxy?url=${encodeURIComponent(url)}`
        console.log('[Preview Debug] Fetching audio via proxy:', proxyUrl)
        const response = await fetch(proxyUrl)
        if (!response.ok) {
          const errorText = await response.text()
          console.error('[Preview Debug] Proxy fetch failed:', response.status, errorText)
          throw new Error(`Proxy fetch failed: ${response.status}`)
        }
        const blob = await response.blob()
        const blobUrl = URL.createObjectURL(blob)
        audioCache.current.set(url, blobUrl)
        if (isDeezerApi) {
          audioCache.current.set(originalUrl, blobUrl)
        }
        return blobUrl
      }

      const proxyUrl = `/api/audio-proxy?url=${encodeURIComponent(url)}`
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
      if (isDeezerApi) {
        audioCache.current.set(originalUrl, blobUrl)
      }
      return blobUrl
    } catch (error) {
      console.error('[Preview Debug] Error loading audio:', error)
      const isDeezerLike = url.includes('deezer.com') || url.includes('cdn-preview') || url.includes('cdnt-preview') || url.includes('e-cdn-preview')
      if (isDeezerLike) {
        audioCache.current.delete(url)
        setPreviewUrls((prev) => {
          const next = { ...prev }
          delete next[trackId]
          return next
        })
        throw error
      }
      audioCache.current.set(url, url)
      return url
    }
  }

  const hasPreview = (trackId: string): boolean => {
    const url = previewUrls[trackId]
    return url !== null && url !== undefined && url !== ''
  }

  const getPreviewTooltip = (trackId: string): string => {
    if (loadingPreviewIds.has(trackId)) {
      return 'Loading preview...'
    }
    if (hasPreview(trackId)) {
      return 'Click to play preview'
    }
    return 'Preview not available'
  }

  const playPreview = async (track: Track, previewUrl: string) => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }

    if (playingTrackId === track.id) {
      setPlayingTrackId(null)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      return
    }

    setPlayingTrackId(track.id)

    try {
      const audioUrl = await loadAudioWithCache(previewUrl, track.id)
      const audio = new Audio(audioUrl)
      audio.volume = 0.5
      audio.crossOrigin = 'anonymous'
      audioRef.current = audio
      audio.play().catch((error) => {
        console.error('[Preview Debug] Error playing preview:', error)
        setPlayingTrackId(null)
        audioRef.current = null
      })

      audio.addEventListener('ended', () => {
        setPlayingTrackId(null)
        audioRef.current = null
      })

      audio.addEventListener('error', () => {
        setPlayingTrackId(null)
        audioRef.current = null
        if (previewUrl && (previewUrl.includes('deezer.com') || previewUrl.includes('cdn-preview') || previewUrl.includes('cdnt-preview'))) {
          setPreviewUrls((prev) => {
            const next = { ...prev }
            delete next[track.id]
            return next
          })
        }
      })
    } catch (error) {
      console.error('[Preview Debug] Error loading audio:', error)
      setPlayingTrackId(null)
    }
  }

  const handleTrackInteraction = async (
    track: Track,
    event?: MouseEvent<Element>,
    options?: { preventDefault?: boolean; stopPropagation?: boolean }
  ) => {
    if (event) {
      if (options?.preventDefault) {
        event.preventDefault()
      }
      if (options?.stopPropagation) {
        event.stopPropagation()
      }
      if (event.target instanceof HTMLElement) {
        if (event.target.closest('a') || event.target.closest('button')) {
          return
        }
      }
    }

    let previewUrl = previewUrls[track.id] || null
    if (!previewUrl && !loadingPreviewIds.has(track.id)) {
      try {
        setLoadingPreviewIds((prev) => new Set(prev).add(track.id))
        const data = await fetchPreviewMeta(track.id, countryCode)
        const previewUrlFromMeta = getPreviewUrlFromMeta({ urls: data.urls })
        if (previewUrlFromMeta) {
          previewUrl = previewUrlFromMeta
          setPreviewUrls((prev) => ({
            ...prev,
            [track.id]: previewUrlFromMeta,
          }))
        }
      } finally {
        setLoadingPreviewIds((prev) => {
          const next = new Set(prev)
          next.delete(track.id)
          return next
        })
      }
    }

    if (previewUrl) {
      await playPreview(track, previewUrl)
    } else {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      setPlayingTrackId(null)
      audioRef.current = null
    }
  }

  const handleTrackClick = async (track: Track, event?: MouseEvent) => {
    await handleTrackInteraction(track, event)
  }

  const handleTrackTitleClick = async (event: MouseEvent<Element>, track: Track) => {
    await handleTrackInteraction(track, event, { preventDefault: true, stopPropagation: true })
  }

  useEffect(() => {
    const cache = audioCache.current
    const handleBeforeUnload = () => {
      cache.forEach((blobUrl) => {
        if (blobUrl.startsWith('blob:')) {
          URL.revokeObjectURL(blobUrl)
        }
      })
      cache.clear()
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
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
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

  return {
    playingTrackId,
    handleTrackClick,
    handleTrackTitleClick,
    getPreviewTooltip,
  }
}
