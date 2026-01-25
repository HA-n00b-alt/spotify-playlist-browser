'use client'

import Image from 'next/image'
import type { MouseEvent } from 'react'
import type { SpotifyTrack } from '@/lib/types'

type Track = SpotifyTrack

type TrackCardProps = {
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

export default function TrackCard({
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
  getYearString,
  onTrackClick,
  onTrackContextMenu,
  onTrackTitleClick,
  onArtistClick,
  onArtistContextMenu,
  onAlbumClick,
  onAlbumContextMenu,
  onOpenBpmModal,
}: TrackCardProps) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.06)] p-4 cursor-pointer transition-colors ${
        playingTrackId === track.id
          ? 'bg-emerald-50'
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
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-2">
          <div className="text-gray-500 dark:text-slate-400 text-xs font-medium w-6 h-6 flex items-center justify-center">
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
          {track.album.images && track.album.images[0] ? (
            <Image
              src={track.album.images[0].url}
              alt={track.album.name}
              width={56}
              height={56}
              className="w-14 h-14 object-cover rounded-xl flex-shrink-0"
            />
          ) : (
            <div className="w-14 h-14 bg-gray-200 rounded-xl flex-shrink-0 flex items-center justify-center">
              <span className="text-gray-400 dark:text-slate-500 text-[10px]">No image</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <a
              href="#"
              className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-emerald-600 hover:underline"
              onClick={(e) => onTrackTitleClick(e, track)}
              onContextMenu={(e) => onTrackContextMenu(e, track)}
              title={getPreviewTooltip(track.id)}
            >
              {track.name}
              {track.explicit && (
                <span className="ml-1 text-[10px] bg-gray-200 text-gray-700 px-1 py-0.5 rounded">E</span>
              )}
            </a>
            <button
              type="button"
              onClick={(e) => onTrackContextMenu(e, track)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 dark:text-slate-500 hover:bg-gray-100 hover:text-gray-600"
              aria-label="More options"
            >
              ...
            </button>
          </div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mt-1 truncate">
            {track.artists.map((artist, artistIndex) => (
              <span key={artist.id || artistIndex}>
                {artist.external_urls?.spotify ? (
                  <a
                    href={artist.external_urls.spotify}
                    className="text-emerald-600 hover:text-emerald-700"
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
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-gray-400 dark:text-slate-500">
            <span className="truncate">
              {track.album.external_urls?.spotify ? (
                <a
                  href={track.album.external_urls.spotify}
                  className="text-emerald-600 hover:text-emerald-700"
                  onClick={(e) => onAlbumClick(e, track.album)}
                  onContextMenu={(e) => onAlbumContextMenu(e, track.album)}
                >
                  {track.album.name}
                </a>
              ) : (
                <span>{track.album.name}</span>
              )}
            </span>
            <span aria-hidden="true">•</span>
            <span>{getYearString(track.album.release_date)}</span>
            <span aria-hidden="true">•</span>
            <span>{formatDuration(track.duration_ms)}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
            {loadingBpmFields.has(track.id) ? (
              <span className="inline-flex w-16 items-center justify-center text-gray-400 dark:text-slate-500">
                <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </span>
            ) : trackBpms[track.id] != null ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (isAdmin) {
                    onOpenBpmModal(track)
                  } else {
                    onTrackClick(track)
                  }
                }}
                className="inline-flex w-16 items-center justify-center rounded-full border border-blue-200 bg-transparent px-2.5 py-0.5 text-[11px] font-medium text-blue-700"
              >
                {Math.round(trackBpms[track.id]!)}
              </button>
            ) : (tracksNeedingBpm.has(track.id) || bpmStreamStatus[track.id] === 'error') ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (isAdmin) {
                    onOpenBpmModal(track)
                  } else {
                    onTrackClick(track)
                  }
                }}
                className="inline-flex w-16 items-center justify-center rounded-full border border-amber-200 bg-transparent px-2.5 py-0.5 text-[11px] font-medium text-amber-700"
              >
                N/A
              </button>
            ) : track.tempo != null ? (
              <span className="inline-flex w-16 items-center justify-center rounded-full border border-blue-200 bg-transparent px-2.5 py-0.5 text-[11px] font-medium text-blue-700">
                {Math.round(track.tempo)}
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (isAdmin) {
                    onOpenBpmModal(track)
                  } else {
                    onTrackClick(track)
                  }
                }}
                className="inline-flex w-16 items-center justify-center rounded-full border border-amber-200 bg-transparent px-2.5 py-0.5 text-[11px] font-medium text-amber-700"
              >
                N/A
              </button>
            )}
            {(() => {
              if (loadingKeyFields.has(track.id)) {
                return (
                  <span className="inline-flex w-24 items-center justify-center text-gray-400 dark:text-slate-500">
                    <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
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
                    className="inline-flex w-24 items-center justify-center rounded-full border border-slate-200 bg-transparent px-2.5 py-0.5 text-[11px] font-medium text-slate-700 whitespace-nowrap"
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
                    className="inline-flex w-24 items-center justify-center rounded-full border border-amber-200 bg-transparent px-2.5 py-0.5 text-[11px] font-medium text-amber-700"
                  >
                    N/A
                  </button>
                )
              }
              return (
                <span className="inline-flex w-24 items-center justify-center rounded-full border border-gray-200 bg-transparent px-2.5 py-0.5 text-[11px] font-medium text-gray-500 dark:text-slate-400">
                  -
                </span>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
