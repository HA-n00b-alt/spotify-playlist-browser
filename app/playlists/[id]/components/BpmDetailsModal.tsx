'use client'

import type { SpotifyTrack } from '@/lib/types'

type Track = SpotifyTrack

type BpmModalFullData = {
  bpmEssentia?: number | null
  bpmRawEssentia?: number | null
  bpmConfidenceEssentia?: number | null
  bpmLibrosa?: number | null
  bpmRawLibrosa?: number | null
  bpmConfidenceLibrosa?: number | null
  keyEssentia?: string | null
  scaleEssentia?: string | null
  keyscaleConfidenceEssentia?: number | null
  keyLibrosa?: string | null
  scaleLibrosa?: string | null
  keyscaleConfidenceLibrosa?: number | null
  bpmSelected?: 'essentia' | 'librosa' | 'manual'
  keySelected?: 'essentia' | 'librosa' | 'manual'
  bpmManual?: number | null
  keyManual?: string | null
  scaleManual?: string | null
  debugTxt?: string | null
}

type BpmModalData = {
  trackId: string
  fullData: BpmModalFullData
  currentBpm: number | null
  currentKey: string | null
  currentScale: string | null
  bpmSelected: 'essentia' | 'librosa' | 'manual'
  keySelected: 'essentia' | 'librosa' | 'manual'
  hasEssentiaBpm: boolean
  hasLibrosaBpm: boolean
  hasEssentiaKey: boolean
  hasLibrosaKey: boolean
}

type BpmModalSummary = {
  bpmCandidates: Array<{
    id: 'essentia' | 'librosa'
    label: string
    value: number
    confidence?: number | null
    raw?: number | null
  }>
  keyCandidates: Array<{
    id: 'essentia' | 'librosa'
    label: string
    key: string | null
    scale: string | null
    confidence?: number | null
  }>
  bpmSelectedLabel: string
  keySelectedLabel: string
  bpmSelectedConfidence: number | null
  keySelectedConfidence: number | null
  currentBpm: number | null
  currentKey: string | null
  currentScale: string | null
}

type UpdateBpmSelectionPayload = {
  spotifyTrackId: string
  bpmSelected?: 'essentia' | 'librosa' | 'manual'
  keySelected?: 'essentia' | 'librosa' | 'manual'
  bpmManual?: number | null
  keyManual?: string | null
  scaleManual?: string | null
}

type BpmDetailsModalProps = {
  isOpen: boolean
  isAdmin: boolean
  bpmModalData: BpmModalData | null
  bpmModalSummary: BpmModalSummary | null
  selectedBpmTrack: Track | null
  bpmStreamStatus: Record<string, 'partial' | 'final' | 'error'>
  bpmDetails: Record<string, { source?: string; error?: string }>
  isrcMismatchDetails: { spotifyIsrc?: string | null; previewIsrc?: string | null; previewUrl?: string | null } | null
  mismatchPreviewUrls: { itunes?: string | null; spotify?: string | null; loading?: boolean }
  musoPreviewStatus: { loading: boolean; success?: boolean; error?: string } | null
  loadingBpmFields: Set<string>
  trackBpms: Record<string, number | null>
  retryStatus: { loading: boolean; success?: boolean; error?: string } | null
  retryAttempted: boolean
  manualBpm: string
  manualKey: string
  manualScale: string
  isUpdatingSelection: boolean
  showBpmModalDebug: boolean
  bpmDebugLevel: string
  bpmConfidenceThreshold: string
  bpmDebugInfo: Record<string, any>
  recalcMode: 'standard' | 'force' | 'fallback'
  recalcStatus: { loading: boolean; success?: boolean; error?: string } | null
  onClose: () => void
  onUpdateBpmSelection: (payload: UpdateBpmSelectionPayload) => Promise<void> | void
  onSetManualBpm: (value: string) => void
  onSetManualKey: (value: string) => void
  onSetManualScale: (value: string) => void
  onRetryBpm: () => void
  onFetchMusoPreview: (trackId: string) => void
  onSetShowBpmModalDebug: (value: boolean) => void
  onSetBpmDebugLevel: (value: string) => void
  onSetBpmConfidenceThreshold: (value: string) => void
  onSetRecalcMode: (value: 'standard' | 'force' | 'fallback') => void
  onRecalcTrack: (mode: 'standard' | 'force' | 'fallback') => void
}

