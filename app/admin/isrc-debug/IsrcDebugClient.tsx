'use client'

import { useEffect, useMemo, useState } from 'react'

type Playlist = {
  id: string
  name: string
  tracks?: { total: number }
  owner?: { display_name?: string }
}

type Track = {
  id: string
  name: string
  added_at?: string
  external_ids?: { isrc?: string }
  artists?: Array<{ name?: string }>
  album?: { name?: string }
  preview_url?: string | null
  uri?: string
}

export default function IsrcDebugClient() {
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [tracks, setTracks] = useState<Track[]>([])
  const [loadingPlaylists, setLoadingPlaylists] = useState(false)
  const [loadingTracks, setLoadingTracks] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoadingPlaylists(true)
      setError(null)
      try {
        const res = await fetch('/api/playlists?includeFollowers=false')
        if (!res.ok) {
          throw new Error('Failed to load playlists')
        }
        const data = await res.json()
        setPlaylists(Array.isArray(data) ? data : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load playlists')
      } finally {
        setLoadingPlaylists(false)
      }
    }
    void load()
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setTracks([])
      return
    }
    const loadTracks = async () => {
      setLoadingTracks(true)
      setError(null)
      try {
        const res = await fetch(`/api/playlists/${encodeURIComponent(selectedId)}/tracks?includeMissingIsrc=true`)
        if (!res.ok) {
          throw new Error('Failed to load tracks')
        }
        const data = await res.json()
        setTracks(Array.isArray(data) ? data : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tracks')
      } finally {
        setLoadingTracks(false)
      }
    }
    void loadTracks()
  }, [selectedId])

  const missingIsrcTracks = useMemo(
    () => tracks.filter((track) => !track?.external_ids?.isrc),
    [tracks]
  )

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">ISRC debug</h2>
            <p className="text-sm text-gray-500">
              Select a playlist to inspect tracks that are missing ISRC values from Spotify.
            </p>
          </div>
          <div className="text-xs text-gray-500">
            {loadingPlaylists ? 'Loading playlists…' : `${playlists.length} playlists`}
          </div>
        </div>
        <div className="mt-4">
          <label className="text-xs font-semibold text-gray-500">
            Playlist
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700"
            >
              <option value="">Select a playlist</option>
              {playlists.map((playlist) => (
                <option key={playlist.id} value={playlist.id}>
                  {playlist.name} {playlist.owner?.display_name ? `• ${playlist.owner.display_name}` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Missing ISRC tracks</h3>
            <p className="text-xs text-gray-500">
              Showing {missingIsrcTracks.length} of {tracks.length} tracks.
            </p>
          </div>
          <div className="text-xs text-gray-500">
            {loadingTracks ? 'Loading tracks…' : selectedId ? 'Loaded' : 'Select a playlist'}
          </div>
        </div>
        {missingIsrcTracks.length === 0 ? (
          <div className="mt-4 text-sm text-gray-500">No tracks missing ISRC for this playlist.</div>
        ) : (
          <div className="mt-4 overflow-auto">
            <table className="min-w-full text-left text-xs text-gray-600">
              <thead className="text-[11px] uppercase tracking-[0.18em] text-gray-400">
                <tr>
                  <th className="px-3 py-2">Track</th>
                  <th className="px-3 py-2">Artist</th>
                  <th className="px-3 py-2">Album</th>
                  <th className="px-3 py-2">Spotify ID</th>
                  <th className="px-3 py-2">Preview</th>
                  <th className="px-3 py-2">Added</th>
                </tr>
              </thead>
              <tbody>
                {missingIsrcTracks.map((track) => {
                  const artist = Array.isArray(track.artists)
                    ? track.artists.map((entry) => entry?.name).filter(Boolean).join(', ')
                    : ''
                  return (
                    <tr key={track.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-900">{track.name}</td>
                      <td className="px-3 py-2">{artist || '-'}</td>
                      <td className="px-3 py-2">{track.album?.name || '-'}</td>
                      <td className="px-3 py-2 text-[11px] text-gray-500">{track.id}</td>
                      <td className="px-3 py-2">
                        {track.preview_url ? (
                          <audio controls preload="none" className="w-40">
                            <source src={track.preview_url} />
                          </audio>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-gray-500">
                        {track.added_at ? new Date(track.added_at).toLocaleString() : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
