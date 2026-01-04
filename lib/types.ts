/**
 * Shared type definitions for the application
 */

// ============================================================================
// Spotify API Types
// ============================================================================

export interface SpotifyTrack {
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

export interface SpotifyPlaylist {
  id: string
  name: string
  description: string | null
  images: Array<{ url: string }>
  owner: {
    display_name: string
    id: string
    external_urls?: {
      spotify: string
    }
  }
  tracks: {
    total: number
    href: string
  }
  public: boolean
  collaborative: boolean
  followers?: {
    total: number
  }
  external_urls: {
    spotify: string
  }
  snapshot_id: string
  href: string
  uri: string
}

export interface SpotifyPlaylistInfo {
  id: string
  name: string
  description: string | null
  images: Array<{ url: string }>
  owner: {
    display_name: string
    id: string
    external_urls?: {
      spotify: string
    }
  }
  tracks: {
    total: number
  }
  external_urls: {
    spotify: string
  }
}

// ============================================================================
// BPM Types
// ============================================================================

export interface BpmResult {
  bpm: number | null
  source: string
  upc?: string
  bpmRaw?: number
  urlsTried?: string[]
  successfulUrl?: string | null
  error?: string
  cached?: boolean
}

export interface BpmDetails {
  source?: string
  error?: string
  upc?: string
}

// ============================================================================
// API Response States (Discriminated Unions)
// ============================================================================

export type LoadingState = {
  status: 'loading'
}

export type SuccessState<T> = {
  status: 'success'
  data: T
}

export type ErrorState = {
  status: 'error'
  error: Error
  message: string
}

export type ApiResponseState<T> = LoadingState | SuccessState<T> | ErrorState

// ============================================================================
// Component Props Types
// ============================================================================

export type SortField = 'name' | 'artists' | 'album' | 'release_date' | 'duration' | 'added_at' | 'tempo' | 'popularity'
export type SortDirection = 'asc' | 'desc'

// ============================================================================
// Cache Types
// ============================================================================

export interface CachedPlaylist {
  playlist: SpotifyPlaylist
  snapshotId: string
  cachedAt: Date
}

export interface PlaylistCacheResponse {
  isCached: boolean
  cachedAt?: Date
}



