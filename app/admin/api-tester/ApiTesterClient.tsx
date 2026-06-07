'use client'

import { useMemo, useState } from 'react'

type EndpointDefinition = {
  id: string
  name: string
  description: string
  method: 'GET' | 'POST'
  path: string
  query?: Record<string, string>
  body?: Record<string, unknown>
  notes?: string
}

type EndpointState = {
  queryText: string
  bodyText: string
  loading: boolean
  error: string | null
  response: {
    status: number
    ok: boolean
    durationMs: number
    contentType: string | null
    timestamp: string
    bodyText: string
  } | null
}

const endpointDefinitions: EndpointDefinition[] = [
  {
    id: 'musicbrainz-search',
    name: 'MusicBrainz search',
    description: 'Run the credit-based search route backed by MusicBrainz and Muso enrichment.',
    method: 'GET',
    path: '/api/musicbrainz/search',
    query: {
      name: 'Max Martin',
      role: 'producer',
      limit: '5',
      offset: '0',
      debug: 'true',
    },
    notes: 'Edit the search role or date filters directly in the query JSON.',
  },
  {
    id: 'musicbrainz-credits',
    name: 'Track credits',
    description: 'Fetch normalized track credits for an ISRC through Muso or MusicBrainz fallback.',
    method: 'GET',
    path: '/api/musicbrainz/credits',
    query: {
      isrc: 'GBUM71029604',
      refresh: 'true',
    },
  },
  {
    id: 'muso-preview',
    name: 'Muso preview',
    description: 'Resolve Spotify preview audio via Muso using a Spotify track ID payload.',
    method: 'POST',
    path: '/api/muso/preview',
    body: {
      spotifyTrackId: '11dFghVXANMlKmJXsNCbNl',
    },
  },
  {
    id: 'muso-status',
    name: 'Muso quota status',
    description: 'Inspect current Muso quota availability from the admin-only status route.',
    method: 'GET',
    path: '/api/admin/muso-status',
  },
  {
    id: 'deezer-preview',
    name: 'Deezer preview proxy',
    description: 'Proxy a Deezer API URL and extract the preview URL from the reply.',
    method: 'GET',
    path: '/api/deezer-preview',
    query: {
      url: 'https://api.deezer.com/search?q=isrc:%22GBUM71029604%22&limit=1',
    },
  },
  {
    id: 'bpm-track',
    name: 'BPM analysis',
    description: 'Trigger BPM/key analysis for a Spotify track through the app API.',
    method: 'GET',
    path: '/api/bpm',
    query: {
      spotifyTrackId: '11dFghVXANMlKmJXsNCbNl',
      country: 'us',
    },
  },
  {
    id: 'bpm-health',
    name: 'BPM service health',
    description: 'Check the remote BPM service health endpoint through the authenticated app route.',
    method: 'GET',
    path: '/api/bpm/health',
  },
  {
    id: 'services-health',
    name: 'Service health',
    description: 'Inspect Spotify, Muso, and MusicBrainz health checks in one response.',
    method: 'GET',
    path: '/api/health/services',
  },
  {
    id: 'country-detect',
    name: 'Country detection',
    description: 'Test the country detection helper route that relies on request headers and IP fallback.',
    method: 'GET',
    path: '/api/country',
  },
]

const createInitialState = (definition: EndpointDefinition): EndpointState => ({
  queryText: definition.query ? JSON.stringify(definition.query, null, 2) : '{}',
  bodyText: definition.body ? JSON.stringify(definition.body, null, 2) : '{}',
  loading: false,
  error: null,
  response: null,
})