export default function BpmDetailsModal({
  isOpen,
  isAdmin,
  bpmModalData,
  bpmModalSummary,
  selectedBpmTrack,
  bpmStreamStatus,
  bpmDetails,
  isrcMismatchDetails,
  mismatchPreviewUrls,
  musoPreviewStatus,
  loadingBpmFields,
  trackBpms,
  retryStatus,
  retryAttempted,
  manualBpm,
  manualKey,
  manualScale,
  isUpdatingSelection,
  showBpmModalDebug,
  bpmDebugLevel,
  bpmConfidenceThreshold,
  bpmDebugInfo,
  recalcMode,
  recalcStatus,
  onClose,
  onUpdateBpmSelection,
  onSetManualBpm,
  onSetManualKey,
  onSetManualScale,
  onRetryBpm,
  onFetchMusoPreview,
  onSetShowBpmModalDebug,
  onSetBpmDebugLevel,
  onSetBpmConfidenceThreshold,
  onSetRecalcMode,
  onRecalcTrack,
}: BpmDetailsModalProps) {
  if (!isOpen || !bpmModalData || !bpmModalSummary || !selectedBpmTrack) {
    return null
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[12px] shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto dark:bg-slate-900 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between pb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
              BPM and Key information
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">
              {selectedBpmTrack.name} · {(selectedBpmTrack.artists || []).map(a => a.name).filter(Boolean).join(', ') || 'Unknown artist'}
            </p>
            {bpmStreamStatus[bpmModalData.trackId] === 'partial' && (
              <div className="mt-2 inline-flex items-center text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200">
                Partial results streaming...
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-slate-200 dark:hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        <div className="mt-6 space-y-8">
          <section>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 dark:text-slate-500">
                  BPM
                </div>
                <div className="mt-3 flex items-center gap-2 text-4xl font-semibold text-gray-900 dark:text-slate-100">
                  {typeof bpmModalSummary.currentBpm === 'number'
                    ? `${Math.round(bpmModalSummary.currentBpm)} BPM`
                    : '—'}
                  {typeof bpmModalSummary.currentBpm === 'number' && (
                    <svg
                      className="h-5 w-5 text-emerald-500 dark:text-emerald-300"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 5.292a1 1 0 010 1.416l-7.1 7.1a1 1 0 01-1.416 0l-3.392-3.392a1 1 0 111.416-1.416l2.684 2.684 6.392-6.392a1 1 0 011.416 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  Algo: {bpmModalSummary.bpmSelectedLabel}
                  {' · '}
                  Confidence:{' '}
                  {bpmModalSummary.bpmSelectedConfidence != null
                    ? `${Math.round(bpmModalSummary.bpmSelectedConfidence * 100)}%`
                    : 'n/a'}
                </div>
              </div>
              {isAdmin && typeof bpmModalSummary.currentBpm === 'number' && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    onClick={async () => {
                      const currentBpm = bpmModalSummary.currentBpm
                      if (typeof currentBpm !== 'number') return
                      const bpmValue = Number((currentBpm / 2).toFixed(1))
                      await onUpdateBpmSelection({
                        spotifyTrackId: bpmModalData.trackId,
                        bpmSelected: 'manual',
                        bpmManual: bpmValue,
                      })
                    }}
                    disabled={isUpdatingSelection}
                    className="rounded-full px-3 py-1 text-gray-600 hover:text-gray-900 hover:bg-black/5 disabled:text-gray-400 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10"
                  >
                    Store Half
                  </button>
                  <button
                    onClick={async () => {
                      const currentBpm = bpmModalSummary.currentBpm
                      if (typeof currentBpm !== 'number') return
                      const bpmValue = Number((currentBpm * 2).toFixed(1))
                      await onUpdateBpmSelection({
                        spotifyTrackId: bpmModalData.trackId,
                        bpmSelected: 'manual',
                        bpmManual: bpmValue,
                      })
                    }}
                    disabled={isUpdatingSelection}
                    className="rounded-full px-3 py-1 text-gray-600 hover:text-gray-900 hover:bg-black/5 disabled:text-gray-400 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10"
                  >
                    Store Double
                  </button>
                </div>
              )}
            </div>

            {!bpmModalData.hasEssentiaBpm && !bpmModalData.hasLibrosaBpm && bpmModalData.currentBpm == null ? (
              <div className="mt-4 space-y-3 text-sm text-gray-600 dark:text-slate-300">
                <p>BPM data is not available yet.</p>
                {bpmDetails[bpmModalData.trackId]?.error ? (
                  <div className="text-xs text-gray-500 dark:text-slate-400">
                    Reason: {bpmDetails[bpmModalData.trackId].error}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 dark:text-slate-400">
                    It may still be processing or no preview audio is available.
                  </div>
                )}
                {isrcMismatchDetails && (
                  <div className="rounded-[12px] bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                    <div className="font-semibold">ISRC mismatch details</div>
                    <div>Spotify ISRC: {isrcMismatchDetails.spotifyIsrc || 'Unknown'}</div>
                    <div>iTunes ISRC: {isrcMismatchDetails.previewIsrc || 'Unknown'}</div>
                  </div>
                )}
                {isrcMismatchDetails && (
                  <div className="rounded-[12px] bg-black/5 px-3 py-2 text-xs text-gray-700 dark:bg-white/5 dark:text-slate-300">
                    <div className="font-semibold text-gray-800 dark:text-slate-100">Compare audio previews</div>
                    <div className="mt-2 space-y-2">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.08em] text-gray-500 dark:text-slate-400">iTunes preview</div>
                        {mismatchPreviewUrls.itunes ? (
                          <audio controls src={mismatchPreviewUrls.itunes} className="mt-1 w-full" />
                        ) : (
                          <div className="text-xs text-gray-500 dark:text-slate-400">No iTunes preview URL available.</div>
                        )}
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.08em] text-gray-500 dark:text-slate-400">Spotify preview</div>
                        {mismatchPreviewUrls.loading ? (
                          <div className="text-xs text-gray-500 dark:text-slate-400">Loading Spotify preview…</div>
                        ) : mismatchPreviewUrls.spotify ? (
                          <audio controls src={mismatchPreviewUrls.spotify} className="mt-1 w-full" />
                        ) : (
                          <div className="text-xs text-gray-500 dark:text-slate-400">No Spotify preview URL available.</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {isrcMismatchDetails && (
                  <div>
                    <button
                      onClick={() => onFetchMusoPreview(bpmModalData.trackId)}
                      disabled={musoPreviewStatus?.loading}
                      className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:text-amber-400 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
                    >
                      {musoPreviewStatus?.loading ? 'Fetching Muso preview...' : 'Use Muso Spotify preview'}
                    </button>
                    {musoPreviewStatus?.error && (
                      <div className="mt-1 text-xs text-red-600">{musoPreviewStatus.error}</div>
                    )}
                    {musoPreviewStatus?.success && (
                      <div className="mt-1 text-xs text-green-600">BPM calculated from Muso preview.</div>
                    )}
                  </div>
                )}
                {loadingBpmFields.has(bpmModalData.trackId) && trackBpms[bpmModalData.trackId] == null && (
                  <div className="text-xs text-gray-500 dark:text-slate-400">
                    Waiting for first partial result...
                  </div>
                )}
                {trackBpms[bpmModalData.trackId] == null && !retryAttempted && (
                  <button
                    onClick={onRetryBpm}
                    disabled={retryStatus?.loading}
                    className="rounded-full border border-blue-200 px-4 py-2 text-xs font-semibold text-blue-700 hover:border-blue-300 disabled:text-blue-300 dark:border-emerald-500/40 dark:text-emerald-200"
                  >
                    {retryStatus?.loading ? 'Retrying...' : 'Retry'}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="mt-6 space-y-2">
                  {bpmModalSummary.bpmCandidates.map((candidate) => {
                    const isSelected = bpmModalData.bpmSelected === candidate.id
                    return (
                      <div
                        key={candidate.id}
                        className="flex items-center justify-between rounded-[12px] px-3 py-2 text-sm text-gray-700 dark:text-slate-300"
                      >
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500">
                            {candidate.label}
                          </div>
                          <div className="text-sm text-gray-900 dark:text-slate-100">
                            {Math.round(candidate.value)} BPM
                            {typeof candidate.raw === 'number' && candidate.raw !== candidate.value ? (
                              <span className="ml-2 text-xs text-gray-400">raw {candidate.raw.toFixed(1)}</span>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-slate-400">
                            Confidence:{' '}
                            {candidate.confidence != null
                              ? `${Math.round(candidate.confidence * 100)}%`
                              : 'n/a'}
                          </div>
                        </div>
                        {isSelected ? (
                          <span className="text-[11px] uppercase tracking-[0.2em] text-green-600 dark:text-emerald-300">
                            Selected
                          </span>
                        ) : isAdmin ? (
                          <button
                            onClick={() =>
                              onUpdateBpmSelection({
                                spotifyTrackId: bpmModalData.trackId,
                                bpmSelected: candidate.id,
                              })
                            }
                            disabled={isUpdatingSelection}
                            className="rounded-full px-3 py-1 text-[11px] font-semibold text-gray-600 hover:text-gray-900 hover:bg-black/5 disabled:text-gray-400 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10"
                          >
                            Use this
                          </button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>

                {isAdmin && (
                  <div className="mt-6">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500">
                      Manual override
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        value={manualBpm || bpmModalData.fullData?.bpmManual || ''}
                        onChange={(e) => onSetManualBpm(e.target.value)}
                        placeholder="Enter BPM"
                        className="w-28 rounded-[12px] border border-transparent bg-black/5 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:bg-white/5 dark:text-slate-100"
                        min="1"
                        max="300"
                      />
                      <button
                        onClick={async () => {
                          const bpmValue = parseFloat(manualBpm || String(bpmModalData.fullData?.bpmManual || ''))
                          if (isNaN(bpmValue) || bpmValue < 1 || bpmValue > 300) {
                            alert('Please enter a valid BPM between 1 and 300')
                            return
                          }
                          await onUpdateBpmSelection({
                            spotifyTrackId: bpmModalData.trackId,
                            bpmSelected: 'manual',
                            bpmManual: bpmValue,
                          })
                          onSetManualBpm('')
                        }}
                        disabled={isUpdatingSelection || (!manualBpm && !bpmModalData.fullData?.bpmManual)}
                        className="rounded-full px-3 py-2 text-[11px] font-semibold text-gray-600 hover:text-gray-900 hover:bg-black/5 disabled:text-gray-400 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10"
                      >
                        Save manual
                      </button>
                      {bpmModalData.bpmSelected === 'manual' && bpmModalData.fullData?.bpmManual != null && (
                        <span className="text-[11px] text-gray-500 dark:text-slate-400">
                          Selected: {Math.round(bpmModalData.fullData.bpmManual)}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <section>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 dark:text-slate-500">
              Key & Scale
            </div>
            <div className="mt-3 flex items-center gap-2 text-3xl font-semibold text-gray-900 dark:text-slate-100">
              {bpmModalSummary.currentKey || bpmModalSummary.currentScale
                ? `${bpmModalSummary.currentKey || ''} ${bpmModalSummary.currentScale || ''}`.trim()
                : '—'}
              {(bpmModalSummary.currentKey || bpmModalSummary.currentScale) && (
                <svg
                  className="h-5 w-5 text-emerald-500 dark:text-emerald-300"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 5.292a1 1 0 010 1.416l-7.1 7.1a1 1 0 01-1.416 0l-3.392-3.392a1 1 0 111.416-1.416l2.684 2.684 6.392-6.392a1 1 0 011.416 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Algo: {bpmModalSummary.keySelectedLabel}
              {' · '}
              Confidence:{' '}
              {bpmModalSummary.keySelectedConfidence != null
                ? `${Math.round(bpmModalSummary.keySelectedConfidence * 100)}%`
                : 'n/a'}
            </div>

            {bpmModalSummary.keyCandidates.length > 0 ? (
              <div className="mt-6 space-y-2">
                {bpmModalSummary.keyCandidates.map((candidate) => {
                  const isSelected = bpmModalData.keySelected === candidate.id
                  return (
                    <div
                      key={candidate.id}
                      className="flex items-center justify-between rounded-[12px] px-3 py-2 text-sm text-gray-700 dark:text-slate-300"
                    >
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500">
                          {candidate.label}
                        </div>
                        <div className="text-sm text-gray-900 dark:text-slate-100">
                          {candidate.key || '—'} {candidate.scale || ''}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-slate-400">
                          Confidence:{' '}
                          {candidate.confidence != null
                            ? `${Math.round(candidate.confidence * 100)}%`
                            : 'n/a'}
                        </div>
                      </div>
                      {isSelected ? (
                        <span className="text-[11px] uppercase tracking-[0.2em] text-green-600 dark:text-emerald-300">
                          Selected
                        </span>
                      ) : isAdmin ? (
                        <button
                          onClick={() =>
                            onUpdateBpmSelection({
                              spotifyTrackId: bpmModalData.trackId,
                              keySelected: candidate.id,
                            })
                          }
                          disabled={isUpdatingSelection}
                          className="rounded-full px-3 py-1 text-[11px] font-semibold text-gray-600 hover:text-gray-900 hover:bg-black/5 disabled:text-gray-400 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10"
                        >
                          Use this
                        </button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mt-3 text-sm text-gray-500 dark:text-slate-400">
                Key data is not available yet.
              </div>
            )}

            {isAdmin && (
              <div className="mt-6">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500">
                  Manual override
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={manualKey || bpmModalData.fullData?.keyManual || ''}
                    onChange={(e) => onSetManualKey(e.target.value)}
                    className="rounded-[12px] border border-transparent bg-black/5 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:bg-white/5 dark:text-slate-100"
                  >
                    <option value="">Select Key</option>
                    {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                  <select
                    value={manualScale || bpmModalData.fullData?.scaleManual || 'major'}
                    onChange={(e) => onSetManualScale(e.target.value)}
                    className="rounded-[12px] border border-transparent bg-black/5 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:bg-white/5 dark:text-slate-100"
                  >
                    <option value="major">Major</option>
                    <option value="minor">Minor</option>
                  </select>
                  <button
                    onClick={async () => {
                      const key = manualKey || bpmModalData.fullData?.keyManual
                      const scale = manualScale || bpmModalData.fullData?.scaleManual || 'major'
                      if (!key) {
                        alert('Please select a key')
                        return
                      }
                      await onUpdateBpmSelection({
                        spotifyTrackId: bpmModalData.trackId,
                        keySelected: 'manual',
                        keyManual: key,
                        scaleManual: scale,
                      })
                      onSetManualKey('')
                      onSetManualScale('major')
                    }}
                    disabled={isUpdatingSelection || (!manualKey && !bpmModalData.fullData?.keyManual)}
                    className="rounded-full px-3 py-2 text-[11px] font-semibold text-gray-600 hover:text-gray-900 hover:bg-black/5 disabled:text-gray-400 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10"
                  >
                    Save manual
                  </button>
                  {bpmModalData.keySelected === 'manual' && bpmModalData.fullData?.keyManual && (
                    <span className="text-[11px] text-gray-500 dark:text-slate-400">
                      Selected: {bpmModalData.fullData.keyManual} {bpmModalData.fullData.scaleManual}
                    </span>
                  )}
                </div>
              </div>
            )}
          </section>

          <section>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 dark:text-slate-500">
              Recalculate
            </div>
            <div className="mt-4 inline-flex rounded-full border border-gray-200 bg-transparent p-1 dark:border-slate-800">
              <button
                onClick={() => {
                  onSetRecalcMode('standard')
                  onRecalcTrack('standard')
                }}
                disabled={recalcStatus?.loading}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  recalcMode === 'standard'
                    ? 'bg-black/5 text-gray-900 dark:bg-white/10 dark:text-white'
                    : 'text-gray-600 hover:bg-black/5 hover:text-gray-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                }`}
              >
                {recalcStatus?.loading ? 'Recalculating...' : 'Standard'}
              </button>
              <button
                onClick={() => {
                  onSetRecalcMode('force')
                  onRecalcTrack('force')
                }}
                disabled={recalcStatus?.loading}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  recalcMode === 'force'
                    ? 'bg-black/5 text-gray-900 dark:bg-white/10 dark:text-white'
                    : 'text-gray-600 hover:bg-black/5 hover:text-gray-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                }`}
              >
                Force fallback
              </button>
              <button
                onClick={() => {
                  onSetRecalcMode('fallback')
                  onRecalcTrack('fallback')
                }}
                disabled={recalcStatus?.loading}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  recalcMode === 'fallback'
                    ? 'bg-black/5 text-gray-900 dark:bg-white/10 dark:text-white'
                    : 'text-gray-600 hover:bg-black/5 hover:text-gray-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                }`}
              >
                Fallback only
              </button>
            </div>
            {recalcStatus?.error && (
              <div className="mt-2 text-xs text-red-600">{recalcStatus.error}</div>
            )}
          </section>

          {isAdmin && (
            <section>
              <button
                onClick={() => onSetShowBpmModalDebug(!showBpmModalDebug)}
                className="text-xs font-semibold text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white"
              >
                {showBpmModalDebug ? 'Hide Debug Logs' : 'View Debug Logs'}
              </button>

              {showBpmModalDebug && (
                <div className="mt-4 space-y-4 text-xs text-gray-600 dark:text-slate-300">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-gray-500 dark:text-slate-400" htmlFor="modal-bpm-debug-level">
                        Log level
                      </label>
                      <select
                        id="modal-bpm-debug-level"
                        value={bpmDebugLevel}
                        onChange={(e) => onSetBpmDebugLevel(e.target.value)}
                        className="w-full rounded-[12px] border border-transparent bg-black/5 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:bg-white/5 dark:text-slate-100"
                      >
                        <option value="minimal">Minimal</option>
                        <option value="normal">Normal</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-gray-500 dark:text-slate-400" htmlFor="modal-bpm-confidence-threshold">
                        Confidence threshold
                      </label>
                      <input
                        id="modal-bpm-confidence-threshold"
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={bpmConfidenceThreshold}
                        onChange={(e) => onSetBpmConfidenceThreshold(e.target.value)}
                        className="w-full rounded-[12px] border border-transparent bg-black/5 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:bg-white/5 dark:text-slate-100"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-gray-400 dark:text-slate-500">
                      Live logs
                    </div>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-[12px] bg-black/5 p-3 text-[11px] text-gray-700 dark:bg-white/5 dark:text-slate-200">
                      {bpmModalData.fullData?.debugTxt || 'No live logs yet.'}
                    </pre>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-gray-400 dark:text-slate-500">
                      Last payload
                    </div>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-[12px] bg-black/5 p-3 text-[11px] text-gray-700 dark:bg-white/5 dark:text-slate-200">
                      {bpmDebugInfo[bpmModalData.trackId]
                        ? JSON.stringify(bpmDebugInfo[bpmModalData.trackId], null, 2)
                        : 'No previous payloads yet.'}
                    </pre>
                  </div>
                </div>
              )}
            </section>
          )}

          {retryStatus && (
            <div
              className={`rounded-[12px] px-3 py-2 text-xs ${
                retryStatus.loading
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200'
                  : retryStatus.success
                    ? 'bg-green-50 text-green-700 dark:bg-emerald-500/10 dark:text-emerald-200'
                    : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200'
              }`}
            >
              {retryStatus.loading && 'Retrying...'}
              {!retryStatus.loading && retryStatus.success && 'BPM successfully calculated!'}
              {!retryStatus.loading && !retryStatus.success && retryStatus.error && `Error: ${retryStatus.error}`}
            </div>
          )}

          {isUpdatingSelection && (
            <div className="rounded-[12px] bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">
              Updating selection...
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-full bg-black/5 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-black/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
