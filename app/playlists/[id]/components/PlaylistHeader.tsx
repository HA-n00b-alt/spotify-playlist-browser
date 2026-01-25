'use client'

import Image from 'next/image'
import type { SpotifyPlaylistInfo } from '@/lib/types'

type BpmSummary = {
  totalTracks: number
  tracksToSearch: number
  tracksLoading: number
  tracksProcessedFromSearch: number
  tracksRemainingToSearch: number
  tracksWithBpm: number
  tracksWithNa: number
  shouldShowProgress: boolean
}

type PlaylistHeaderProps = {
  playlistInfo: SpotifyPlaylistInfo
  tracksCount: number
  isCached: boolean
  cachedAt: string | Date | null
  isHeaderRefreshing: boolean
  bpmSummary: BpmSummary | null
  showBpmNotice: boolean
  onHeaderRefresh: () => void
  onShowCacheModal: () => void
  onShowBpmMoreInfo: () => void
  onDismissBpmNotice: () => void
}

function stripHtmlTags(text: string): string {
  if (typeof document === 'undefined') {
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
  }
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  const decoded = textarea.value
  const div = document.createElement('div')
  div.innerHTML = decoded
  return div.textContent || div.innerText || ''
}

export default function PlaylistHeader({
  playlistInfo,
  tracksCount,
  isCached,
  cachedAt,
  isHeaderRefreshing,
  bpmSummary,
  showBpmNotice,
  onHeaderRefresh,
  onShowCacheModal,
  onShowBpmMoreInfo,
  onDismissBpmNotice,
}: PlaylistHeaderProps) {
  return (
    <div className="relative mb-6 rounded-2xl bg-white p-4 shadow-[0_4px_24px_rgba(0,0,0,0.06)] border-t border-gray-100 sm:p-5">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        {isCached && cachedAt && (
          <button
            onClick={onShowCacheModal}
            className="group relative inline-flex h-6 w-6 items-center justify-center rounded-full border border-blue-200 text-[11px] font-semibold text-blue-700"
            aria-label="Using cached data"
          >
            C
            <span className="pointer-events-none absolute right-0 top-8 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 opacity-0 shadow-sm transition-opacity duration-0 group-hover:opacity-100">
              Using cached data
            </span>
          </button>
        )}
        <button
          onClick={onHeaderRefresh}
          className="group relative inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
          aria-label="Refresh playlist"
          disabled={isHeaderRefreshing}
        >
          {isHeaderRefreshing ? (
            <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          <span className="pointer-events-none absolute right-0 top-8 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 opacity-0 shadow-sm transition-opacity duration-0 group-hover:opacity-100">
            Refresh playlist
          </span>
        </button>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {playlistInfo.images && playlistInfo.images[0] && (
          <Image
            src={playlistInfo.images[0].url}
            alt={playlistInfo.name}
            width={150}
            height={150}
            className="h-[150px] w-[150px] rounded-xl object-cover shadow-[0_6px_18px_rgba(0,0,0,0.16)]"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="space-y-2">
            {playlistInfo.external_urls?.spotify ? (
              <a
                href={playlistInfo.external_urls.spotify}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 hover:text-emerald-600"
                onClick={(e) => {
                  e.preventDefault()
                  const spotifyUri = `spotify:playlist:${playlistInfo.id}`
                  window.location.href = spotifyUri
                  setTimeout(() => {
                    window.open(playlistInfo.external_urls.spotify, '_blank', 'noopener,noreferrer')
                  }, 500)
                }}
              >
                {playlistInfo.name}
              </a>
            ) : (
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {playlistInfo.name}
              </h1>
            )}
            {playlistInfo.description && (
              <p className="text-sm text-gray-600">
                {stripHtmlTags(playlistInfo.description)}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
              {playlistInfo.owner.external_urls?.spotify ? (
                <>
                  <span>By </span>
                  <a
                    href={playlistInfo.owner.external_urls.spotify}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-600 hover:text-emerald-700 hover:underline"
                    onClick={(e) => {
                      e.preventDefault()
                      const ownerId = playlistInfo.owner.external_urls?.spotify.split('/').pop()
                      if (ownerId) {
                        const spotifyUri = `spotify:user:${ownerId}`
                        window.location.href = spotifyUri
                        setTimeout(() => {
                          window.open(playlistInfo.owner.external_urls?.spotify, '_blank', 'noopener,noreferrer')
                        }, 500)
                      }
                    }}
                  >
                    {playlistInfo.owner.display_name}
                  </a>
                  <span>|</span>
                </>
              ) : (
                <>
                  <span>By {playlistInfo.owner.display_name}</span>
                  <span>|</span>
                </>
              )}
              <span>{playlistInfo.tracks?.total ?? tracksCount} tracks</span>
            </div>
            {playlistInfo.external_urls?.spotify && (
              <div className="flex flex-col items-start gap-2">
                <a
                  href={playlistInfo.external_urls.spotify}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center rounded-full bg-[#1DB954] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#179e49]"
                  onClick={(e) => {
                    e.preventDefault()
                    const spotifyUri = `spotify:playlist:${playlistInfo.id}`
                    window.location.href = spotifyUri
                    setTimeout(() => {
                      window.open(playlistInfo.external_urls.spotify, '_blank', 'noopener,noreferrer')
                    }, 500)
                  }}
                >
                  Open in Spotify
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
      {bpmSummary && showBpmNotice && (
        <div className="mt-4 inline-flex items-start gap-2 text-[11px] text-amber-600">
          <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 h-3.5 w-3.5">
            <path
              d="M10 2.5 18.5 17H1.5L10 2.5Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <path d="M10 7.5v4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="10" cy="14.5" r="0.8" fill="currentColor" />
          </svg>
          <span>
            {bpmSummary.shouldShowProgress
              ? `BPM processing (${bpmSummary.tracksRemainingToSearch} remaining).`
              : bpmSummary.tracksWithNa > 0
                ? `${bpmSummary.tracksWithNa} of ${bpmSummary.totalTracks} tracks missing BPM.`
                : `All ${bpmSummary.totalTracks} tracks have BPM information.`}
          </span>
          <button
            type="button"
            onClick={onShowBpmMoreInfo}
            className="text-amber-600 underline-offset-2 hover:text-amber-800 hover:underline"
          >
            Details
          </button>
          <button
            type="button"
            onClick={onDismissBpmNotice}
            className="text-amber-600 hover:text-amber-800"
            aria-label="Dismiss notice"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
