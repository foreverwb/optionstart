import { useEffect, useRef, useState, useCallback } from 'react'
import type { HistoricalStrategyLeg, HistoricalUnderlyingBar, PnLInput } from '@/engine/bsm'
import type {
  WorkerRequest,
  WorkerResponse,
  PnLResponse,
  GreeksResponse,
  CopResponse,
  HeatmapResponse,
  HistoricalStrategyResponse,
} from '@/types/worker'

// ──────── Module-level singleton ────────

type PendingEntry = { resolve: (v: unknown) => void; reject: (r: unknown) => void }
type DebounceEntry = {
  timer: ReturnType<typeof setTimeout>
  reject: (reason?: unknown) => void
}

let _worker: Worker | null = null
let _refCount = 0
let _computingCount = 0
const _pending = new Map<string, PendingEntry>()
const _computingListeners = new Set<(computing: boolean) => void>()

function notifyComputing(computing: boolean) {
  _computingListeners.forEach((fn) => fn(computing))
}

function acquireWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(new URL('@/workers/compute.worker.ts', import.meta.url), {
      type: 'module',
    })

    _worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const entry = _pending.get(e.data.requestId)
      if (!entry) return
      _pending.delete(e.data.requestId)
      entry.resolve(e.data.payload)
      _computingCount = Math.max(0, _computingCount - 1)
      if (_computingCount === 0) notifyComputing(false)
    }

    _worker.onerror = () => {
      for (const { reject } of _pending.values()) reject(new Error('Worker error'))
      _pending.clear()
      _computingCount = 0
      notifyComputing(false)
    }
  }

  _refCount++
  return _worker
}

function releaseWorker() {
  _refCount = Math.max(0, _refCount - 1)
  if (_refCount === 0) {
    _worker?.terminate()
    _worker = null
    _pending.clear()
    _computingCount = 0
  }
}

function dispatch<T>(request: WorkerRequest): Promise<T> {
  if (!_worker) return Promise.reject(new Error('Worker not initialized'))
  return new Promise<T>((resolve, reject) => {
    _pending.set(request.requestId, { resolve: resolve as (v: unknown) => void, reject })
    _computingCount++
    notifyComputing(true)
    _worker!.postMessage(request)
  })
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

// ──────── Hook ────────

export function useComputeWorker() {
  const [isComputing, setIsComputing] = useState(false)
  const debounceTimers = useRef(new Map<WorkerRequest['type'], DebounceEntry>())

  useEffect(() => {
    acquireWorker()
    _computingListeners.add(setIsComputing)
    return () => {
      _computingListeners.delete(setIsComputing)
      releaseWorker()
    }
  }, [])

  const postDebounced = useCallback(<T>(request: WorkerRequest): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const existing = debounceTimers.current.get(request.type)
      if (existing) {
        clearTimeout(existing.timer)
        existing.reject(new Error('Worker request superseded'))
      }
      debounceTimers.current.set(
        request.type,
        {
          timer: setTimeout(() => {
            debounceTimers.current.delete(request.type)
            dispatch<T>(request).then(resolve, reject)
          }, 16),
          reject,
        },
      )
    })
  }, [])

  const calcPnL = useCallback(
    (input: PnLInput, priceRange: [number, number], steps?: number) =>
      postDebounced<PnLResponse['payload']>({
        type: 'CALC_PNL',
        requestId: genId(),
        payload: { input, priceRange, steps },
      }),
    [postDebounced],
  )

  const calcGreeks = useCallback(
    (legs: PnLInput['legs'], S: number, r: number, q: number) =>
      postDebounced<GreeksResponse['payload']>({
        type: 'CALC_GREEKS',
        requestId: genId(),
        payload: { legs, S, r, q },
      }),
    [postDebounced],
  )

  const calcCop = useCallback(
    (input: PnLInput, priceRange: [number, number], steps?: number) =>
      postDebounced<CopResponse['payload']>({
        type: 'CALC_COP',
        requestId: genId(),
        payload: { input, priceRange, steps },
      }),
    [postDebounced],
  )

  const calcHeatmap = useCallback(
    (input: PnLInput, priceRange: [number, number], dates: string[], priceSteps?: number) =>
      postDebounced<HeatmapResponse['payload']>({
        type: 'CALC_HEATMAP',
        requestId: genId(),
        payload: { input, priceRange, dates, priceSteps },
      }),
    [postDebounced],
  )

  const calcHistoricalStrategy = useCallback(
    (legs: HistoricalStrategyLeg[], bars: HistoricalUnderlyingBar[], r: number, q: number) =>
      postDebounced<HistoricalStrategyResponse['payload']>({
        type: 'CALC_HISTORICAL_STRATEGY',
        requestId: genId(),
        payload: { legs, bars, r, q },
      }),
    [postDebounced],
  )

  return { calcPnL, calcGreeks, calcCop, calcHeatmap, calcHistoricalStrategy, isComputing }
}
