import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useAppRoute } from '../hooks/useAppRoute'
import { useComputeWorker } from '../hooks/useComputeWorker'
import { useRealtimeQuotes } from '../hooks/useRealtimeQuotes'
import { calcBSM } from '../engine/bsm'
import type { HeatmapData, PnLInput, PnLPoint } from '../engine/bsm'
import type { Greeks, Leg, OptionContract } from '../types'

import { TopBar } from '../components/TopBar/TopBar'
import { ExpirationTimeline } from '../components/ExpirationTimeline/ExpirationTimeline'
import { StrikesVisualizer } from '../components/StrikesVisualizer/StrikesVisualizer'
import { StatsBar } from '../components/StatsBar/StatsBar'
import { PnlChart } from '../components/PnlChart/PnlChart'
import { HeatTable } from '../components/HeatTable/HeatTable'
import { BottomControls } from '../components/BottomControls/BottomControls'
import { StrategyModal } from '../components/StrategyModal/StrategyModal'
import { SavedTradesPage } from '../components/SavedTrades/SavedTradesPage'
import type { ColDef } from '../components/HeatTable/HeatTable'

// ── Toast ─────────────────────────────────────────────────────────────────────

const MAX_REALTIME_OPTION_CODES = 399

// Pre-compute P&L at a wide range so RANGE slider changes are instant (no worker round-trip).
// The slider only clips the visible portion from this pre-computed curve.
const COMPUTE_RANGE_PCT = 52
const COMPUTE_STEPS = 500
const HEAT_PRICE_POINTS = 21
const HEAT_DATE_POINTS = 20

interface ToastMessage {
  id: number
  text: string
  type: 'info' | 'success' | 'error'
}

