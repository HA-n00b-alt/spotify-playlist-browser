import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// useBpmAnalysis is a React hook, but the stream error path is plain async code behind
// useCallback. A minimal React stand-in lets the test call the hook as a function, keep its
// refs across calls, and read the state its `set` actions produce, without a DOM renderer.
const react = vi.hoisted(() => {
  const effects: Array<() => void | (() => void)> = []
  const state: Record<string, any> = {}
  return {
    effects,
    state,
    useCallback: (fn: unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
    useRef: (current: unknown) => ({ current }),
    useEffect: (fn: () => void | (() => void)) => {
      effects.push(fn)
    },
    useReducer: (_reducer: unknown, _arg: unknown, init: () => Record<string, any>) => {
      Object.assign(state, init())
      const dispatch = (action: { type: string; key: string; value: unknown }) => {
        if (action.type !== 'set') return
        state[action.key] = typeof action.value === 'function'
          ? (action.value as (prev: unknown) => unknown)(state[action.key])
          : action.value
      }
      return [state, dispatch]
    },
  }
})

vi.mock('react', () => react)
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarning: vi.fn(), logInfo: vi.fn() }))

import { logError } from '@/lib/logger'
import { useBpmAnalysis } from '@/app/hooks/useBpmAnalysis'
import type { SpotifyTrack } from '@/lib/types'

const track = (id: string) => ({ id, name: id }) as unknown as SpotifyTrack

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
})

// A results stream that stays open until it is aborted (rejecting reads with AbortError, as
// fetch does) or until the test fails it with a network error.
function openResultsStream(signal: AbortSignal | undefined) {
  let fail: (error: Error) => void = () => {}
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      fail = (error) => controller.error(error)
      signal?.addEventListener('abort', () => {
        controller.error(new DOMException('The operation was aborted.', 'AbortError'))
      })
    },
  })
  return { response: new Response(body, { status: 200 }), fail: (error: Error) => fail(error) }
}

describe('BPM results stream errors', () => {
  const streams: Array<ReturnType<typeof openResultsStream>> = []
  let streamRequested: () => void

  beforeEach(() => {
    react.effects.length = 0
    streams.length = 0
    vi.mocked(logError).mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/bpm/stream-batch') {
        const { trackIds } = JSON.parse(String(init?.body))
        return json({
          batchId: `batch-${trackIds[0]}`,
          indexToTrackId: Object.fromEntries(trackIds.map((id: string, i: number) => [i, id])),
        })
      }
      if (url.startsWith('/api/stream/')) {
        const stream = openResultsStream(init?.signal ?? undefined)
        streams.push(stream)
        streamRequested()
        return stream.response
      }
      throw new Error(`Unexpected fetch ${url}`)
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // Starts streaming BPMs for the tracks and resolves once their results stream is open, with
  // the still-running call wrapped so awaiting this helper does not wait for it.
  async function startStream(hook: ReturnType<typeof useBpmAnalysis>, ids: string[]) {
    const opened = new Promise<void>((resolve) => { streamRequested = resolve })
    const done = hook.streamBpmsForTracks(ids.map(track))
    await opened
    return { done }
  }

  it('does not report a stream superseded by a newer batch', async () => {
    const hook = useBpmAnalysis([])
    const first = await startStream(hook, ['a'])
    const second = await startStream(hook, ['b'])

    await first.done
    expect(logError).not.toHaveBeenCalled()

    streams[1].fail(new Error('stop'))
    await second.done
  })

  it('does not report a stream cancelled when the page goes away', async () => {
    const hook = useBpmAnalysis([])
    const { done } = await startStream(hook, ['a'])

    for (const effect of react.effects) {
      const cleanup = effect()
      if (typeof cleanup === 'function') cleanup()
    }
    await done

    expect(logError).not.toHaveBeenCalled()
  })

  it('reports a real stream failure and stops showing the tracks as loading', async () => {
    const hook = useBpmAnalysis([])
    const { done } = await startStream(hook, ['a', 'b'])
    expect(react.state.loadingBpmFields).toEqual(new Set(['a', 'b']))

    const failure = new TypeError('network error')
    streams[0].fail(failure)
    await done

    expect(logError).toHaveBeenCalledTimes(1)
    expect(logError).toHaveBeenCalledWith(failure, expect.objectContaining({
      component: 'bpm.stream.results',
      batchId: 'batch-a',
      trackCount: 2,
    }))
    expect(react.state.loadingBpmFields).toEqual(new Set())
    expect(react.state.loadingKeyFields).toEqual(new Set())
  })
})
