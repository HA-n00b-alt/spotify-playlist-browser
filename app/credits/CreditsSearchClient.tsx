'use client'

import { useState } from 'react'
import { formatDuration } from '@/lib/musicbrainz'

type RoleOption = 'producer' | 'songwriter' | 'mixer' | 'engineer' | 'artist'

interface SearchResult {
  id: string
  title: string
  artist: string
  album: string
  year: string
  length: number
  isrc?: string
}

interface SearchResponse {
  count: number
  offset: number
  limit: number
  results: SearchResult[]
}

const ROLE_OPTIONS: Array<{ value: RoleOption; label: string }> = [
  { value: 'producer', label: 'Producer' },
  { value: 'songwriter', label: 'Songwriter' },
  { value: 'mixer', label: 'Mixer' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'artist', label: 'Artist' },
]

export default function CreditsSearchClient() {
  const [name, setName] = useState('')
  const [role, setRole] = useState<RoleOption>('producer')
  const [results, setResults] = useState<SearchResult[]>([])
  const [count, setCount] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const limit = 25

  const fetchResults = async (nextOffset: number, append: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/musicbrainz/search?name=${encodeURIComponent(name)}&role=${encodeURIComponent(role)}&limit=${limit}&offset=${nextOffset}`
      )
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        const message =
          typeof payload?.error === 'string' ? payload.error : 'MusicBrainz search failed'
        throw new Error(message)
      }
      const data = (await res.json()) as SearchResponse
      setCount(data.count || 0)
      setOffset(data.offset || 0)
      setResults((prev) => (append ? [...prev, ...data.results] : data.results))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MusicBrainz search failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('Enter a name to search')
      return
    }
    await fetchResults(0, false)
  }

  const handleLoadMore = async () => {
    const nextOffset = offset + limit
    await fetchResults(nextOffset, true)
  }

  const hasMore = results.length < count

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g., Rick Rubin"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="sm:w-48">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Role
            </label>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as RoleOption)}
              className="w-full px-3 py-2 border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-5 rounded transition-colors disabled:opacity-60"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Searches MusicBrainz recordings by credit type and name.
        </p>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Results</h2>
          <span className="text-sm text-gray-500">
            {count > 0 ? `${results.length} of ${count}` : 'No results yet'}
          </span>
        </div>

        {results.length === 0 ? (
          <div className="text-sm text-gray-500">Search to see matching songs.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-3 font-semibold">Title</th>
                  <th className="py-2 pr-3 font-semibold">Artist</th>
                  <th className="py-2 pr-3 font-semibold">Release</th>
                  <th className="py-2 pr-3 font-semibold">Year</th>
                  <th className="py-2 pr-3 font-semibold">Length</th>
                  <th className="py-2 pr-3 font-semibold">ISRC</th>
                </tr>
              </thead>
              <tbody>
                {results.map((track) => (
                  <tr key={track.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3">
                      <a
                        href={`https://musicbrainz.org/recording/${encodeURIComponent(track.id)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-green-700 hover:text-green-800 hover:underline"
                      >
                        {track.title}
                      </a>
                    </td>
                    <td className="py-2 pr-3 text-gray-700">{track.artist}</td>
                    <td className="py-2 pr-3 text-gray-700">{track.album}</td>
                    <td className="py-2 pr-3 text-gray-700">{track.year || '-'}</td>
                    <td className="py-2 pr-3 text-gray-700">
                      {track.length ? formatDuration(track.length) : '-'}
                    </td>
                    <td className="py-2 pr-3 text-gray-700">{track.isrc || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasMore && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded transition-colors disabled:opacity-60"
            >
              {loading ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
