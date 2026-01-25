'use client'

import type { MouseEvent } from 'react'
import type { SpotifyTrack, SortField, SortDirection } from '@/lib/types'
import TrackRow from './TrackRow'

type Track = SpotifyTrack

type TrackTableProps = {
  sortedTracks: Track[]
  paginatedTracks: Track[]
  searchQuery: string
  yearFrom: string
  yearTo: string
  bpmFrom: string
  bpmTo: string
  sortField: SortField | null
  sortDirection: SortDirection
  pageSize: number | 'all'
  safePage: number
  playingTrackId: string | null
  isAdmin: boolean
  trackBpms: Record<string, number | null>
  trackKeys: Record<string, string | null>
  trackScales: Record<string, string | null>
  loadingBpmFields: Set<string>
  loadingKeyFields: Set<string>
  tracksNeedingBpm: Set<string>
  tracksNeedingKey: Set<string>
  bpmStreamStatus: Record<string, 'partial' | 'final' | 'error'>
  getPreviewTooltip: (trackId: string) => string
  formatDuration: (durationMs: number) => string
  formatDate: (value: string) => string
  getYearString: (value: string) => string
  onSort: (field: SortField) => void
  onTrackClick: (track: Track, event?: MouseEvent) => void
  onTrackContextMenu: (event: MouseEvent, track: Track) => void
  onTrackTitleClick: (event: MouseEvent<HTMLAnchorElement>, track: Track) => void
  onArtistClick: (event: MouseEvent<HTMLAnchorElement>, artist: Track['artists'][number]) => void
  onArtistContextMenu: (event: MouseEvent, artist: Track['artists'][number]) => void
  onAlbumClick: (event: MouseEvent<HTMLAnchorElement>, album: Track['album']) => void
  onAlbumContextMenu: (event: MouseEvent, album: Track['album']) => void
  onOpenBpmModal: (track: Track) => void
}

function SortIcon({ field, sortField, sortDirection }: { field: SortField; sortField: SortField | null; sortDirection: SortDirection }) {
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

export default function TrackTable({
  sortedTracks,
  paginatedTracks,
  searchQuery,
  yearFrom,
  yearTo,
  bpmFrom,
  bpmTo,
  sortField,
  sortDirection,
  pageSize,
  safePage,
  playingTrackId,
  isAdmin,
  trackBpms,
  trackKeys,
  trackScales,
  loadingBpmFields,
  loadingKeyFields,
  tracksNeedingBpm,
  tracksNeedingKey,
  bpmStreamStatus,
  getPreviewTooltip,
  formatDuration,
  formatDate,
  getYearString,
  onSort,
  onTrackClick,
  onTrackContextMenu,
  onTrackTitleClick,
  onArtistClick,
  onArtistContextMenu,
  onAlbumClick,
  onAlbumContextMenu,
  onOpenBpmModal,
}: TrackTableProps) {
  return (
    <div className="hidden sm:block overflow-hidden rounded-2xl bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06)] border-t border-gray-100 dark:border-slate-800 dark:bg-slate-900">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-white/70 dark:bg-slate-900/90">
            <tr>
              <th className="px-3 lg:px-4 py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 w-12">
                #
              </th>
              <th
                className="px-3 lg:px-4 py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 w-12 lg:w-16"
                aria-label="Cover"
              >
              </th>
              <th
                className="px-3 lg:px-4 py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 cursor-pointer hover:text-gray-700 dark:hover:text-slate-200 select-none"
                onClick={() => onSort('name')}
              >
                <div className="flex items-center">
                  Track
                  <SortIcon field="name" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th
                className="px-3 lg:px-4 py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 cursor-pointer hover:text-gray-700 dark:hover:text-slate-200 select-none hidden md:table-cell max-w-[120px]"
                onClick={() => onSort('artists')}
              >
                <div className="flex items-center">
                  Artist
                  <SortIcon field="artists" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th
                className="px-3 lg:px-4 py-3 text-left text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 cursor-pointer hover:text-gray-700 dark:hover:text-slate-200 select-none hidden lg:table-cell max-w-[150px]"
                onClick={() => onSort('album')}
              >
                <div className="flex items-center">
                  Album
                  <SortIcon field="album" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th
                className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 cursor-pointer hover:text-gray-700 dark:hover:text-slate-200 select-none hidden md:table-cell"
                onClick={() => onSort('duration')}
              >
                <div className="flex items-center justify-end">
                  Duration
                  <SortIcon field="duration" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th
                className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 cursor-pointer hover:text-gray-700 dark:hover:text-slate-200 select-none hidden md:table-cell"
                onClick={() => onSort('tempo')}
              >
                <div className="flex items-center justify-end">
                  BPM
                  <SortIcon field="tempo" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 hidden md:table-cell min-w-[96px]">
                Key
              </th>
              <th
                className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 cursor-pointer hover:text-gray-700 dark:hover:text-slate-200 select-none"
                onClick={() => onSort('release_date')}
              >
                <div className="flex items-center justify-end">
                  Year
                  <SortIcon field="release_date" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th
                className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 cursor-pointer hover:text-gray-700 dark:hover:text-slate-200 select-none hidden lg:table-cell"
                onClick={() => onSort('popularity')}
              >
                <div className="flex items-center justify-end">
                  Popularity
                  <SortIcon field="popularity" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th
                className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500 cursor-pointer hover:text-gray-700 dark:hover:text-slate-200 select-none hidden lg:table-cell"
                onClick={() => onSort('added_at')}
              >
                <div className="flex items-center justify-end">
                  Added
                  <SortIcon field="added_at" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th className="px-3 lg:px-4 py-3 text-right text-[11px] uppercase tracking-[0.05em] font-medium text-[#A0AEC0] dark:text-slate-500">
                <span className="sr-only">Options</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedTracks.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-gray-500 dark:text-slate-400">
                  {(searchQuery || yearFrom || yearTo || bpmFrom || bpmTo) ? 'No tracks match your filters' : 'No tracks found'}
                </td>
              </tr>
            ) : (
              paginatedTracks.map((track, index) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={index}
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
                  onTrackClick={onTrackClick}
                  onTrackContextMenu={onTrackContextMenu}
                  onTrackTitleClick={onTrackTitleClick}
                  onArtistClick={onArtistClick}
                  onArtistContextMenu={onArtistContextMenu}
                  onAlbumClick={onAlbumClick}
                  onAlbumContextMenu={onAlbumContextMenu}
                  onOpenBpmModal={onOpenBpmModal}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
