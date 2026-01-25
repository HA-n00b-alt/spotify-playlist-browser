'use client'

import type { MouseEvent } from 'react'
import type { SpotifyTrack } from '@/lib/types'
import TrackCard from './TrackCard'

type Track = SpotifyTrack

type TrackCardListProps = {
  tracks: Track[]
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

export default function TrackCardList({
  tracks,
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
}: TrackCardListProps) {
  return (
    <div className="block sm:hidden space-y-3">
      {tracks.map((track, index) => (
        <TrackCard
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
      ))}
    </div>
  )
}
