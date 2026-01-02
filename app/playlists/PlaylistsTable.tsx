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
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search playlists by name, description, owner, tracks, or followers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
      </div>
      
      <div className="bg-white rounded-lg overflow-hidden border border-gray-200 shadow-sm">
        <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th
              className="px-6 py-4 text-left text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
              onClick={() => handleSort('name')}
            >
              <div className="flex items-center">
                Playlist
                <SortIcon field="name" />
              </div>
            </th>
            <th
              className="px-6 py-4 text-left text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
              onClick={() => handleSort('description')}
            >
              <div className="flex items-center">
                Description
                <SortIcon field="description" />
              </div>
            </th>
            <th
              className="px-6 py-4 text-left text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
              onClick={() => handleSort('owner')}
            >
              <div className="flex items-center">
                Owner
                <SortIcon field="owner" />
              </div>
            </th>
            <th
              className="px-6 py-4 text-right text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
              onClick={() => handleSort('tracks')}
            >
              <div className="flex items-center justify-end">
                Tracks
                <SortIcon field="tracks" />
              </div>
            </th>
            <th
              className="px-6 py-4 text-right text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
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
              <td className="px-6 py-4">
                <Link
                  href={`/playlists/${playlist.id}`}
                  className="flex items-center gap-4 group"
                >
                  {playlist.images[0] ? (
                    <Image
                      src={playlist.images[0].url}
                      alt={playlist.name}
                      width={50}
                      height={50}
                      className="w-12 h-12 object-cover rounded flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gray-200 rounded flex-shrink-0 flex items-center justify-center">
                      <span className="text-gray-400 text-xs">No image</span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 group-hover:text-green-600 transition-colors truncate">
                      {playlist.name}
                    </div>
                  </div>
                </Link>
              </td>
              <td className="px-6 py-4">
                <div className="text-gray-600 max-w-md truncate">
                  {playlist.description || <span className="text-gray-400 italic">No description</span>}
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="text-gray-700">{playlist.owner.display_name}</div>
              </td>
              <td className="px-6 py-4 text-right">
                <div className="text-gray-700">{playlist.tracks.total}</div>
              </td>
              <td className="px-6 py-4 text-right">
                <div className="text-gray-700">
                  {playlist.followers?.total !== undefined ? playlist.followers.total.toLocaleString() : '-'}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      
      {filteredPlaylists.length === 0 && playlists.length > 0 && (
        <div className="mt-4 text-center py-8 text-gray-500">
          No playlists match your search
        </div>
      )}
      
      {searchQuery && filteredPlaylists.length > 0 && (
        <div className="mt-4 text-sm text-gray-600">
          Showing {filteredPlaylists.length} of {playlists.length} playlists
        </div>
      )}
    </div>
  )
}