function parseJsonRecord(input: string, label: string): Record<string, unknown> {
  const trimmed = input.trim()
  if (!trimmed) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error(`${label} must be valid JSON`)
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${label} must be a JSON object`)
  }

  return parsed as Record<string, unknown>
}

function buildUrl(path: string, queryRecord: Record<string, unknown>): string {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(queryRecord)) {
    if (value === null || value === undefined || value === '') continue
    if (Array.isArray(value)) {
      for (const entry of value) {
        params.append(key, String(entry))
      }
      continue
    }
    params.set(key, String(value))
  }

  const query = params.toString()
  return query ? `${path}?${query}` : path
}

function prettyPrintResponse(bodyText: string, contentType: string | null): string {
  if (!bodyText.trim()) return ''
  if (!contentType?.includes('application/json')) return bodyText

  try {
    return JSON.stringify(JSON.parse(bodyText), null, 2)
  } catch {
    return bodyText
  }
}

export default function ApiTesterClient() {
  const [selectedEndpointId, setSelectedEndpointId] = useState(endpointDefinitions[0]?.id ?? '')
  const [endpointStates, setEndpointStates] = useState<Record<string, EndpointState>>(() =>
    Object.fromEntries(endpointDefinitions.map((definition) => [definition.id, createInitialState(definition)]))
  )

  const selectedDefinition = useMemo(
    () => endpointDefinitions.find((definition) => definition.id === selectedEndpointId) ?? endpointDefinitions[0],
    [selectedEndpointId]
  )

  const selectedState = selectedDefinition
    ? endpointStates[selectedDefinition.id] ?? createInitialState(selectedDefinition)
    : null

  const updateState = (definitionId: string, updates: Partial<EndpointState>) => {
    setEndpointStates((current) => ({
      ...current,
      [definitionId]: {
        ...(current[definitionId] ?? createInitialState(endpointDefinitions.find((item) => item.id === definitionId)!)),
        ...updates,
      },
    }))
  }

  const runRequest = async (definition: EndpointDefinition) => {
    const currentState = endpointStates[definition.id] ?? createInitialState(definition)
    updateState(definition.id, { loading: true, error: null })

    try {
      const queryRecord = parseJsonRecord(currentState.queryText, 'Query payload')
      const bodyRecord = parseJsonRecord(currentState.bodyText, 'Request body')
      const url = buildUrl(definition.path, queryRecord)

      const init: RequestInit = {
        method: definition.method,
        headers: {},
      }

      if (definition.method !== 'GET') {
        ;(init.headers as Record<string, string>)['Content-Type'] = 'application/json'
        init.body = JSON.stringify(bodyRecord)
      }

      const start = performance.now()
      const response = await fetch(url, init)
      const durationMs = Math.round(performance.now() - start)
      const contentType = response.headers.get('content-type')
      const bodyText = await response.text()

      updateState(definition.id, {
        loading: false,
        error: null,
        response: {
          status: response.status,
          ok: response.ok,
          durationMs,
          contentType,
          timestamp: new Date().toISOString(),
          bodyText: prettyPrintResponse(bodyText, contentType),
        },
      })
    } catch (error) {
      updateState(definition.id, {
        loading: false,
        error: error instanceof Error ? error.message : 'Request failed',
      })
    }
  }

  const resetSelected = () => {
    if (!selectedDefinition) return
    updateState(selectedDefinition.id, createInitialState(selectedDefinition))
  }

  if (!selectedDefinition || !selectedState) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">External API tester</h2>
            <p className="mt-1 max-w-3xl text-sm text-gray-500">
              Pick an integration route, edit the sample query or body payload, then execute it and inspect the raw reply.
            </p>
          </div>
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            {endpointDefinitions.length} endpoints
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_4px_24px_rgba(0,0,0,0.05)]">
          <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
            Route presets
          </div>
          <div className="space-y-2">
            {endpointDefinitions.map((definition) => {
              const isSelected = definition.id === selectedDefinition.id
              const response = endpointStates[definition.id]?.response
              return (
                <button
                  key={definition.id}
                  type="button"
                  onClick={() => setSelectedEndpointId(definition.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    isSelected
                      ? 'border-emerald-200 bg-emerald-50 shadow-sm'
                      : 'border-gray-100 bg-white hover:border-emerald-100 hover:bg-emerald-50/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-gray-900">{definition.name}</div>
                    <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                      {definition.method}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{definition.path}</div>
                  {response ? (
                    <div className="mt-2 text-[11px] text-gray-500">
                      Last run: {response.status} in {response.durationMs}ms
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.05)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-900">{selectedDefinition.name}</h3>
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                    {selectedDefinition.method}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500">{selectedDefinition.description}</p>
                <div className="mt-2 font-mono text-xs text-gray-400">{selectedDefinition.path}</div>
                {selectedDefinition.notes ? (
                  <div className="mt-2 text-xs text-amber-700">{selectedDefinition.notes}</div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={resetSelected}
                  className="rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Reset sample
                </button>
                <button
                  type="button"
                  onClick={() => runRequest(selectedDefinition)}
                  className="rounded-full border border-emerald-200 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={selectedState.loading}
                >
                  {selectedState.loading ? 'Running...' : 'Send request'}
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <label className="block">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Query JSON</div>
                <textarea
                  value={selectedState.queryText}
                  onChange={(event) => updateState(selectedDefinition.id, { queryText: event.target.value })}
                  className="min-h-[220px] w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-xs text-gray-700 outline-none transition focus:border-emerald-300 focus:bg-white"
                  spellCheck={false}
                />
              </label>

              <label className="block">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Body JSON</div>
                <textarea
                  value={selectedState.bodyText}
                  onChange={(event) => updateState(selectedDefinition.id, { bodyText: event.target.value })}
                  className="min-h-[220px] w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-xs text-gray-700 outline-none transition focus:border-emerald-300 focus:bg-white"
                  spellCheck={false}
                />
              </label>
            </div>

            {selectedState.error ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {selectedState.error}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.05)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Response inspector</h3>
                <p className="mt-1 text-xs text-gray-500">Raw response body, status, timing, and content type from the selected route.</p>
              </div>
              {selectedState.response ? (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                  <span
                    className={`rounded-full px-2 py-1 font-semibold ${
                      selectedState.response.ok
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {selectedState.response.status}
                  </span>
                  <span>{selectedState.response.durationMs}ms</span>
                  <span>{selectedState.response.contentType || 'unknown content type'}</span>
                </div>
              ) : null}
            </div>

            {selectedState.response ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400">Status</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">{selectedState.response.status}</div>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400">Duration</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">{selectedState.response.durationMs}ms</div>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400">Timestamp</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">{new Date(selectedState.response.timestamp).toLocaleString()}</div>
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Body</div>
                  <pre className="max-h-[560px] overflow-auto rounded-2xl border border-gray-200 bg-slate-950 p-4 text-xs text-slate-100">
                    {selectedState.response.bodyText || '(empty response body)'}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                No response yet. Send a request to inspect the reply here.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