function Toast({ messages }: { messages: ToastMessage[] }) {
  if (messages.length === 0) return null
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      {messages.map((m) => (
        <div
          key={m.id}
          style={{
            padding: '8px 16px',
            borderRadius: 'var(--r8)',
            fontSize: 13,
            fontFamily: 'var(--sans)',
            fontWeight: 500,
            color: '#fff',
            background:
              m.type === 'error'
                ? 'var(--red-t, #ef4444)'
                : m.type === 'success'
                  ? 'var(--green-t, #22c55e)'
                  : 'var(--surface3, #1e293b)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
            whiteSpace: 'nowrap',
          }}
        >
          {m.text}
        </div>
      ))}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPriceRange(stockPrice: number, rangePercent: number): [number, number] {
  return [
    parseFloat((stockPrice * (1 - rangePercent / 100)).toFixed(2)),
    parseFloat((stockPrice * (1 + rangePercent / 100)).toFixed(2)),
  ]
}

function buildStatsRange(stockPrice: number): [number, number] {
  return [
    parseFloat(Math.max(1, stockPrice * 0.01).toFixed(2)),
    parseFloat((stockPrice * 3).toFixed(2)),
  ]
}

function buildPrices(stockPrice: number, rangePercent: number, steps = 16): number[] {
  const [lo, hi] = buildPriceRange(stockPrice, rangePercent)
  return Array.from({ length: steps }, (_, i) =>
    parseFloat((lo + ((hi - lo) / (steps - 1)) * i).toFixed(2)),
  )
}

function buildHeatPrices(stockPrice: number, rangePercent: number): number[] {
  return buildPrices(stockPrice, rangePercent, HEAT_PRICE_POINTS).reverse()
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function buildHeatCols(selectedExpiry: string | null): ColDef[] {
  if (!selectedExpiry) return []
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)
  const expiry = new Date(`${selectedExpiry}T00:00:00Z`)
  const totalMs = Math.max(1, expiry.getTime() - today.getTime())
  const candidates: Date[] = []
  for (let time = today.getTime(); time <= expiry.getTime(); time += 86_400_000) {
    const date = new Date(time)
    const day = date.getUTCDay()
    if ((day !== 0 && day !== 6) || time === expiry.getTime()) candidates.push(date)
  }
  if (!candidates.length) candidates.push(expiry)
  const count = Math.min(HEAT_DATE_POINTS, candidates.length)
  const selected = Array.from({ length: count }, (_, index) =>
    candidates[Math.round(index * (candidates.length - 1) / Math.max(1, count - 1))],
  )
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const weekdays = ['S','M','T','W','Th','F','S']
  return selected.map((date) => ({
    frac: Math.min(1, Math.max(0, (date.getTime() - today.getTime()) / totalMs)),
    date: isoDate(date),
    monthLabel: `${months[date.getUTCMonth()]}${date.getUTCFullYear() !== today.getUTCFullYear() ? ` '${String(date.getUTCFullYear()).slice(2)}` : ''}`,
    dayLabel: String(date.getUTCDate()),
    weekday: weekdays[date.getUTCDay()],
    isEarnings: false,
  }))
}

function emptyHeatmap(): HeatmapData {
  return { pnl: [], contractValue: [], delta: [], theta: [], gamma: [], vega: [], rho: [] }
}

function legsToInput(
  legs: Leg[],
  stockPrice: number,
  riskFreeRate: number,
  dividendYield: number,
  ivMultiplier: number,
  commission: number,
  dateProgress: number,
  selectedExpiry: string | null,
): PnLInput {
  const today = new Date().toISOString().slice(0, 10)
  let targetDate: string | undefined
  if (selectedExpiry && dateProgress > 0) {
    const t0 = new Date(today).getTime()
    const t1 = new Date(selectedExpiry + 'T00:00:00').getTime()
    targetDate = new Date(t0 + (t1 - t0) * dateProgress).toISOString().slice(0, 10)
  }
  return {
    legs: legs
      .filter((l) => !l.excluded)
      .map((l) => ({
        strike: l.strike,
        premium: l.costBasis,
        quantity: l.quantity,
        lotSize: l.lotSize,
        isCall: l.optionType === 'call',
        isLong: l.direction === 'long',
        expiry: l.expiry,
        iv: l.iv * ivMultiplier,
      })),
    S: stockPrice,
    r: riskFreeRate,
    q: dividendYield,
    commission,
    targetDate,
  }
}

function payoffAt(price: number, legs: PnLInput['legs'], commission: number): number {
  return legs.reduce((sum, leg) => {
    const intrinsic = leg.isCall ? Math.max(price - leg.strike, 0) : Math.max(leg.strike - price, 0)
    const direction = leg.isLong ? 1 : -1
    return sum + direction * (intrinsic - leg.premium) * leg.quantity * leg.lotSize - commission * leg.quantity
  }, 0)
}

function calcAnalyticalBreakevens(legs: PnLInput['legs'], commission: number): number[] {
  if (legs.length === 0) return []
  const strikes = [...new Set(legs.map((l) => l.strike))].sort((a, b) => a - b)
  const boundedPoints = [0, ...strikes]
  const breakevens: number[] = []

  for (let i = 0; i < boundedPoints.length - 1; i++) {
    const p0 = boundedPoints[i]
    const p1 = boundedPoints[i + 1]
    const y0 = payoffAt(p0, legs, commission)
    const y1 = payoffAt(p1, legs, commission)
    if (y0 === 0 && p0 > 0) {
      breakevens.push(parseFloat(p0.toFixed(2)))
      continue
    }
    if (y0 * y1 < 0) {
      const x = p0 - y0 * (p1 - p0) / (y1 - y0)
      if (x > 0) breakevens.push(parseFloat(x.toFixed(2)))
    }
  }

  const lastStrike = strikes[strikes.length - 1]
  const yLast = payoffAt(lastStrike, legs, commission)
  if (yLast === 0 && !breakevens.includes(parseFloat(lastStrike.toFixed(2)))) {
    breakevens.push(parseFloat(lastStrike.toFixed(2)))
  }

  const highSlope = legs.reduce((sum, leg) => {
    if (!leg.isCall) return sum
    return sum + (leg.isLong ? 1 : -1) * leg.quantity * leg.lotSize
  }, 0)
  if (highSlope !== 0 && yLast !== 0 && yLast * highSlope < 0) {
    const x = lastStrike - yLast / highSlope
    if (x > lastStrike) breakevens.push(parseFloat(x.toFixed(2)))
  }

  return breakevens.sort((a, b) => a - b)
}

function estimateExpiryStats(input: PnLInput): Pick<NonNullable<ReturnType<typeof useAppStore.getState>['computedStats']>, 'maxLoss' | 'maxProfit' | 'breakevens'> {
  const highSlope = input.legs.reduce((sum, leg) => {
    if (!leg.isCall) return sum
    return sum + (leg.isLong ? 1 : -1) * leg.quantity * leg.lotSize
  }, 0)
  const testPrices = [0, ...input.legs.map((leg) => leg.strike)]
  const payoffs = testPrices.map((price) => payoffAt(price, input.legs, input.commission))
  const finiteMin = Math.min(...payoffs)
  const finiteMax = Math.max(...payoffs)

  return {
    maxLoss: highSlope < 0 ? Number.POSITIVE_INFINITY : Math.max(0, Math.abs(Math.min(0, finiteMin))),
    maxProfit: highSlope > 0 ? Number.POSITIVE_INFINITY : Math.max(0, finiteMax),
    breakevens: calcAnalyticalBreakevens(input.legs, input.commission),
  }
}

const MIN_T = 1 / (365.25 * 24)

function computeUnrealizedPnl(
  legs: Leg[],
  stockPrice: number,
  optionChain: Map<string, OptionContract[]>,
  r: number,
  q: number,
  ivMultiplier: number,
  commission: number,
): number {
  const today = new Date().toISOString().slice(0, 10)
  let pnl = 0
  for (const leg of legs) {
    if (leg.excluded) continue
    const contracts = optionChain.get(leg.expiry) ?? []
    const contract = contracts.find(
      (c) => c.optionType === leg.optionType && Math.abs(c.strike - leg.strike) < 0.001,
    )
    let currentPrice: number
    if (contract && contract.bid > 0 && contract.ask > 0) {
      currentPrice = (contract.bid + contract.ask) / 2
    } else if (contract && contract.last > 0) {
      currentPrice = contract.last
    } else {
      const T = Math.max((new Date(leg.expiry).getTime() - new Date(today).getTime()) / (365.25 * 86400_000), MIN_T)
      currentPrice = calcBSM({
        S: stockPrice, K: leg.strike, T, r, q,
        sigma: leg.iv * ivMultiplier, isCall: leg.optionType === 'call',
      }).price
    }
    const direction = leg.direction === 'long' ? 1 : -1
    pnl += direction * (currentPrice - leg.costBasis) * leg.quantity * leg.lotSize
         - commission * leg.quantity
  }
  return parseFloat(pnl.toFixed(2))
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const {
    ticker, stockPrice, dividendYield, riskFreeRate, baseIV,
    legs, selectedExpiry, optionChain,
    appPage, currentSavedTradeId, savedTrades,
    activeStrategyKey,
    viewMode, displayMode, rangePercent, dateProgress, showProbDist,
    ivMultiplier, commissionPerContract,
    computedStats,
    updateComputedStats, setAppPage, reconcileLegStrikes, loadSavedTrades, loadSavedTrade,
    loadStrategyFromRoute,
  } = useAppStore()

  const { calcPnL, calcGreeks, calcCop, calcHeatmap } = useComputeWorker()

  const savedTradesChainKey = useAppStore((s) => [...s.savedTradesChain.keys()].sort().join('|'))

  const realtimeCodes = useMemo(() => {
    void savedTradesChainKey
    const codes = new Set<string>()
    if (appPage === 'build') {
      if (ticker) codes.add(`US.${ticker}`)
      if (selectedExpiry) {
        for (const contract of (optionChain.get(selectedExpiry) ?? [])) {
          if (codes.size >= MAX_REALTIME_OPTION_CODES) break
          codes.add(contract.symbol)
        }
      }
    } else if (appPage === 'saved') {
      for (const trade of savedTrades) {
        if (trade.status !== 'active') continue
        codes.add(`US.${trade.ticker}`)
      }
      const chain = useAppStore.getState().savedTradesChain
      for (const contracts of chain.values()) {
        for (const c of contracts) {
          if (codes.size >= MAX_REALTIME_OPTION_CODES) break
          codes.add(c.symbol)
        }
      }
    }
    return [...codes]
  }, [appPage, ticker, optionChain, selectedExpiry, savedTrades, savedTradesChainKey])
  const realtime = useRealtimeQuotes(realtimeCodes)

  const [strategyModalOpen, setStrategyModalOpen] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  // Full-range P&L data (pre-computed at ±COMPUTE_RANGE_PCT for smooth RANGE slider)
  const [fullPnlPoints, setFullPnlPoints] = useState<number[]>([])
  const [fullExpiryPnlPoints, setFullExpiryPnlPoints] = useState<number[]>([])
  const fullPricesRef = useRef<number[]>([])
  const [heatData, setHeatData] = useState<HeatmapData>(emptyHeatmap)
  const [renderedHeatRange, setRenderedHeatRange] = useState(rangePercent)

  useAppRoute({
    appPage,
    currentSavedTradeId,
    activeStrategyKey,
    ticker,
    savedTrades,
    setAppPage,
    loadSavedTrade,
    loadStrategyFromRoute,
  })

  const pushToast = useCallback((text: string, type: ToastMessage['type'] = 'info') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, text, type }])
    setTimeout(() => setToasts((prev) => prev.filter((m) => m.id !== id)), 3000)
  }, [])

  // ── Initialization on mount ──────────────────────────────────────────────────
  useEffect(() => {
    loadSavedTrades().catch(() => pushToast('Failed to load saved trades', 'error'))
  }, [loadSavedTrades, pushToast])

  useEffect(() => {
    const onResize = () => { useAppStore.setState({}) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    reconcileLegStrikes()
  }, [legs, optionChain, reconcileLegStrikes])

  // ── Compute on change ────────────────────────────────────────────────────────
  // P&L is computed at a WIDE range (±COMPUTE_RANGE_PCT) so the RANGE slider can
  // clip the visible portion instantly without re-calling the Web Worker.
  // NOTE: rangePercent is NOT a dependency — changing it only clips the view.
  // NOTE: optionChain is NOT in the dependency array to avoid recomputing the
  // entire chart on every WebSocket tick.
  useEffect(() => {
    if (!stockPrice || legs.length === 0) {
      queueMicrotask(() => {
        updateComputedStats(null)
        setFullPnlPoints([])
        setFullExpiryPnlPoints([])
        fullPricesRef.current = []
        setHeatData(emptyHeatmap())
      })
      return
    }

    const wideRange = buildPriceRange(stockPrice, COMPUTE_RANGE_PCT)
    const statsRange = buildStatsRange(stockPrice)
    const input = legsToInput(
      legs,
      stockPrice,
      riskFreeRate,
      dividendYield,
      ivMultiplier,
      commissionPerContract,
      dateProgress,
      selectedExpiry,
    )

    // Pre-compute full P&L curve at wide range
    fullPricesRef.current = buildPrices(stockPrice, COMPUTE_RANGE_PCT, COMPUTE_STEPS)
    const curvesPromise = calcPnL(input, wideRange, COMPUTE_STEPS)

    curvesPromise.then(({ pnl, expiryPnl }) => {
      setFullPnlPoints(pnl.map((p) => p.pnl))
      setFullExpiryPnlPoints(expiryPnl.map((p) => p.pnl))
    }).catch(() => { /* worker not ready */ })

    const activeLegInputs = input.legs
    const currentChain = useAppStore.getState().optionChain
    const unrealized = computeUnrealizedPnl(legs, stockPrice, currentChain, riskFreeRate, dividendYield, ivMultiplier, commissionPerContract)
    if (activeLegInputs.length > 0) {
      const netDebit = activeLegInputs.reduce(
        (sum: number, l: PnLInput['legs'][number]) => sum + (l.isLong ? 1 : -1) * l.premium * l.quantity * l.lotSize,
        0,
      )
      const expiryStats = estimateExpiryStats(input)
      const prev = useAppStore.getState().computedStats
      updateComputedStats({
        netDebit,
        maxLoss: expiryStats.maxLoss,
        maxProfit: expiryStats.maxProfit,
        cop: prev?.cop ?? 0,
        breakevens: expiryStats.breakevens,
        unrealizedPnl: unrealized,
        netGreeks: prev?.netGreeks ?? { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0, iv: 0 },
      })
      Promise.all([
        calcGreeks(activeLegInputs, stockPrice, riskFreeRate, dividendYield),
        calcCop(input, statsRange),
        curvesPromise,
      ]).then(([greeks, cop]: [Greeks, number, { pnl: PnLPoint[]; expiryPnl: PnLPoint[] }]) => {
        updateComputedStats({
          netDebit,
          maxLoss: expiryStats.maxLoss,
          maxProfit: expiryStats.maxProfit,
          cop,
          breakevens: expiryStats.breakevens,
          unrealizedPnl: unrealized,
          netGreeks: greeks,
        })
      }).catch(() => { /* worker not ready */ })
    }

  }, [
    legs, stockPrice, riskFreeRate, dateProgress,
    dividendYield, ivMultiplier, commissionPerContract,
    selectedExpiry,
    calcPnL, calcGreeks, calcCop, updateComputedStats,
  ])

  useEffect(() => {
    if (!selectedExpiry || !stockPrice || legs.length === 0) return
    const input = legsToInput(
      legs, stockPrice, riskFreeRate, dividendYield, ivMultiplier,
      commissionPerContract, dateProgress, selectedExpiry,
    )
    const cols = buildHeatCols(selectedExpiry)
    let cancelled = false
    calcHeatmap(input, buildPriceRange(stockPrice, rangePercent), cols.map((col) => col.date), HEAT_PRICE_POINTS)
      .then((result) => {
        if (cancelled) return
        setHeatData(result)
        setRenderedHeatRange(rangePercent)
      })
      .catch(() => { /* worker not ready */ })
    return () => { cancelled = true }
  }, [
    selectedExpiry, stockPrice, legs, riskFreeRate, dividendYield,
    ivMultiplier, commissionPerContract, dateProgress, rangePercent, calcHeatmap,
  ])

  // ── Lightweight unrealized PnL update on optionChain changes ────────────────
  // This runs when real-time quotes update the chain (bid/ask) but does NOT
  // trigger heavy worker recalculations.
  useEffect(() => {
    if (!stockPrice || legs.length === 0) return
    const unrealized = computeUnrealizedPnl(legs, stockPrice, optionChain, riskFreeRate, dividendYield, ivMultiplier, commissionPerContract)
    const prev = useAppStore.getState().computedStats
    if (prev && Math.abs(prev.unrealizedPnl - unrealized) > 0.005) {
      updateComputedStats({ ...prev, unrealizedPnl: unrealized })
    }
  }, [optionChain, stockPrice, legs, riskFreeRate, dividendYield, ivMultiplier, commissionPerContract, updateComputedStats])

  // ── Derived values ───────────────────────────────────────────────────────────
  // Clip full-range P&L data to the visible RANGE slider value (instant, no worker)
  const { prices, pnlPoints, expiryPnlPoints } = useMemo(() => {
    const fp = fullPricesRef.current
    if (fp.length === 0 || fullPnlPoints.length === 0 || fullExpiryPnlPoints.length === 0) {
      return { prices: buildPrices(stockPrice, rangePercent, 200), pnlPoints: [] as number[], expiryPnlPoints: [] as number[] }
    }
    const [lo, hi] = buildPriceRange(stockPrice, rangePercent)
    // Binary-search-like find of start/end indices
    let startIdx = 0
    let endIdx = fp.length - 1
    for (let i = 0; i < fp.length; i++) {
      if (fp[i] >= lo) { startIdx = i; break }
    }
    for (let i = fp.length - 1; i >= 0; i--) {
      if (fp[i] <= hi) { endIdx = i; break }
    }
    if (startIdx >= endIdx) {
      return { prices: buildPrices(stockPrice, rangePercent, 200), pnlPoints: [] as number[], expiryPnlPoints: [] as number[] }
    }
    return {
      prices: fp.slice(startIdx, endIdx + 1),
      pnlPoints: fullPnlPoints.slice(startIdx, endIdx + 1),
      expiryPnlPoints: fullExpiryPnlPoints.slice(startIdx, endIdx + 1),
    }
  }, [fullPnlPoints, fullExpiryPnlPoints, stockPrice, rangePercent])

  const heatPrices = buildHeatPrices(stockPrice, renderedHeatRange)
  const heatCols = buildHeatCols(selectedExpiry)
  const selectedDateDte = useMemo(() => {
    if (!selectedExpiry) return 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const expiry = new Date(selectedExpiry + 'T00:00:00')
    const totalDays = Math.max(0, Math.round((expiry.getTime() - today.getTime()) / 86_400_000))
    return Math.max(0, Math.round(totalDays * dateProgress))
  }, [selectedExpiry, dateProgress])
  const probDistParams = useMemo(() => {
    if (stockPrice <= 0) return undefined
    const T = Math.max(selectedDateDte / 365.25, 0.001)
    const sigma = Math.max(baseIV * ivMultiplier, 0.0001)
    return {
      mu: Math.log(stockPrice) + (riskFreeRate - dividendYield - 0.5 * sigma ** 2) * T,
      sigma: sigma * Math.sqrt(T),
    }
  }, [stockPrice, selectedDateDte, baseIV, ivMultiplier, riskFreeRate, dividendYield])

  const longCostBasis = legs
    .filter((l) => !l.excluded && l.direction === 'long')
    .reduce((s: number, l: Leg) => s + l.costBasis * l.quantity * l.lotSize, 0)
  const costBasis = Math.abs(computedStats?.netDebit ?? longCostBasis)
  const maxLoss = (computedStats?.maxLoss ?? 0) > 0 ? (computedStats?.maxLoss ?? 0) : (Math.abs(costBasis) || 1)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg)',
        fontFamily: 'var(--sans)',
      }}
    >
      {/* 1. TopBar — flex-shrink:0, 50px */}
      <TopBar
        activePage={appPage}
        onPageChange={setAppPage}
        onOpenStrategyModal={() => setStrategyModalOpen(true)}
        onToast={pushToast}
        liveConnected={realtime.connected}
        liveLatency={realtime.latency}
      />

      {appPage === 'build' ? (
        <>
          {/* 2. ExpirationTimeline — flex-shrink:0, auto height */}
          <div style={{ flexShrink: 0 }}>
            <ExpirationTimeline />
          </div>

          {/* 3. StrikesVisualizer — flex-shrink:0, 156px */}
          <div style={{ flexShrink: 0, height: 156, overflow: 'hidden' }}>
            <StrikesVisualizer />
          </div>

          {/* 4. StatsBar — flex-shrink:0, horizontal scroll */}
          <div style={{ flexShrink: 0, overflowX: 'auto', overflowY: 'hidden' }}>
            <StatsBar />
          </div>

          {/* 5. ViewArea — flex:1, min-height for chart proportion */}
          <div style={{ flex: 1, minHeight: 340, overflow: 'hidden', position: 'relative', background: '#eef3ff' }}>
            {viewMode === 'chart' && (
              <PnlChart
                prices={prices}
                pnl={pnlPoints}
                expiryPnl={expiryPnlPoints}
                ticker={ticker}
                stockPrice={stockPrice}
                displayMode={displayMode}
                costBasis={costBasis}
                maxLoss={maxLoss}
                breakevens={computedStats?.breakevens ?? []}
                daysToExpiry={selectedDateDte}
                isAtExpiration={dateProgress >= 0.99}
                showProbDist={showProbDist}
                probDistParams={probDistParams}
              />
            )}
            {viewMode === 'table' && (
              <HeatTable
                prices={heatPrices}
                cols={heatCols}
                data={heatData}
                stockPrice={stockPrice}
                displayMode={displayMode}
                costBasis={costBasis}
                maxLoss={maxLoss}
              />
            )}
          </div>

          {/* 6. BottomControls — flex-shrink:0, auto height */}
          <div style={{ flexShrink: 0 }}>
            <BottomControls />
          </div>
        </>
      ) : (
        <SavedTradesPage onToast={pushToast} />
      )}

      {/* 7. StrategyModal — fixed, full-screen overlay */}
      <StrategyModal
        open={strategyModalOpen}
        onClose={() => setStrategyModalOpen(false)}
      />

      {/* 8. Toast — fixed, bottom center */}
      <Toast messages={toasts} />
    </div>
  )
}
