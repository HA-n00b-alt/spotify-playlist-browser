'use client'

import { useState, useMemo } from 'react'
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
}

interface PlaylistsTableProps {
  playlists: Playlist[]
}

type SortField = 'name' | 'description' | 'owner' | 'tracks' | 'followers'
type SortDirection = 'asc' | 'desc'

function decodeHtmlEntities(text: string): string {
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}

export default function PlaylistsTable({ playlists }: PlaylistsTableProps) {
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [searchQuery, setSearchQuery] = useState('')

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
    if (!sortField) return filteredPlaylists

    return [...filteredPlaylists].sort((a, b) => {
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
  }, [filteredPlaylists, sortField, sortDirection])

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
      <div className="mb-4 sm:mb-6">
        <input
          type="text"
          placeholder="Search playlists..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 sm:py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-base sm:text-sm"
        />
      </div>
      
      {/* Mobile Card View */}
      <div className="block sm:hidden space-y-3">
        {sortedPlaylists.map((playlist) => (
          <Link
            key={playlist.id}
            href={`/playlists/${playlist.id}`}
            className="block bg-white rounded-lg border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-3">
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
                <div className="font-medium text-gray-900 mb-1 truncate">
                  {playlist.name}
                </div>
                {playlist.description && (
                  <div className="text-sm text-gray-600 mb-2 line-clamp-2">
                    {decodeHtmlEntities(playlist.description)}
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
            </div>
          </Link>
        ))}
      </div>
      
      {/* Desktop Table View */}
      <div className="hidden sm:block bg-white rounded-lg overflow-hidden border border-gray-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th
                  className="px-4 lg:px-6 py-3 text-left text-xs sm:text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center">
                    Playlist
                    <SortIcon field="name" />
                  </div>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedPlaylists.map((playlist) => (
                <tr
                  key={playlist.id}
                  className="hover:bg-gray-50 transition-colors"
                >
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
                  <td className="px-4 lg:px-6 py-3 hidden md:table-cell">
                    <div className="text-gray-600 max-w-md truncate text-sm">
                      {playlist.description ? (
                        decodeHtmlEntities(playlist.description)
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
                  <td className="px-4 lg:px-6 py-3 text-right hidden lg:table-cell">
                    <div className="text-gray-700 text-sm sm:text-base">
                      {playlist.followers?.total !== undefined ? playlist.followers.total.toLocaleString() : '-'}
                    </div>
                  </td>
                </tr>
              ))}
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

