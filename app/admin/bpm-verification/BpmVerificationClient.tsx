"use client"

import { useState, type FormEvent } from 'react'

type VerificationResult = {
  result: string
}

export default function BpmVerificationClient() {
  const [artist, setArtist] = useState('')
  const [title, setTitle] = useState('')
  const [isrc, setIsrc] = useState('')
  const [year, setYear] = useState('')
  const [bpm, setBpm] = useState('')
  const [key, setKey] = useState('')
  const [scale, setScale] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<VerificationResult | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/admin/bpm-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist: artist.trim(),
          title: title.trim(),
          isrc: isrc.trim(),
          year: year.trim(),
          bpm: bpm.trim(),
          key: key.trim(),
          scale: scale.trim(),
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to verify BPM/key')
      }
      setResult({ result: String(payload?.result || '') })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify BPM/key')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <h2 className="text-lg font-semibold text-gray-900">BPM/Key Verification</h2>
        <p className="mt-2 text-sm text-gray-500">
          Send track metadata to ChatGPT with web search to validate BPM and key accuracy before manual overrides.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm text-gray-600">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Artist</span>
            <input
              value={artist}
              onChange={(event) => setArtist(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
              placeholder="Artist name"
            />
          </label>
          <label className="space-y-1 text-sm text-gray-600">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
              placeholder="Track title"
            />
          </label>
          <label className="space-y-1 text-sm text-gray-600">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">ISRC</span>
            <input
              value={isrc}
              onChange={(event) => setIsrc(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
              placeholder="ISRC code"
            />
          </label>
          <label className="space-y-1 text-sm text-gray-600">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Year</span>
            <input
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
              placeholder="Release year"
            />
          </label>
          <label className="space-y-1 text-sm text-gray-600">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Detected BPM</span>
            <input
              value={bpm}
              onChange={(event) => setBpm(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
              placeholder="e.g. 124"
            />
          </label>
          <label className="space-y-1 text-sm text-gray-600">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Detected Key</span>
            <input
              value={key}
              onChange={(event) => setKey(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
              placeholder="e.g. F#"
            />
          </label>
          <label className="space-y-1 text-sm text-gray-600">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Scale</span>
            <input
              value={scale}
              onChange={(event) => setScale(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
              placeholder="major / minor"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
              disabled={loading}
            >
              {loading ? 'Checking...' : 'Send to ChatGPT'}
            </button>
          </div>
        </form>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      {result ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
          <div className="text-sm font-semibold text-gray-900">ChatGPT Findings</div>
          <pre className="mt-3 whitespace-pre-wrap text-sm text-gray-600">{result.result}</pre>
        </div>
      ) : null}
    </div>
  )
}
