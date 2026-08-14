import { useEffect, useMemo, useState } from 'react'
import { useComputeWorker } from '@/hooks/useComputeWorker'
import { fetchPriceHistory } from '@/hooks/useApi'
import { useAppStore } from '@/store/useAppStore'
import type { HistoricalPriceBar, HistoryChartStyle, HistoryTimeframe } from '@/types'
import { HistoricalPriceChart } from './HistoricalPriceChart'
import { HistoricalPriceControls } from './HistoricalPriceControls'
import {
  aggregateActualStrategyBars,
  resolveHistoryLegs,
  shouldUseActualOptionHistory,
  strategyHistoryLabel,
} from './historicalPriceData'

interface HistoricalPriceModalProps {
  open: boolean
  onClose: () => void
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') return ''
  if (error instanceof Error) return error.message
  return 'Unable to load price history.'
}

export function HistoricalPriceModal({ open, onClose }: HistoricalPriceModalProps) {
  const ticker = useAppStore((state) => state.ticker)
  const legs = useAppStore((state) => state.legs)
  const optionChain = useAppStore((state) => state.optionChain)
  const riskFreeRate = useAppStore((state) => state.riskFreeRate)
  const dividendYield = useAppStore((state) => state.dividendYield)
  const { calcHistoricalStrategy } = useComputeWorker()
  const [timeframe, setTimeframe] = useState<HistoryTimeframe>('1w')
  const [chartStyle, setChartStyle] = useState<HistoryChartStyle>('candlestick')
  const [strategyBars, setStrategyBars] = useState<HistoricalPriceBar[]>([])
  const [underlyingBars, setUnderlyingBars] = useState<HistoricalPriceBar[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const resolvedLegs = useMemo(
    () => resolveHistoryLegs(ticker, legs, optionChain),
    [ticker, legs, optionChain],
  )
  const strategyLabel = useMemo(() => strategyHistoryLabel(resolvedLegs), [resolvedLegs])

  useEffect(() => {
    if (!open || !ticker) return
    const controller = new AbortController()
    let cancelled = false
    const underlyingCode = `US.${ticker.toUpperCase()}`
    const codes = [...new Set([underlyingCode, ...resolvedLegs.map((item) => item.code)])]

    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      setError('')
      return fetchPriceHistory(codes, timeframe, controller.signal)
    })
      .then(async (response) => {
        if (!response) return
        const underlying = response.series.find((item) => item.code === underlyingCode)?.bars ?? []
        let strategy: HistoricalPriceBar[] = []
        if (resolvedLegs.length > 0) {
          if (shouldUseActualOptionHistory(timeframe, resolvedLegs, response.series)) {
            strategy = aggregateActualStrategyBars(resolvedLegs, response.series)
          } else if (underlying.length > 0) {
            strategy = await calcHistoricalStrategy(
              resolvedLegs.map(({ leg }) => ({
                strike: leg.strike,
                quantity: leg.quantity,
                isCall: leg.optionType === 'call',
                isLong: leg.direction === 'long',
                expiry: leg.expiry,
                iv: leg.iv,
              })),
              underlying,
              riskFreeRate,
              dividendYield,
            )
          }
        }
        if (cancelled) return
        setUnderlyingBars(underlying)
        setStrategyBars(strategy)
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        const message = errorMessage(reason)
        if (message) setError(message)
        setUnderlyingBars([])
        setStrategyBars([])
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [
    open, ticker, timeframe, resolvedLegs, riskFreeRate, dividendYield,
    calcHistoricalStrategy,
  ])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(15,23,42,.32)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '5vh' }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Strategy Price History"
        style={{ width: 1000, height: 504, maxWidth: '96vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 7, background: '#f5f7fc', border: '1px solid #cbd5e1', boxShadow: '0 20px 70px rgba(15,23,42,.28)' }}
      >
        <header style={{ height: 53, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 15px', borderBottom: '1px solid #d8e0ec' }}>
          <h2 style={{ margin: 0, color: '#172033', fontSize: 24, fontWeight: 700 }}>Price History</h2>
          <button type="button" aria-label="Close price history" onClick={onClose} style={{ border: 0, background: 'transparent', color: '#64748b', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </header>

        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0, borderBottom: '1px solid #cbd5e1' }}>
            <HistoricalPriceChart bars={strategyBars} label={strategyLabel} timeframe={timeframe} chartStyle={chartStyle} showXAxis={false} />
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <HistoricalPriceChart bars={underlyingBars} label={`Underlying (${ticker})`} timeframe={timeframe} chartStyle={chartStyle} showXAxis />
          </div>
          {(loading || error) && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'grid', placeItems: 'center', background: 'rgba(245,247,252,.86)', color: error ? '#c6283e' : '#475569', fontSize: 14 }}>
              {error || 'Loading price history…'}
            </div>
          )}
        </div>

        <HistoricalPriceControls timeframe={timeframe} chartStyle={chartStyle} onTimeframeChange={setTimeframe} onChartStyleChange={setChartStyle} />
      </section>
    </div>
  )
}
