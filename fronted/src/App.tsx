import { useEffect, useMemo, useState, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useAppRoute } from '../hooks/useAppRoute'
import { useComputeWorker } from '../hooks/useComputeWorker'
import { useRealtimeQuotes } from '../hooks/useRealtimeQuotes'
import { calcBSM } from '../engine/bsm'
import type { PnLInput, PnLPoint } from '../engine/bsm'
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

function buildHeatCols(selectedExpiry: string | null): ColDef[] {
  if (!selectedExpiry) return []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(selectedExpiry + 'T00:00:00')
  const totalMs = expiry.getTime() - today.getTime()
  const STEPS = 9
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return Array.from({ length: STEPS }, (_, i) => {
    const frac = i / (STEPS - 1)
    const dt = new Date(today.getTime() + totalMs * frac)
    const label = i === 0 ? 'Today' : i === STEPS - 1 ? 'Expiry' : `${MONTHS[dt.getMonth()]} ${dt.getDate()}`
    return { frac, label, isEarnings: false }
  })
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

function closestPnl(points: PnLPoint[], stockPrice: number): number {
  if (points.length === 0) return 0
  return points.reduce((best, point) =>
    Math.abs(point.price - stockPrice) < Math.abs(best.price - stockPrice) ? point : best,
  ).pnl
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
    viewMode, displayMode, rangePercent, dateProgress, showProbDist,
    ivMultiplier, commissionPerContract,
    computedStats,
    updateComputedStats, setAppPage, reconcileLegStrikes, loadSavedTrades, loadSavedTrade,
  } = useAppStore()

  const { calcPnL, calcGreeks, calcCop, calcHeatmap } = useComputeWorker()

  const realtimeCodes = useMemo(() => {
    const codes: string[] = []
    if (ticker) codes.push(`US.${ticker}`)
    if (selectedExpiry) {
      const optionCodes = (optionChain.get(selectedExpiry) ?? []).map((contract) => contract.symbol)
      codes.push(...optionCodes.slice(0, MAX_REALTIME_OPTION_CODES))
    }
    return codes
  }, [ticker, optionChain, selectedExpiry])
  const realtime = useRealtimeQuotes(realtimeCodes)

  const [strategyModalOpen, setStrategyModalOpen] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [pnlPoints, setPnlPoints] = useState<number[]>([])
  const [expiryPnlPoints, setExpiryPnlPoints] = useState<number[]>([])
  const [heatMatrix, setHeatMatrix] = useState<number[][]>([])

  useAppRoute({
    appPage,
    currentSavedTradeId,
    savedTrades,
    setAppPage,
    loadSavedTrade,
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
  useEffect(() => {
    if (!stockPrice || legs.length === 0) {
      queueMicrotask(() => {
        updateComputedStats(null)
        setPnlPoints([])
        setExpiryPnlPoints([])
        setHeatMatrix([])
      })
      return
    }

    const chartRange = buildPriceRange(stockPrice, rangePercent)
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

    const curvesPromise = calcPnL(input, chartRange, 200)

    curvesPromise.then(({ pnl, expiryPnl }) => {
      setPnlPoints(pnl.map((p) => p.pnl))
      setExpiryPnlPoints(expiryPnl.map((p) => p.pnl))
    }).catch(() => { /* worker not ready */ })

    const activeLegInputs = input.legs
    if (activeLegInputs.length > 0) {
      Promise.all([
        calcGreeks(activeLegInputs, stockPrice, riskFreeRate, dividendYield),
        calcCop(input, statsRange),
        curvesPromise,
      ]).then(([greeks, cop, curves]: [Greeks, number, { pnl: PnLPoint[]; expiryPnl: PnLPoint[] }]) => {
        const netDebit = activeLegInputs.reduce(
          (sum: number, l: PnLInput['legs'][number]) => sum + (l.isLong ? 1 : -1) * l.premium * l.quantity * l.lotSize,
          0,
        )
        const expiryStats = estimateExpiryStats(input)
        updateComputedStats({
          netDebit,
          maxLoss: expiryStats.maxLoss,
          maxProfit: expiryStats.maxProfit,
          cop,
          breakevens: expiryStats.breakevens,
          unrealizedPnl: computeUnrealizedPnl(legs, stockPrice, optionChain, riskFreeRate, dividendYield, ivMultiplier, commissionPerContract),
          netGreeks: greeks,
        })
      }).catch(() => { /* worker not ready */ })
    }

    if (viewMode === 'table' && selectedExpiry) {
      const cols = buildHeatCols(selectedExpiry)
      const today = new Date().toISOString().slice(0, 10)
      const t0 = new Date(today).getTime()
      const t1 = new Date(selectedExpiry + 'T00:00:00').getTime()
      const dates = cols.map((c) =>
        new Date(t0 + (t1 - t0) * c.frac).toISOString().slice(0, 10),
      )
      calcHeatmap(input, chartRange, dates, 16).then((matrix: number[][]) => {
        setHeatMatrix(matrix)
      }).catch(() => { /* worker not ready */ })
    }
  }, [
    legs, stockPrice, riskFreeRate, rangePercent, dateProgress,
    dividendYield, ivMultiplier, commissionPerContract,
    selectedExpiry, viewMode, optionChain,
    calcPnL, calcGreeks, calcCop, calcHeatmap, updateComputedStats,
  ])

  // ── Derived values ───────────────────────────────────────────────────────────
  const prices = buildPrices(stockPrice, rangePercent, 200)
  const heatPrices = buildPrices(stockPrice, rangePercent, 16)
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

  const costBasis = legs
    .filter((l) => !l.excluded && l.direction === 'long')
    .reduce((s: number, l: Leg) => s + l.costBasis * l.quantity * l.lotSize, 0)
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

          {/* 5. ViewArea — flex:1, overflow:hidden */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#eef3ff' }}>
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
                matrix={heatMatrix}
                stockPrice={stockPrice}
                displayMode={displayMode}
                costBasis={costBasis}
                maxLoss={maxLoss}
                onColClick={(frac: number) => {
                  useAppStore.getState().setDateProgress(frac)
                  useAppStore.getState().setViewMode('chart')
                }}
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
