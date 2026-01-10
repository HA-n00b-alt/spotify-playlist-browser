'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'

interface Playlist {
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
  is_cached?: boolean
  cached_at?: string | null
}

interface PlaylistsTableProps {
  playlists: Playlist[]
}

type SortField = 'name' | 'description' | 'owner' | 'tracks' | 'followers'
type SortDirection = 'asc' | 'desc'

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

function formatFollowers(count: number): string {
  if (count >= 1000000) {
    const millions = count / 1000000
    // Format to Y.XXM format (e.g., 1.5M, 12.3M, 999.9M)
    // For values >= 100M, round to whole number
    if (millions >= 100) {
      return Math.round(millions) + 'M'
    }
    // For values < 100M, show one decimal place, remove trailing zero
    return millions.toFixed(1).replace(/\.0$/, '') + 'M'
  } else if (count >= 1000) {
    const thousands = count / 1000
    // Format to Y.XXk format (e.g., 1.5k, 12.3k, 999.9k)
    // For values >= 100k, round to whole number
    if (thousands >= 100) {
      return Math.round(thousands) + 'k'
    }
    // For values < 100k, show one decimal place, remove trailing zero
    return thousands.toFixed(1).replace(/\.0$/, '') + 'k'
  }
  return count.toString()
}

export default function PlaylistsTable({ playlists: initialPlaylists }: PlaylistsTableProps) {
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [playlists, setPlaylists] = useState<Playlist[]>(initialPlaylists)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastVisitTimestamp, setLastVisitTimestamp] = useState<number | null>(null)
  const [playlistHeaderName, setPlaylistHeaderName] = useState<string | null>(null)
  
  const STORAGE_KEY_LAST_VISIT = 'playlist_last_visit'

  // Load last visit timestamp from localStorage and apply order from API
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const savedLastVisit = localStorage.getItem(STORAGE_KEY_LAST_VISIT)
    
    if (savedLastVisit) {
      setLastVisitTimestamp(parseInt(savedLastVisit, 10))
    } else {
      // First visit - set current timestamp
      const now = Date.now()
      localStorage.setItem(STORAGE_KEY_LAST_VISIT, now.toString())
      setLastVisitTimestamp(now)
    }
    
    // Playlists from API are in Spotify's order
    setPlaylists(initialPlaylists)
  }, [initialPlaylists])

  useEffect(() => {
    fetch('/api/auth/status')
      .then((res) => res.json())
      .then((data) => {
        if (data?.authenticated && data?.user) {
          setPlaylistHeaderName(data.user.display_name || data.user.id || null)
        }
      })
      .catch(() => {})
  }, [])

  // Check if playlist is new (not seen before on this page load)
  // A playlist is "new" if it's not in the seen list when the page first loads
  const isNewPlaylist = useCallback((playlist: Playlist): boolean => {
    if (typeof window === 'undefined') return false
    if (hasMarkedAsSeen.current) return false // Once we've marked playlists as seen, nothing is new anymore
    
    // Check if we've seen this playlist before
    const seenPlaylists = localStorage.getItem('playlist_seen_ids')
    if (seenPlaylists) {
      const seen: string[] = JSON.parse(seenPlaylists)
      return !seen.includes(playlist.id)
    }
    // If no seen list exists, all playlists are "new" (first visit ever)
    return true
  }, [])

  // Mark playlists as seen and update lastVisitTimestamp after first render
  // This ensures new playlists are only pinned on the first page load
  const hasMarkedAsSeen = useRef(false)
  useEffect(() => {
    if (typeof window === 'undefined' || hasMarkedAsSeen.current) return
    
    // Mark all current playlists as seen
    const seenPlaylists = localStorage.getItem('playlist_seen_ids')
    const seen: string[] = seenPlaylists ? JSON.parse(seenPlaylists) : []
    const newSeen = [...new Set([...seen, ...playlists.map(p => p.id)])]
    localStorage.setItem('playlist_seen_ids', JSON.stringify(newSeen))
    
    // Update lastVisitTimestamp to current time so these playlists won't be "new" on next load
    const now = Date.now()
    localStorage.setItem(STORAGE_KEY_LAST_VISIT, now.toString())
    setLastVisitTimestamp(now)
    hasMarkedAsSeen.current = true
  }, [playlists])

  // Refresh playlists from Spotify
  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      const response = await fetch('/api/playlists?refresh=true')
      if (response.ok) {
        const refreshedPlaylists = await response.json()
        setPlaylists(refreshedPlaylists)
        // Don't update lastVisitTimestamp on refresh - keep it to detect "new" playlists
      } else {
        console.error('Failed to refresh playlists')
      }
    } catch (error) {
      console.error('Error refreshing playlists:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const filteredPlaylists = useMemo(() => {
    if (!searchQuery) return playlists

    const query = searchQuery.toLowerCase()
    return playlists.filter((playlist) => {
      return (
        playlist.name.toLowerCase().includes(query) ||
        (playlist.description && playlist.description.toLowerCase().includes(query)) ||
        playlist.owner.display_name.toLowerCase().includes(query) ||
        playlist.tracks.total.toString().includes(query) ||
        (playlist.followers?.total && playlist.followers.total.toString().includes(query))
      )
    })
  }, [playlists, searchQuery])

  const sortedPlaylists = useMemo(() => {
    // If no sort field is selected, sort by: 1) new playlists first, 2) original order
    if (!sortField) {
      return [...filteredPlaylists].sort((a, b) => {
        const aIsNew = isNewPlaylist(a)
        const bIsNew = isNewPlaylist(b)
        
        // New playlists first
        if (aIsNew && !bIsNew) return -1
        if (!aIsNew && bIsNew) return 1
        
        // Maintain original order (Spotify's order)
        return 0
      })
    }

    return [...filteredPlaylists].sort((a, b) => {
      // When sorting by a field, still prioritize new playlists first
      const aIsNew = isNewPlaylist(a)
      const bIsNew = isNewPlaylist(b)
      if (aIsNew && !bIsNew) return -1
      if (!aIsNew && bIsNew) return 1
      
      let aValue: string | number
      let bValue: string | number

      switch (sortField) {
        case 'name':
          aValue = a.name.toLowerCase()
          bValue = b.name.toLowerCase()
          break
        case 'description':
          aValue = (a.description || '').toLowerCase()
          bValue = (b.description || '').toLowerCase()
          break
        case 'owner':
          aValue = a.owner.display_name.toLowerCase()
          bValue = b.owner.display_name.toLowerCase()
          break
        case 'tracks':
          aValue = a.tracks.total
          bValue = b.tracks.total
          break
        case 'followers':
          aValue = a.followers?.total ?? -1
          bValue = b.followers?.total ?? -1
          break
        default:
          return 0
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredPlaylists, sortField, sortDirection, isNewPlaylist])

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

  const searchInputRef = useRef<HTMLInputElement | null>(null)

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

  return (
    <div>
      <div className="mb-4 sm:mb-6 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search playlists... (Cmd/Ctrl+F)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            ref={searchInputRef}
            className="w-full rounded-lg bg-[#F3F4F6] py-3 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition hover:border-gray-300 hover:text-gray-900 disabled:border-gray-200 disabled:text-gray-400"
          aria-label="Refresh playlists"
        >
          {isRefreshing ? (
            <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
        </button>
      </div>
      
      {/* Mobile Card View */}
      <div className="block sm:hidden space-y-3">
        {sortedPlaylists.map((playlist, index) => {
          const isNew = isNewPlaylist(playlist)
          const isCached = playlist.is_cached ?? false
          
          return (
            <div
              key={playlist.id}
              className={`rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.06)] p-4 transition-colors ${
                isNew ? 'bg-emerald-50' : 'bg-white hover:bg-[#F9FAFB]'
              }`}
            >
              <Link
                href={`/playlists/${playlist.id}`}
                className="flex items-start gap-3"
              >
                {playlist.images[0] ? (
                    <Image
                      src={playlist.images[0].url}
                      alt={playlist.name}
                      width={60}
                      height={60}
                      className="w-15 h-15 sm:w-12 sm:h-12 object-cover rounded-xl flex-shrink-0"
                    />
                  ) : (
                  <div className="w-15 h-15 sm:w-12 sm:h-12 bg-gray-200 rounded-xl flex-shrink-0 flex items-center justify-center">
                    <span className="text-gray-400 text-xs">No image</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="font-semibold text-[#171923] truncate flex-1">
                      {playlist.name}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isCached && (
                        <span className="group relative inline-flex h-6 w-6 items-center justify-center rounded-full border border-blue-200 text-[11px] font-semibold text-blue-700">
                          C
                          <span className="pointer-events-none absolute right-0 top-7 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 opacity-0 shadow-sm transition-opacity duration-0 group-hover:opacity-100">
                            Using cached data
                          </span>
                        </span>
                      )}
                      {isNew && (
                        <span
                          className="text-[11px] text-emerald-700 border border-emerald-200 bg-[#F5F5F7] px-1.5 py-0.5 rounded-full font-semibold"
                          title="New"
                        >
                          New
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-gray-500 mb-2 line-clamp-1">
                    {playlist.description ? (
                      stripHtmlTags(playlist.description)
                    ) : (
                      <span className="text-gray-400 italic">No description</span>
                    )}
                  </div>
                  <div className="flex flex-nowrap items-center text-xs text-gray-500 overflow-hidden">
                    <span className="truncate max-w-[60px] flex-shrink-0" title={playlist.owner.display_name}>
                      {playlist.owner.external_urls?.spotify ? (
                        <a
                          href={playlist.owner.external_urls.spotify}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-600 hover:text-emerald-700 block truncate"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {playlist.owner.display_name}
                        </a>
                      ) : (
                        <span className="block truncate">{playlist.owner.display_name}</span>
                      )}
                    </span>
                    <span className="flex-shrink-0 mx-1">•</span>
                    <span className="flex-shrink-0 text-center whitespace-nowrap">{playlist.tracks.total} tracks</span>
                    {playlist.followers?.total !== undefined && (
                      <>
                        <span className="flex-shrink-0 mx-1">•</span>
                        <span className="flex-shrink-0 text-center whitespace-nowrap">{formatFollowers(playlist.followers.total)} followers</span>
                      </>
                    )}
                  </div>
                  </div>
                </Link>
            </div>
          )
        })}
      </div>
      
      {/* Desktop Table View */}
      <div className="hidden sm:block bg-white rounded-2xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/70 border-b border-gray-100">
              <tr>
                <th
                  className="px-4 lg:px-6 py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] cursor-pointer hover:text-gray-700 select-none"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center">
                    <div className="flex min-w-0 items-center">
                      {playlistHeaderName ? (
                        <span className="min-w-0 truncate" title={playlistHeaderName.toUpperCase()}>
                          {playlistHeaderName.toUpperCase()}
                        </span>
                      ) : null}
                      <span className={`flex-shrink-0${playlistHeaderName ? ' ml-1' : ''}`}>PLAYLIST</span>
                    </div>
                    <SortIcon field="name" />
                  </div>
                </th>
                <th className="px-2 py-3 text-center text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] w-16">
                  Status
                </th>
                <th
                  className="px-4 lg:px-6 py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] cursor-pointer hover:text-gray-700 select-none hidden md:table-cell"
                  onClick={() => handleSort('description')}
                >
                  <div className="flex items-center">
                    Description
                    <SortIcon field="description" />
                  </div>
                </th>
                <th
                  className="px-4 lg:px-6 py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] cursor-pointer hover:text-gray-700 select-none"
                  onClick={() => handleSort('owner')}
                >
                  <div className="flex items-center">
                    Owner
                    <SortIcon field="owner" />
                  </div>
                </th>
                <th
                  className="px-4 lg:px-6 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] cursor-pointer hover:text-gray-700 select-none"
                  onClick={() => handleSort('tracks')}
                >
                  <div className="flex items-center justify-end">
                    Tracks
                    <SortIcon field="tracks" />
                  </div>
                </th>
                <th
                  className="px-4 lg:px-6 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] cursor-pointer hover:text-gray-700 select-none hidden lg:table-cell"
                  onClick={() => handleSort('followers')}
                >
                  <div className="flex items-center justify-end">
                    Followers
                    <SortIcon field="followers" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedPlaylists.map((playlist) => {
                const isNew = isNewPlaylist(playlist)
                const isCached = playlist.is_cached ?? false
                
                return (
                  <tr
                    key={playlist.id}
                    className={`transition-colors ${
                      isNew ? 'bg-emerald-50 hover:bg-emerald-100' : 'hover:bg-[#F9FAFB]'
                    }`}
                  >
                    <td className="px-4 lg:px-6 py-4">
                      <Link
                        href={`/playlists/${playlist.id}`}
                        className="flex items-center gap-3 sm:gap-4 group"
                      >
                        {playlist.images[0] ? (
                          <Image
                            src={playlist.images[0].url}
                            alt={playlist.name}
                            width={50}
                            height={50}
                            className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded-xl flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-200 rounded-xl flex-shrink-0 flex items-center justify-center">
                            <span className="text-gray-400 text-xs">No image</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[#171923] group-hover:text-emerald-600 transition-colors truncate text-sm sm:text-base">
                            {playlist.name}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-2 py-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {isCached && (
                          <span className="group relative inline-flex h-6 w-6 items-center justify-center rounded-full border border-blue-200 text-[11px] font-semibold text-blue-700">
                            C
                            <span className="pointer-events-none absolute right-0 top-7 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 opacity-0 shadow-sm transition-opacity duration-0 group-hover:opacity-100">
                              Using cached data
                            </span>
                          </span>
                        )}
                        {isNew && (
                          <span
                            className="text-[11px] text-emerald-700 border border-emerald-200 bg-[#F5F5F7] px-2 py-0.5 rounded-full"
                            title="New"
                          >
                            N
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-4 hidden md:table-cell">
                      <div className="text-gray-500 max-w-xs truncate text-sm">
                        {playlist.description ? (
                          stripHtmlTags(playlist.description)
                        ) : (
                          <span className="text-gray-400 italic">No description</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-4">
                      {playlist.owner.external_urls?.spotify ? (
                        <a
                          href={playlist.owner.external_urls.spotify}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-600 hover:text-emerald-700 hover:underline text-sm sm:text-base"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {playlist.owner.display_name}
                        </a>
                      ) : (
                        <div className="text-gray-500 text-sm sm:text-base">{playlist.owner.display_name}</div>
                      )}
                    </td>
                    <td className="px-4 lg:px-6 py-4 text-right">
                      <div className="text-gray-500 text-sm sm:text-base">{playlist.tracks.total}</div>
                    </td>
                    <td className="px-4 lg:px-6 py-4 text-right hidden lg:table-cell pr-6">
                      <div className="text-gray-500 text-sm sm:text-base">
                        {playlist.followers?.total !== undefined ? playlist.followers.total.toLocaleString() : '-'}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      
      {filteredPlaylists.length === 0 && playlists.length > 0 && (
        <div className="mt-4 text-center py-8 text-gray-500 text-sm sm:text-base">
          No playlists match your search
        </div>
      )}
      
      {searchQuery && filteredPlaylists.length > 0 && (
        <div className="mt-4 text-xs sm:text-sm text-gray-600">
          Showing {filteredPlaylists.length} of {playlists.length} playlists
        </div>
      )}
    </div>
  )
}
