'use client'

import { useEffect, useState, useRef } from 'react'

interface StreamStatus {
  type: 'status' | 'result' | 'progress' | 'complete' | 'error'
  status?: 'processing' | 'completed' | 'partial' | 'final'
  result_status?: 'partial' | 'final'
  total?: number
  processed?: number
  index?: number
  url?: string
  batch_id?: string
  message?: string
  // Result fields
  bpm_essentia?: number | null
  bpm_raw_essentia?: number | null
  bpm_confidence_essentia?: number | null
  bpm_librosa?: number | null
  bpm_raw_librosa?: number | null
  bpm_confidence_librosa?: number | null
  key_essentia?: string | null
  scale_essentia?: string | null
  keyscale_confidence_essentia?: number | null
  key_librosa?: string | null
  scale_librosa?: string | null
  keyscale_confidence_librosa?: number | null
  debug_txt?: string | null
}

interface StatusMonitorProps {
  batchId: string
  onComplete?: (results: StreamStatus[]) => void
  onError?: (error: string) => void
}

export default function StatusMonitor({ batchId, onComplete, onError }: StatusMonitorProps) {
  const [status, setStatus] = useState<StreamStatus | null>(null)
  const [results, setResults] = useState<StreamStatus[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!batchId) {
      return
    }

    // Create abort controller for cleanup
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    setIsStreaming(true)
    setError(null)
    setResults([])
    setStatus(null)

    const streamResults = async () => {
      try {
        const response = await fetch(`/api/stream/${batchId}`, {
          signal: abortController.signal,
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(errorData.error || `HTTP ${response.status}`)
        }

        if (!response.body) {
          throw new Error('No response body')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        const resultsByIndex = new Map<number, StreamStatus>()
        const sortedResults = () =>
          Array.from(resultsByIndex.values()).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))

        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            break
          }

          // Decode chunk and add to buffer
          buffer += decoder.decode(value, { stream: true })

          // Process complete lines (NDJSON format)
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim() === '') {
              continue
            }

            try {
              const data: StreamStatus = JSON.parse(line)
              
              // Validate parsed data
              if (!data || typeof data !== 'object') {
                console.warn('[StatusMonitor] Invalid parsed data:', data)
                continue
              }

              // Update status based on message type
              if (data.type === 'status') {
                setStatus(data)
              } else if (data.type === 'result') {
                // Only push valid result objects with required fields
                if (data && typeof data === 'object' && data.type === 'result' && typeof data.index === 'number') {
                  // Ensure we have a valid result object with all fields properly typed
                  const validResult: StreamStatus = {
                    type: 'result',
                    index: data.index,
                    url: typeof data.url === 'string' ? data.url : undefined,
                    result_status: data.status === 'partial' || data.status === 'final' ? data.status : undefined,
                    bpm_essentia: typeof data.bpm_essentia === 'number' ? data.bpm_essentia : (data.bpm_essentia === null ? null : undefined),
                    bpm_raw_essentia: typeof data.bpm_raw_essentia === 'number' ? data.bpm_raw_essentia : (data.bpm_raw_essentia === null ? null : undefined),
                    bpm_confidence_essentia: typeof data.bpm_confidence_essentia === 'number' ? data.bpm_confidence_essentia : (data.bpm_confidence_essentia === null ? null : undefined),
                    bpm_librosa: typeof data.bpm_librosa === 'number' ? data.bpm_librosa : (data.bpm_librosa === null ? null : undefined),
                    bpm_raw_librosa: typeof data.bpm_raw_librosa === 'number' ? data.bpm_raw_librosa : (data.bpm_raw_librosa === null ? null : undefined),
                    bpm_confidence_librosa: typeof data.bpm_confidence_librosa === 'number' ? data.bpm_confidence_librosa : (data.bpm_confidence_librosa === null ? null : undefined),
                    key_essentia: typeof data.key_essentia === 'string' ? data.key_essentia : (data.key_essentia === null ? null : undefined),
                    scale_essentia: typeof data.scale_essentia === 'string' ? data.scale_essentia : (data.scale_essentia === null ? null : undefined),
                    keyscale_confidence_essentia: typeof data.keyscale_confidence_essentia === 'number' ? data.keyscale_confidence_essentia : (data.keyscale_confidence_essentia === null ? null : undefined),
                    key_librosa: typeof data.key_librosa === 'string' ? data.key_librosa : (data.key_librosa === null ? null : undefined),
                    scale_librosa: typeof data.scale_librosa === 'string' ? data.scale_librosa : (data.scale_librosa === null ? null : undefined),
                    keyscale_confidence_librosa: typeof data.keyscale_confidence_librosa === 'number' ? data.keyscale_confidence_librosa : (data.keyscale_confidence_librosa === null ? null : undefined),
                    debug_txt: typeof data.debug_txt === 'string' ? data.debug_txt : (data.debug_txt === null ? null : undefined),
                  }
                  const existing = resultsByIndex.get(validResult.index)
                  const shouldIgnore =
                    existing?.result_status === 'final' && validResult.result_status === 'partial'
                  if (!shouldIgnore) {
                    const mergedResult = {
                      ...existing,
                      ...validResult,
                      type: 'result',
                      index: validResult.index,
                    }
                    resultsByIndex.set(validResult.index, mergedResult)
                  }
                  setResults(sortedResults())
                } else {
                  console.warn('[StatusMonitor] Invalid result data:', data, 'Type:', typeof data, 'Has index:', data?.index)
                }
              } else if (data.type === 'progress') {
                setStatus((prev) => ({
                  ...prev,
                  type: 'progress',
                  processed: data.processed,
                  total: data.total,
                }))
              } else if (data.type === 'complete') {
                setStatus({
                  type: 'complete',
                  status: 'completed',
                  batch_id: data.batch_id,
                  total: data.total,
                })
                setIsStreaming(false)
                // Filter out any invalid results before calling onComplete
                const validResults = sortedResults().filter((r): r is StreamStatus =>
                  r != null && typeof r === 'object' && r.type === 'result'
                )
                onComplete?.(validResults)
                return // Stream is complete
              } else if (data.type === 'error') {
                setError(data.message || 'Unknown error')
                setIsStreaming(false)
                onError?.(data.message || 'Unknown error')
                return // Stream ended with error
              }
            } catch (parseError) {
              console.error('[StatusMonitor] Failed to parse JSON line:', line, parseError)
              // Continue processing other lines
            }
          }
        }

        // Handle any remaining buffer content
        if (buffer.trim()) {
          try {
            const data: StreamStatus = JSON.parse(buffer.trim())
            if (data.type === 'complete') {
              setStatus({
                type: 'complete',
                status: 'completed',
                batch_id: data.batch_id,
                total: data.total,
              })
              setIsStreaming(false)
              // Filter out any invalid results before calling onComplete
              const validResults = sortedResults().filter((r): r is StreamStatus =>
                r != null && typeof r === 'object' && r.type === 'result'
              )
              onComplete?.(validResults)
            }
          } catch (parseError) {
            console.error('[StatusMonitor] Failed to parse final buffer:', parseError)
          }
        }
        
        // If stream ended without complete message, still call onComplete with valid results
        if (resultsByIndex.size > 0) {
          const validResults = sortedResults().filter((r): r is StreamStatus =>
            r != null && typeof r === 'object' && r.type === 'result'
          )
          if (validResults.length > 0) {
            setIsStreaming(false)
            onComplete?.(validResults)
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Stream was aborted (component unmounted or new batchId)
          return
        }

        const errorMessage = err instanceof Error ? err.message : 'Failed to stream results'
        setError(errorMessage)
        setIsStreaming(false)
        onError?.(errorMessage)
      }
    }

    streamResults()

    // Cleanup function
    return () => {
      abortController.abort()
      setIsStreaming(false)
    }
  }, [batchId, onComplete, onError])

  return (
    <div className="status-monitor">
      {error && (
        <div className="error-message text-red-600 p-4 bg-red-50 rounded">
          <strong>Error:</strong> {error}
        </div>
      )}

      {status && (
        <div className="status-info p-4 bg-gray-50 rounded mb-4">
          <div className="status-header flex items-center gap-2 mb-2">
            <span className="font-semibold">Status:</span>
            <span className={`status-badge px-2 py-1 rounded text-sm ${
              status.status === 'completed' 
                ? 'bg-green-100 text-green-800' 
                : 'bg-blue-100 text-blue-800'
            }`}>
              {status.status || 'processing'}
            </span>
            {isStreaming && (
              <span className="text-xs text-gray-500">(streaming...)</span>
            )}
          </div>

          {status.total !== undefined && (
            <div className="progress-info">
              <span>
                Processed: {status.processed || 0} / {status.total}
              </span>
              {status.total > 0 && (
                <div className="progress-bar mt-2 w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${((status.processed || 0) / status.total) * 100}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="results-container mt-4">
          <h3 className="font-semibold mb-2">Results ({results.length}):</h3>
          <div className="results-list space-y-2">
            {results
              .filter((result): result is StreamStatus => {
                // Strict type guard - ensure result is a valid StreamStatus object
                return (
                  result != null &&
                  typeof result === 'object' &&
                  result.type === 'result' &&
                  typeof result.index === 'number'
                )
              })
              .map((result, idx) => {
                // Double-check result is valid (defensive programming)
                if (!result || typeof result !== 'object' || result.type !== 'result') {
                  console.warn('[StatusMonitor] Invalid result in map:', result)
                  return null
                }
                
                return (
                  <div
                    key={result.index ?? idx}
                    className="result-item p-3 bg-white border rounded shadow-sm"
                  >
                    <div className="result-header flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">
                        #{result.index ?? idx + 1}
                      </span>
                      {result.result_status && (
                        <span className={`text-xs px-2 py-1 rounded ${
                          result.result_status === 'final'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {result.result_status}
                        </span>
                      )}
                      {result.bpm_essentia != null && typeof result.bpm_essentia === 'number' && (
                        <span className="text-lg font-bold text-blue-600">
                          {result.bpm_essentia} BPM
                        </span>
                      )}
                    </div>
                    {result.url && typeof result.url === 'string' && (
                      <div className="text-xs text-gray-500 truncate mb-1">
                        {result.url}
                      </div>
                    )}
                    {result.key_essentia && typeof result.key_essentia === 'string' && (
                      <div className="text-sm text-gray-600">
                        Key: {result.key_essentia} {result.scale_essentia || ''}
                        {result.keyscale_confidence_essentia != null && typeof result.keyscale_confidence_essentia === 'number' && (
                          <span className="text-xs text-gray-400 ml-1">
                            ({Math.round(result.keyscale_confidence_essentia * 100)}%)
                          </span>
                        )}
                      </div>
                    )}
                    {result.bpm_confidence_essentia != null && typeof result.bpm_confidence_essentia === 'number' && (
                      <div className="text-xs text-gray-500 mt-1">
                        Confidence: {Math.round(result.bpm_confidence_essentia * 100)}%
                      </div>
                    )}
                  </div>
                )
              })
              .filter((item): item is JSX.Element => item != null) // Remove any null entries from the map
            }
          </div>
        </div>
      )}
    </div>
  )
}
