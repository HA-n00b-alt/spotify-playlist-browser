'use client'

import Image from 'next/image'
import type { MouseEvent } from 'react'
import type { SpotifyTrack } from '@/lib/types'

type Track = SpotifyTrack

type TrackRowProps = {
  track: Track
  index: number
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
  onTrackClick: (track: Track, event?: MouseEvent) => void
  onTrackContextMenu: (event: MouseEvent, track: Track) => void
  onTrackTitleClick: (event: MouseEvent<HTMLAnchorElement>, track: Track) => void
  onArtistClick: (event: MouseEvent<HTMLAnchorElement>, artist: Track['artists'][number]) => void
  onArtistContextMenu: (event: MouseEvent, artist: Track['artists'][number]) => void
  onAlbumClick: (event: MouseEvent<HTMLAnchorElement>, album: Track['album']) => void
  onAlbumContextMenu: (event: MouseEvent, album: Track['album']) => void
  onOpenBpmModal: (track: Track) => void
}

export default function TrackRow({
  track,
  index,
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
  onTrackClick,
  onTrackContextMenu,
  onTrackTitleClick,
  onArtistClick,
  onArtistContextMenu,
  onAlbumClick,
  onAlbumContextMenu,
  onOpenBpmModal,
}: TrackRowProps) {
  return (
    <tr
      className={`group transition-colors cursor-pointer ${
        playingTrackId === track.id
          ? 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20'
          : 'hover:bg-[#F9FAFB] dark:hover:bg-slate-800/60'
      }`}
      onClick={(e) => {
        if (e.button === 0 || !e.button) {
          onTrackClick(track, e)
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onTrackContextMenu(e, track)
      }}
      title={getPreviewTooltip(track.id)}
    >
      <td className="px-3 lg:px-4 py-4 text-gray-400 dark:text-slate-500 text-xs sm:text-sm">
        <div className="flex items-center justify-center">
          {playingTrackId === track.id ? (
            <svg className="w-4 h-4 text-green-600 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          ) : (
            pageSize === 'all'
              ? index + 1
              : (safePage - 1) * (pageSize as number) + index + 1
          )}
        </div>
      </td>
      <td className="px-3 lg:px-4 py-4">
        {track.album.images && track.album.images[0] ? (
          <Image
            src={track.album.images[0].url}
            alt={track.album.name}
            width={40}
            height={40}
            className="w-8 h-8 sm:w-10 sm:h-10 object-cover rounded-xl flex-shrink-0"
          />
        ) : (
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 rounded-xl flex-shrink-0 flex items-center justify-center">
            <span className="text-gray-400 dark:text-slate-500 text-xs">No image</span>
          </div>
        )}
      </td>
      <td className="px-3 lg:px-4 py-4">
        <div className="flex items-center gap-2">
          <a
            href="#"
            className="font-semibold text-slate-900 dark:text-slate-100 text-xs sm:text-sm hover:text-emerald-600 hover:underline"
            onClick={(e) => onTrackTitleClick(e, track)}
            onContextMenu={(e) => onTrackContextMenu(e, track)}
            title={getPreviewTooltip(track.id)}
          >
            {track.name}
          </a>
          {track.explicit && (
            <span className="ml-1 text-xs bg-gray-200 text-gray-700 px-1 py-0.5 rounded dark:bg-slate-800 dark:text-slate-200">E</span>
          )}
        </div>
      </td>
      <td className="px-3 lg:px-4 py-4 text-gray-500 dark:text-slate-400 text-xs sm:text-sm hidden md:table-cell max-w-[120px] truncate" title={track.artists.map(a => a.name).join(', ')}>
        {track.artists.map((artist, artistIndex) => (
          <span key={artist.id || artistIndex}>
            {artist.external_urls?.spotify ? (
              <a
                href={artist.external_urls.spotify}
                className="text-emerald-600 hover:text-emerald-700 hover:underline"
                onClick={(e) => onArtistClick(e, artist)}
                onContextMenu={(e) => onArtistContextMenu(e, artist)}
              >
                {artist.name}
              </a>
            ) : (
              <span>{artist.name}</span>
            )}
            {artistIndex < track.artists.length - 1 && ', '}
          </span>
        ))}
      </td>
      <td className="px-3 lg:px-4 py-4 text-gray-500 dark:text-slate-400 text-xs sm:text-sm hidden lg:table-cell max-w-[150px] truncate" title={track.album.name}>
        {track.album.external_urls?.spotify ? (
          <a
            href={track.album.external_urls.spotify}
            className="text-emerald-600 hover:text-emerald-700 hover:underline"
            onClick={(e) => onAlbumClick(e, track.album)}
            onContextMenu={(e) => onAlbumContextMenu(e, track.album)}
          >
            {track.album.name}
          </a>
        ) : (
          <span>{track.album.name}</span>
        )}
      </td>
      <td className="px-3 lg:px-4 py-4 text-gray-500 dark:text-slate-400 text-xs sm:text-sm hidden md:table-cell text-right">
        {formatDuration(track.duration_ms)}
      </td>
      <td className="px-3 lg:px-4 py-4 text-xs sm:text-sm hidden md:table-cell text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end">
          {loadingBpmFields.has(track.id) ? (
            <div className="inline-flex items-center gap-1 text-gray-400 dark:text-slate-500">
              <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-gray-400 dark:text-slate-500">...</span>
            </div>
          ) : trackBpms[track.id] != null ? (
            <button
              onClick={() => {
                if (isAdmin) {
                  onOpenBpmModal(track)
                } else {
                  onTrackClick(track)
                }
              }}
              className="inline-flex w-16 items-center justify-center rounded-full border border-blue-200 bg-transparent px-2.5 py-1 text-xs font-medium text-blue-700 dark:border-emerald-500/40 dark:text-emerald-300"
              title={isAdmin ? 'Click for BPM details' : getPreviewTooltip(track.id)}
            >
              {Math.round(trackBpms[track.id]!)}
              {bpmStreamStatus[track.id] === 'partial' && (
                <span className="ml-1 text-[10px] text-blue-600 dark:text-emerald-300">partial</span>
              )}
            </button>
          ) : (tracksNeedingBpm.has(track.id) || bpmStreamStatus[track.id] === 'error') ? (
            <button
              onClick={() => {
                if (isAdmin) {
                  onOpenBpmModal(track)
                } else {
                  onTrackClick(track)
                }
              }}
              className="inline-flex w-16 items-center justify-center rounded-full border border-amber-200 bg-transparent px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-500/40 dark:text-amber-300"
              title={isAdmin ? 'Click to see why BPM is not available' : getPreviewTooltip(track.id)}
            >
              N/A
            </button>
          ) : track.tempo != null ? (
            <span className="inline-flex w-16 items-center justify-center rounded-full border border-blue-200 bg-transparent px-2.5 py-1 text-xs font-medium text-blue-700 dark:border-emerald-500/40 dark:text-emerald-300">
              {Math.round(track.tempo)}
            </span>
          ) : (
            <button
              onClick={() => {
                if (isAdmin) {
                  onOpenBpmModal(track)
                } else {
                  onTrackClick(track)
                }
              }}
              className="inline-flex w-16 items-center justify-center rounded-full border border-amber-200 bg-transparent px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-500/40 dark:text-amber-300"
              title={isAdmin ? 'Click to see why BPM is not available' : getPreviewTooltip(track.id)}
            >
              N/A
            </button>
          )}
        </div>
      </td>
      <td className="px-3 lg:px-4 py-4 text-xs sm:text-sm hidden md:table-cell whitespace-nowrap min-w-[96px] text-right">
        <div className="flex justify-end">
          {(() => {
            if (loadingKeyFields.has(track.id)) {
              return (
                <span className="inline-flex w-24 items-center justify-center gap-1 text-gray-400 dark:text-slate-500">
                  <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>...</span>
                </span>
              )
            }
            const key = trackKeys[track.id]
            const scale = trackScales[track.id]
            if (key || scale) {
              return (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (isAdmin) {
                      onOpenBpmModal(track)
                    } else {
                      onTrackClick(track)
                    }
                  }}
                  className="inline-flex w-24 items-center justify-center rounded-full border border-slate-200 bg-transparent px-2.5 py-1 text-xs font-medium text-slate-700 whitespace-nowrap dark:border-slate-600 dark:text-slate-200"
                >
                  {key && scale ? `${key} ${scale}` : key || scale}
                </button>
              )
            }
            if (tracksNeedingKey.has(track.id) || bpmStreamStatus[track.id] === 'error') {
              return (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (isAdmin) {
                      onOpenBpmModal(track)
                    } else {
                      onTrackClick(track)
                    }
                  }}
                  className="inline-flex w-24 items-center justify-center rounded-full border border-amber-200 bg-transparent px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-500/40 dark:text-amber-300"
                >
                  N/A
                </button>
              )
            }
            return (
              <span className="inline-flex w-24 items-center justify-center rounded-full border border-gray-200 bg-transparent px-2.5 py-1 text-xs font-medium text-gray-500 dark:border-slate-600 dark:text-slate-400">
                -
              </span>
            )
          })()}
        </div>
      </td>
      <td className="px-3 lg:px-4 py-4 text-gray-500 dark:text-slate-400 text-xs sm:text-sm text-right">
        {getYearString(track.album.release_date)}
      </td>
      <td className="px-3 lg:px-4 py-4 text-gray-500 dark:text-slate-400 text-xs sm:text-sm text-right hidden lg:table-cell">
        {track.popularity != null ? track.popularity : (
          <span className="text-gray-400 dark:text-slate-500">N/A</span>
        )}
      </td>
      <td className="px-3 lg:px-4 py-4 text-gray-500 dark:text-slate-400 text-xs sm:text-sm text-right hidden lg:table-cell">
        {track.added_at ? formatDate(track.added_at) : 'N/A'}
      </td>
      <td className="px-3 lg:px-4 py-4 text-right">
        <button
          type="button"
          className="opacity-0 transition-opacity text-gray-400 dark:text-slate-500 hover:text-gray-600 group-hover:opacity-100"
          onClick={(e) => onTrackContextMenu(e, track)}
          aria-label="More options"
        >
          ...
        </button>
      </td>
    </tr>
  )
}
