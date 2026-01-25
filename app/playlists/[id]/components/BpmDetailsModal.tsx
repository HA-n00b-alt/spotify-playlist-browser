'use client'

import { useEffect, useState } from 'react'
import type { SpotifyTrack } from '@/lib/types'
import type { BpmFallbackOverride } from '../../../hooks/useBpmAnalysis'

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
  recalcMode: BpmFallbackOverride
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
  onSetRecalcMode: (value: BpmFallbackOverride) => void
  onRecalcTrack: (mode: BpmFallbackOverride) => void
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
  const ghostFieldClass =
    'w-full bg-transparent border-b border-white/5 py-1 text-sm text-white/90 placeholder:text-white/10 outline-none appearance-none [-moz-appearance:_textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
  const manualSelectClass =
    'bg-transparent border-b border-white/5 px-0 py-1 text-sm text-white/90 outline-none appearance-none'
  const recalcScopeForMode = (mode: BpmFallbackOverride): 'bpm' | 'key' | 'both' => {
    if (mode === 'bpm_only' || mode === 'fallback_only_bpm') return 'bpm'
    if (mode === 'key_only' || mode === 'fallback_only_key') return 'key'
    return 'both'
  }
  const recalcStrategyForMode = (mode: BpmFallbackOverride): 'standard' | 'fallback' | 'both' => {
    if (mode.startsWith('fallback_only')) return 'fallback'
    if (mode === 'always' || mode === 'bpm_only' || mode === 'key_only') return 'both'
    return 'standard'
  }
  const toMode = (scope: 'bpm' | 'key' | 'both', strategy: 'standard' | 'fallback' | 'both'): BpmFallbackOverride => {
    if (strategy === 'standard') return 'never'
    if (strategy === 'fallback') {
      if (scope === 'bpm') return 'fallback_only_bpm'
      if (scope === 'key') return 'fallback_only_key'
      return 'fallback_only'
    }
    if (scope === 'bpm') return 'bpm_only'
    if (scope === 'key') return 'key_only'
    return 'always'
  }
  const [recalcScope, setRecalcScope] = useState<'bpm' | 'key' | 'both'>(() => recalcScopeForMode(recalcMode))
  const [recalcStrategy, setRecalcStrategy] = useState<'standard' | 'fallback' | 'both'>(() => recalcStrategyForMode(recalcMode))

  useEffect(() => {
    setRecalcScope(recalcScopeForMode(recalcMode))
    setRecalcStrategy(recalcStrategyForMode(recalcMode))
  }, [recalcMode])

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
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 dark:text-slate-400 dark:hover:text-white text-xl"
          >
            ×
          </button>
        </div>

        <div className="mt-6 space-y-12">
          <div className="grid gap-12 lg:grid-cols-2">
          <section className="relative rounded-[12px] bg-gray-100 dark:bg-slate-900 px-4 py-4 pl-5 text-gray-900 dark:text-white">
            <span className="absolute left-0 top-2 bottom-2 w-[2px] bg-emerald-500 dark:bg-emerald-400" />
            <div className="text-[10px] font-bold uppercase tracking-[0.05em] text-gray-500 dark:text-white/50">
              BPM
            </div>
            <div className="mt-3 flex items-center gap-3 text-4xl font-bold text-white">
              {typeof bpmModalSummary.currentBpm === 'number'
                ? `${Math.round(bpmModalSummary.currentBpm)} BPM`
                : '—'}
              {isAdmin && typeof bpmModalSummary.currentBpm === 'number' && (
                <div className="inline-flex h-6 items-center rounded-[6px] border border-white/20 bg-white/[0.04] text-[11px] font-semibold text-white/80">
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
                    className="px-3 leading-none hover:text-white disabled:text-white/40"
                    aria-label="Store half BPM"
                  >
                    ½
                  </button>
                  <span className="h-4 w-px bg-white/20" />
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
                    className="px-3 leading-none hover:text-white disabled:text-white/40"
                    aria-label="Store double BPM"
                  >
                    2x
                  </button>
                </div>
              )}
            </div>
            <div className="mt-1 flex items-center justify-between gap-4">
              <div className="text-[11px] text-gray-600 dark:text-white/50">
                Algo: {bpmModalSummary.bpmSelectedLabel}
                {' · '}
                Confidence:{' '}
                {bpmModalSummary.bpmSelectedConfidence != null
                  ? `${Math.round(bpmModalSummary.bpmSelectedConfidence * 100)}%`
                  : 'n/a'}
              </div>
            </div>

            {!bpmModalData.hasEssentiaBpm && !bpmModalData.hasLibrosaBpm && bpmModalData.currentBpm == null ? (
              <div className="mt-4 space-y-3 text-sm text-gray-700 dark:text-white/70">
                <p>BPM data is not available yet.</p>
                {bpmDetails[bpmModalData.trackId]?.error ? (
                  <div className="text-xs text-gray-600 dark:text-white/50">
                    Reason: {bpmDetails[bpmModalData.trackId].error}
                  </div>
                ) : (
                  <div className="text-xs text-gray-600 dark:text-white/50">
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
                  <div className="rounded-[12px] bg-gray-200 dark:bg-black/20 px-3 py-2 text-xs text-gray-700 dark:text-white/70">
                    <div className="font-semibold text-gray-900 dark:text-white">Compare audio previews</div>
                    <div className="mt-2 space-y-2">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.08em] text-gray-600 dark:text-white/50">iTunes preview</div>
                        {mismatchPreviewUrls.itunes ? (
                          <audio controls src={mismatchPreviewUrls.itunes} className="mt-1 w-full" />
                        ) : (
                          <div className="text-xs text-gray-600 dark:text-white/50">No iTunes preview URL available.</div>
                        )}
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.08em] text-gray-600 dark:text-white/50">Spotify preview</div>
                        {mismatchPreviewUrls.loading ? (
                          <div className="text-xs text-gray-600 dark:text-white/50">Loading Spotify preview…</div>
                        ) : mismatchPreviewUrls.spotify ? (
                          <audio controls src={mismatchPreviewUrls.spotify} className="mt-1 w-full" />
                        ) : (
                          <div className="text-xs text-gray-600 dark:text-white/50">No Spotify preview URL available.</div>
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
                  <div className="text-xs text-gray-600 dark:text-white/50">
                    Waiting for first partial result...
                  </div>
                )}
                {trackBpms[bpmModalData.trackId] == null && !retryAttempted && (
                  <button
                    onClick={onRetryBpm}
                    disabled={retryStatus?.loading}
                    className="rounded-full border border-blue-300 px-4 py-2 text-xs font-semibold text-blue-700 hover:border-blue-400 hover:bg-blue-50 disabled:text-blue-300 dark:border-emerald-500/40 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
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
                      <button
                        key={candidate.id}
                        onClick={() => {
                          if (!isAdmin || isSelected) return
                          onUpdateBpmSelection({
                            spotifyTrackId: bpmModalData.trackId,
                            bpmSelected: candidate.id,
                          })
                        }}
                        disabled={isUpdatingSelection || (isSelected && !isAdmin)}
                        className={`group relative -ml-5 flex w-full items-center justify-between px-3 py-2 pl-5 text-left text-sm transition ${
                          isSelected
                            ? 'bg-white/[0.04] text-white'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        {isSelected && (
                          <span className="absolute left-0 top-2 bottom-2 w-[2px] bg-emerald-400" />
                        )}
                        <div className={`text-[12px] font-semibold ${isSelected ? 'text-white/60' : 'text-white/50 group-hover:text-white/70'}`}>
                          {candidate.label}
                        </div>
                        <div className={`text-[12px] ${isSelected ? 'text-white/60' : 'text-white/50 group-hover:text-white/70'}`}>
                          {Math.round(candidate.value)} ·{' '}
                          {candidate.confidence != null
                            ? `${Math.round(candidate.confidence * 100)}%`
                            : 'n/a'}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {isAdmin && (
                  <div className="mt-6 flex flex-col gap-2 group/input">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40 transition-colors group-focus-within/input:text-emerald-400">
                      <span>Manual override</span>
                      <svg
                        className="h-2.5 w-2.5 text-white/40"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative w-28 group/manual">
                        <input
                          type="number"
                          value={manualBpm || bpmModalData.fullData?.bpmManual || ''}
                          onChange={(e) => onSetManualBpm(e.target.value)}
                          placeholder="Enter BPM"
                          className={ghostFieldClass}
                          min="1"
                          max="300"
                        />
                        <div className="absolute bottom-0 left-0 h-[1px] w-0 bg-emerald-500/50 transition-all duration-500 group-focus-within/manual:w-full" />
                      </div>
                      {manualBpm && manualBpm !== String(bpmModalData.fullData?.bpmManual || '') ? (
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
                          disabled={isUpdatingSelection}
                          className="text-[11px] font-semibold text-emerald-300 hover:text-emerald-200 disabled:text-emerald-300/40"
                        >
                          Save
                        </button>
                      ) : null}
                      {bpmModalData.bpmSelected === 'manual' && bpmModalData.fullData?.bpmManual != null && (
                        <span className="text-[11px] text-white/40">
                          Selected: {Math.round(bpmModalData.fullData.bpmManual)}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="relative rounded-[12px] bg-gray-100 dark:bg-slate-900 px-4 py-4 pl-5 text-gray-900 dark:text-white">
            <span className="absolute left-0 top-2 bottom-2 w-[2px] bg-emerald-500 dark:bg-emerald-400" />
            <div className="text-[10px] font-bold uppercase tracking-[0.05em] text-gray-500 dark:text-white/50">
              Key & scale
            </div>
            <div className="mt-3 flex items-center gap-2 text-4xl font-bold text-white">
              {bpmModalSummary.currentKey || bpmModalSummary.currentScale
                ? `${bpmModalSummary.currentKey || ''} ${bpmModalSummary.currentScale || ''}`.trim()
                : '—'}
            </div>
            <div className="mt-1 flex items-center justify-between gap-4">
              <div className="text-[11px] text-gray-600 dark:text-white/50">
                Algo: {bpmModalSummary.keySelectedLabel}
                {' · '}
                Confidence:{' '}
                {bpmModalSummary.keySelectedConfidence != null
                  ? `${Math.round(bpmModalSummary.keySelectedConfidence * 100)}%`
                  : 'n/a'}
              </div>
            </div>

            {bpmModalSummary.keyCandidates.length > 0 ? (
              <div className="mt-6 space-y-2">
                {bpmModalSummary.keyCandidates.map((candidate) => {
                  const isSelected = bpmModalData.keySelected === candidate.id
                  return (
                    <button
                      key={candidate.id}
                      onClick={() => {
                        if (!isAdmin || isSelected) return
                        onUpdateBpmSelection({
                          spotifyTrackId: bpmModalData.trackId,
                          keySelected: candidate.id,
                        })
                      }}
                      disabled={isUpdatingSelection || (isSelected && !isAdmin)}
                      className={`group relative -ml-5 flex w-full items-center justify-between px-3 py-2 pl-5 text-left text-sm transition ${
                        isSelected
                          ? 'bg-white/[0.04] text-white'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      {isSelected && (
                        <span className="absolute left-0 top-2 bottom-2 w-[2px] bg-emerald-400" />
                      )}
                      <div className={`text-[12px] font-semibold ${isSelected ? 'text-white/60' : 'text-white/50 group-hover:text-white/70'}`}>
                        {candidate.label}
                      </div>
                      <div className={`text-[12px] ${isSelected ? 'text-white/60' : 'text-white/50 group-hover:text-white/70'}`}>
                        {candidate.key || '—'} ·{' '}
                        {candidate.confidence != null
                          ? `${Math.round(candidate.confidence * 100)}%`
                          : 'n/a'}
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="mt-3 text-sm text-gray-700 dark:text-white/50">
                Key data is not available yet.
              </div>
            )}

            {isAdmin && (
              <div className="mt-6 flex flex-col gap-2 group/input">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40 transition-colors group-focus-within/input:text-emerald-400">
                  <span>Manual override</span>
                  <svg
                    className="h-2.5 w-2.5 text-white/40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative group/select min-w-[120px]">
                    <select
                      value={manualKey || bpmModalData.fullData?.keyManual || ''}
                      onChange={(e) => onSetManualKey(e.target.value)}
                      className={`${manualSelectClass} no-chevron min-w-[120px] ${
                        (manualKey || bpmModalData.fullData?.keyManual) ? 'text-white/90' : 'text-white/10'
                      }`}
                    >
                      <option value="">Enter Key</option>
                      {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map(k => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                    <div className="absolute bottom-0 left-0 h-[1px] w-0 bg-emerald-500/50 transition-all duration-500 group-focus-within/select:w-full" />
                  </div>
                  <div className="relative group/select min-w-[120px]">
                    <select
                      value={manualScale || bpmModalData.fullData?.scaleManual || ''}
                      onChange={(e) => onSetManualScale(e.target.value)}
                      className={`${manualSelectClass} no-chevron min-w-[120px] ${
                        (manualScale || bpmModalData.fullData?.scaleManual) ? 'text-white/90' : 'text-white/10'
                      }`}
                    >
                      <option value="">Scale</option>
                      <option value="major">Major</option>
                      <option value="minor">Minor</option>
                    </select>
                    <div className="absolute bottom-0 left-0 h-[1px] w-0 bg-emerald-500/50 transition-all duration-500 group-focus-within/select:w-full" />
                  </div>
                  {(manualKey && manualKey !== (bpmModalData.fullData?.keyManual || ''))
                    || (manualScale && manualScale !== (bpmModalData.fullData?.scaleManual || '')) ? (
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
                      disabled={isUpdatingSelection}
                      className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 disabled:text-emerald-300 dark:text-emerald-300 dark:hover:text-emerald-200 dark:disabled:text-emerald-300/40"
                    >
                      Save
                    </button>
                  ) : null}
                  {bpmModalData.keySelected === 'manual' && bpmModalData.fullData?.keyManual && (
                    <span className="text-[11px] text-gray-500 dark:text-white/40">
                      Selected: {bpmModalData.fullData.keyManual} {bpmModalData.fullData.scaleManual}
                    </span>
                  )}
                </div>
              </div>
            )}
          </section>
          </div>

          <section className="pl-5">
            <div className="flex flex-col gap-3 rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-2 sm:flex-row sm:items-center">
              <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div className="flex flex-col items-start gap-1 sm:items-start">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/40">
                    Scope
                  </span>
                  <div className="flex items-center gap-1">
                    {(['bpm', 'key', 'both'] as const).map((scope) => (
                      <button
                        key={scope}
                        onClick={() => {
                          setRecalcScope(scope)
                          onSetRecalcMode(toMode(scope, recalcStrategy))
                        }}
                        disabled={recalcStatus?.loading}
                        className={`rounded-[8px] px-3 py-1 text-[11px] font-semibold transition ${
                          recalcScope === scope
                            ? 'bg-white/10 text-white'
                            : 'text-white/60 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        {scope === 'bpm' ? 'BPM' : scope === 'key' ? 'Key' : 'Both'}
                      </button>
                    ))}
                  </div>
                </div>
                <span className="hidden h-full w-px bg-white/10 sm:block" />
                <div className="flex flex-col items-start gap-1 sm:items-start">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/40">
                    Algorithm
                  </span>
                  <div className="flex items-center gap-1">
                    {(['standard', 'fallback', 'both'] as const).map((strategy) => (
                      <button
                        key={strategy}
                        onClick={() => {
                          setRecalcStrategy(strategy)
                          onSetRecalcMode(toMode(recalcScope, strategy))
                        }}
                        disabled={recalcStatus?.loading}
                        className={`rounded-[8px] px-3 py-1 text-[11px] font-semibold transition ${
                          recalcStrategy === strategy
                            ? 'bg-white/10 text-white'
                            : 'text-white/60 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        {strategy === 'standard' ? 'Standard' : strategy === 'fallback' ? 'Fallback' : 'Both'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  const mode = toMode(recalcScope, recalcStrategy)
                  onSetRecalcMode(mode)
                  onRecalcTrack(mode)
                }}
                disabled={recalcStatus?.loading}
                className={`h-10 rounded-[12px] px-4 text-[11px] font-semibold text-white shadow-sm transition sm:ml-auto ${
                  recalcStatus?.loading ? 'bg-[#15803d]/60' : 'bg-[#15803d] hover:bg-[#166534]'
                }`}
              >
                {recalcStatus?.loading ? 'Recalculating...' : 'Recalculate'}
              </button>
            </div>
            {recalcStatus?.error && (
              <div className="mt-2 text-xs text-red-600">{recalcStatus.error}</div>
            )}
          </section>

          {isAdmin && (
            <section className="pl-5">
              <button
                onClick={() => onSetShowBpmModalDebug(!showBpmModalDebug)}
                className="mx-auto block text-center text-[10px] font-semibold text-white/40 hover:text-white/70"
              >
                {showBpmModalDebug ? 'Hide Debug Logs' : 'View Debug Logs'}
              </button>

              {showBpmModalDebug && (
                <div className="mt-4 rounded-[12px] bg-black/50 p-4 text-[10px] text-white/70 shadow-inner">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-medium uppercase tracking-[0.15em] text-white/40" htmlFor="modal-bpm-debug-level">
                        Log level
                      </label>
                      <select
                        id="modal-bpm-debug-level"
                        value={bpmDebugLevel}
                        onChange={(e) => onSetBpmDebugLevel(e.target.value)}
                        className="w-full rounded-[10px] border border-white/10 bg-black/40 px-3 py-2 text-[10px] text-white/80 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                      >
                        <option value="minimal">Minimal</option>
                        <option value="normal">Normal</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] font-medium uppercase tracking-[0.15em] text-white/40" htmlFor="modal-bpm-confidence-threshold">
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
                        className="w-full rounded-[10px] border border-white/10 bg-black/40 px-3 py-2 text-[10px] text-white/80 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                      Live logs
                    </div>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-[10px] bg-black/60 p-3 font-mono text-[10px] text-white/70">
                      {bpmModalData.fullData?.debugTxt || 'No live logs yet.'}
                    </pre>
                  </div>
                  <div className="mt-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                      Last payload
                    </div>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-[10px] bg-black/60 p-3 font-mono text-[10px] text-white/70">
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

      </div>
    </div>
  )
}
