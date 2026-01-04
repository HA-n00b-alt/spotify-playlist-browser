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
  display_order?: number | null
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

export default function PlaylistsTable({ playlists: initialPlaylists }: PlaylistsTableProps) {
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [playlists, setPlaylists] = useState<Playlist[]>(initialPlaylists)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastVisitTimestamp, setLastVisitTimestamp] = useState<number | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  
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
    
    // Playlists from API are already sorted by display_order if available
    setPlaylists(initialPlaylists)
  }, [initialPlaylists])

  // Save order to database via API
  const saveOrder = async (newOrder: Playlist[]) => {
    try {
      const playlistIds = newOrder.map(p => p.id)
      const response = await fetch('/api/playlists/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playlistIds }),
      })
      
      if (!response.ok) {
        console.error('Failed to save playlist order')
      }
    } catch (error) {
      console.error('Error saving playlist order:', error)
    }
  }

  // Update last visit timestamp when playlists change
  useEffect(() => {
    if (typeof window === 'undefined' || playlists.length === 0) return
    
    const now = Date.now()
    localStorage.setItem(STORAGE_KEY_LAST_VISIT, now.toString())
    setLastVisitTimestamp(now)
  }, [playlists.length])

  // Check if playlist is new (created after last visit)
  const isNewPlaylist = useCallback((playlist: Playlist): boolean => {
    if (!lastVisitTimestamp) return false
    // We can't determine creation date from Spotify API, so we'll use cached_at as a proxy
    // If it's cached and cached_at is after last visit, it's "new" to us
    if (playlist.cached_at) {
      const cachedAt = new Date(playlist.cached_at).getTime()
      return cachedAt > lastVisitTimestamp
    }
    // If not cached, assume it's new if we haven't seen it before
    // We'll track seen playlists in localStorage
    if (typeof window === 'undefined') return false
    const seenPlaylists = localStorage.getItem('playlist_seen_ids')
    if (seenPlaylists) {
      const seen: string[] = JSON.parse(seenPlaylists)
      return !seen.includes(playlist.id)
    }
    return false
  }, [lastVisitTimestamp])

  // Mark playlist as seen
  useEffect(() => {
    if (typeof window === 'undefined') return
    const seenPlaylists = localStorage.getItem('playlist_seen_ids')
    const seen: string[] = seenPlaylists ? JSON.parse(seenPlaylists) : []
    const newSeen = [...new Set([...seen, ...playlists.map(p => p.id)])]
    localStorage.setItem('playlist_seen_ids', JSON.stringify(newSeen))
  }, [playlists])

  // Refresh playlists from Spotify
  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      const response = await fetch('/api/playlists?refresh=true')
      if (response.ok) {
        const refreshedPlaylists = await response.json()
        setPlaylists(refreshedPlaylists)
        // Update last visit timestamp
        const now = Date.now()
        localStorage.setItem(STORAGE_KEY_LAST_VISIT, now.toString())
        setLastVisitTimestamp(now)
      } else {
        console.error('Failed to refresh playlists')
      }
    } catch (error) {
      console.error('Error refreshing playlists:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      return
    }

    const newPlaylists = [...playlists]
    const draggedItem = newPlaylists[draggedIndex]
    newPlaylists.splice(draggedIndex, 1)
    newPlaylists.splice(dropIndex, 0, draggedItem)
    
    setPlaylists(newPlaylists)
    saveOrder(newPlaylists)
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
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
    // If no sort field is selected, sort by: 1) new playlists first, 2) display_order, 3) original order
    if (!sortField) {
      return [...filteredPlaylists].sort((a, b) => {
        const aIsNew = isNewPlaylist(a)
        const bIsNew = isNewPlaylist(b)
        
        // New playlists first
        if (aIsNew && !bIsNew) return -1
        if (!aIsNew && bIsNew) return 1
        
        // Then by display_order if available
        const aOrder = a.display_order ?? null
        const bOrder = b.display_order ?? null
        if (aOrder !== null && bOrder !== null) {
          return aOrder - bOrder
        }
        if (aOrder !== null) return -1
        if (bOrder !== null) return 1
        
        // Maintain original order
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

  return (
    <div>
      <div className="mb-4 sm:mb-6 flex gap-3">
        <input
          type="text"
          placeholder="Search playlists..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-4 py-3 sm:py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-base sm:text-sm"
        />
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors text-sm sm:text-base whitespace-nowrap"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
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
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`rounded-lg border shadow-sm p-4 hover:shadow-md transition-shadow ${
                isNew ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
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
                    className="w-15 h-15 sm:w-12 sm:h-12 object-cover rounded flex-shrink-0"
                  />
                ) : (
                  <div className="w-15 h-15 sm:w-12 sm:h-12 bg-gray-200 rounded flex-shrink-0 flex items-center justify-center">
                    <span className="text-gray-400 text-xs">No image</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="font-medium text-gray-900 truncate flex-1">
                      {playlist.name}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isCached && (
                        <span
                          className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-semibold"
                          title="Cached"
                        >
                          C
                        </span>
                      )}
                      {isNew && (
                        <span
                          className="text-xs bg-green-600 text-white px-1.5 py-0.5 rounded font-semibold"
                          title="New"
                        >
                          New
                        </span>
                      )}
                    </div>
                  </div>
                  {playlist.description && (
                    <div className="text-sm text-gray-600 mb-2 line-clamp-2">
                      {stripHtmlTags(playlist.description)}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                    <span>
                      {playlist.owner.external_urls?.spotify ? (
                        <a
                          href={playlist.owner.external_urls.spotify}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 hover:text-green-700"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {playlist.owner.display_name}
                        </a>
                      ) : (
                        playlist.owner.display_name
                      )}
                    </span>
                    <span>•</span>
                    <span>{playlist.tracks.total} tracks</span>
                    {playlist.followers?.total !== undefined && (
                      <>
                        <span>•</span>
                        <span>{playlist.followers.total.toLocaleString()} followers</span>
                      </>
                    )}
                  </div>
                </div>
              </Link>
              <div
                className="cursor-move text-gray-400 hover:text-gray-600 mt-2"
                title="Drag to reorder"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 8h16M4 16h16"
                  />
                </svg>
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Desktop Table View */}
      <div className="hidden sm:block bg-white rounded-lg overflow-hidden border border-gray-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 lg:px-6 py-3 w-8"></th>
                <th
                  className="px-4 lg:px-6 py-3 text-left text-xs sm:text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center">
                    Playlist
                    <SortIcon field="name" />
                  </div>
                </th>
                <th className="px-2 py-3 text-center text-xs sm:text-sm font-medium text-gray-700 w-16">
                  Status
                </th>
                <th
                  className="px-4 lg:px-6 py-3 text-left text-xs sm:text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100 select-none hidden md:table-cell"
                  onClick={() => handleSort('description')}
                >
                  <div className="flex items-center">
                    Description
                    <SortIcon field="description" />
                  </div>
                </th>
                <th
                  className="px-4 lg:px-6 py-3 text-left text-xs sm:text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('owner')}
                >
                  <div className="flex items-center">
                    Owner
                    <SortIcon field="owner" />
                  </div>
                </th>
                <th
                  className="px-4 lg:px-6 py-3 text-right text-xs sm:text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('tracks')}
                >
                  <div className="flex items-center justify-end">
                    Tracks
                    <SortIcon field="tracks" />
                  </div>
                </th>
                <th
                  className="px-4 lg:px-6 py-3 text-right text-xs sm:text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100 select-none hidden lg:table-cell"
                  onClick={() => handleSort('followers')}
                >
                  <div className="flex items-center justify-end">
                    Followers
                    <SortIcon field="followers" />
                  </div>
                </th>
                <th className="px-4 lg:px-6 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedPlaylists.map((playlist, index) => {
                const isNew = isNewPlaylist(playlist)
                const isCached = playlist.is_cached ?? false
                const isDragging = draggedIndex === index
                const isDragOver = dragOverIndex === index
                
                return (
                  <tr
                    key={playlist.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`transition-colors ${
                      isDragging ? 'opacity-50' : ''
                    } ${isDragOver ? 'bg-blue-50' : ''} ${
                      isNew ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-2 py-3">
                      <div
                        className="cursor-move text-gray-400 hover:text-gray-600"
                        title="Drag to reorder"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 8h16M4 16h16"
                          />
                        </svg>
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-3">
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
                            className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-200 rounded flex-shrink-0 flex items-center justify-center">
                            <span className="text-gray-400 text-xs">No image</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-gray-900 group-hover:text-green-600 transition-colors truncate text-sm sm:text-base">
                            {playlist.name}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {isCached && (
                          <span
                            className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded"
                            title="Cached"
                          >
                            C
                          </span>
                        )}
                        {isNew && (
                          <span
                            className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded"
                            title="New"
                          >
                            N
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-3 hidden md:table-cell">
                      <div className="text-gray-600 max-w-md truncate text-sm">
                        {playlist.description ? (
                          stripHtmlTags(playlist.description)
                        ) : (
                          <span className="text-gray-400 italic">No description</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-3">
                      {playlist.owner.external_urls?.spotify ? (
                        <a
                          href={playlist.owner.external_urls.spotify}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 hover:text-green-700 hover:underline text-sm sm:text-base"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {playlist.owner.display_name}
                        </a>
                      ) : (
                        <div className="text-gray-700 text-sm sm:text-base">{playlist.owner.display_name}</div>
                      )}
                    </td>
                    <td className="px-4 lg:px-6 py-3 text-right">
                      <div className="text-gray-700 text-sm sm:text-base">{playlist.tracks.total}</div>
                    </td>
                    <td className="px-4 lg:px-6 py-3 text-right hidden lg:table-cell pr-6">
                      <div className="text-gray-700 text-sm sm:text-base">
                        {playlist.followers?.total !== undefined ? playlist.followers.total.toLocaleString() : '-'}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div
                        className="cursor-move text-gray-400 hover:text-gray-600"
                        title="Drag to reorder"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 8h16M4 16h16"
                          />
                        </svg>
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

