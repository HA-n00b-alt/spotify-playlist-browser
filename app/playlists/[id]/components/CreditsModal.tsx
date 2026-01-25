'use client'

import type { ReactNode } from 'react'
import type { SpotifyTrack } from '@/lib/types'

type Track = SpotifyTrack

type CreditsEntry = {
  performedBy: string[]
  writtenBy: string[]
  producedBy: string[]
  mixedBy: string[]
  masteredBy: string[]
  releaseId?: string | null
  retrievedAt?: string | null
}

type CreditsModalProps = {
  isOpen: boolean
  selectedTrack: Track | null
  creditsByTrackId: Record<string, CreditsEntry>
  creditsLoadingIds: Set<string>
  creditsErrorByTrackId: Record<string, string>
  creditsRoleMap: Record<string, string>
  formatRetrievedMonthYear: (value?: string | null) => string
  renderCreditLinks: (people: string[], role: string) => ReactNode
  onRefreshCredits: (track: Track, force?: boolean) => void | Promise<void>
  onClose: () => void
}

export default function CreditsModal({
  isOpen,
  selectedTrack,
  creditsByTrackId,
  creditsLoadingIds,
  creditsErrorByTrackId,
  creditsRoleMap,
  formatRetrievedMonthYear,
  renderCreditLinks,
  onRefreshCredits,
  onClose,
}: CreditsModalProps) {
  if (!isOpen || !selectedTrack) {
    return null
  }

  const credits = creditsByTrackId[selectedTrack.id]
  const isLoading = creditsLoadingIds.has(selectedTrack.id)
  const error = creditsErrorByTrackId[selectedTrack.id]

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto dark:bg-slate-900 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Song Credits</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-slate-200 dark:hover:text-white text-2xl"
          >
            ×
          </button>
        </div>
        <div className="mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-slate-100">{selectedTrack.name}</h3>
          <p className="text-sm text-gray-600 dark:text-slate-300">
            {(selectedTrack.artists || []).map(a => a.name).filter(Boolean).join(', ') || 'Unknown artist'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-slate-400">
            <span>
              Retrieved on {formatRetrievedMonthYear(credits?.retrievedAt)}
            </span>
            <button
              type="button"
              onClick={() => onRefreshCredits(selectedTrack, true)}
              disabled={isLoading}
              className="rounded-full border border-gray-200 px-3 py-1 font-semibold text-gray-600 hover:border-gray-300 hover:text-gray-800 disabled:text-gray-400 dark:border-slate-700 dark:text-slate-300"
            >
              {isLoading ? 'Refreshing...' : 'Refresh credits'}
            </button>
          </div>
          {credits?.releaseId && (
            <a
              href={`https://musicbrainz.org/release/${encodeURIComponent(credits.releaseId as string)}`}
              className="text-xs text-gray-500 dark:text-slate-400 hover:text-gray-600"
              target="_blank"
              rel="noreferrer"
            >
              View on MusicBrainz
            </a>
          )}
        </div>
        {isLoading ? (
          <div className="text-sm text-gray-600 dark:text-slate-300">Loading credits...</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : (
          <div className="space-y-4 text-sm text-gray-700 dark:text-slate-300">
            <div>
              <div className="font-semibold text-gray-900 dark:text-slate-100">Performed by</div>
              {credits?.performedBy?.length ? (
                <div>{renderCreditLinks(credits.performedBy, creditsRoleMap.performedBy)}</div>
              ) : (
                <div className="text-gray-400 dark:text-slate-500">Not available</div>
              )}
            </div>
            <div>
              <div className="font-semibold text-gray-900 dark:text-slate-100">Written by</div>
              {credits?.writtenBy?.length ? (
                <div>{renderCreditLinks(credits.writtenBy, creditsRoleMap.writtenBy)}</div>
              ) : (
                <div className="text-gray-400 dark:text-slate-500">Not available</div>
              )}
            </div>
            <div>
              <div className="font-semibold text-gray-900 dark:text-slate-100">Produced by</div>
              {credits?.producedBy?.length ? (
                <div>{renderCreditLinks(credits.producedBy, creditsRoleMap.producedBy)}</div>
              ) : (
                <div className="text-gray-400 dark:text-slate-500">Not available</div>
              )}
            </div>
            <div>
              <div className="font-semibold text-gray-900 dark:text-slate-100">Mixed by</div>
              {credits?.mixedBy?.length ? (
                <div>{renderCreditLinks(credits.mixedBy, creditsRoleMap.mixedBy)}</div>
              ) : (
                <div className="text-gray-400 dark:text-slate-500">Not available</div>
              )}
            </div>
            <div>
              <div className="font-semibold text-gray-900 dark:text-slate-100">Mastered by</div>
              {credits?.masteredBy?.length ? (
                <div>{renderCreditLinks(credits.masteredBy, creditsRoleMap.masteredBy)}</div>
              ) : (
                <div className="text-gray-400 dark:text-slate-500">Not available</div>
              )}
            </div>
          </div>
        )}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded transition-colors dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
