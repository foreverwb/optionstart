import { describe, expect, it } from 'vitest'
import { calcHistoricalStrategy } from '../../engine/bsm'
import {
  aggregateActualStrategyBars,
  fallbackOptionCode,
  resolveHistoryLegs,
  strategyHistoryLabel,
} from '../../components/HistoricalPrice/historicalPriceData'
import type { HistoricalPriceSeries, Leg } from '../../types'

function makeLeg(overrides: Partial<Leg> = {}): Leg {
  return {
    id: 'leg-1', optionType: 'call', direction: 'long', quantity: 1,
    strike: 220, expiry: '2026-09-11', costBasis: 20, iv: 1.1,
    lotSize: 100, excluded: false, ...overrides,
  }
}

describe('historical price data', () => {
  it('builds Futu option codes and official-style strategy labels', () => {
    const leg = makeLeg()
    expect(fallbackOptionCode('BE', leg)).toBe('US.BE260911C220000')
    const resolved = resolveHistoryLegs('BE', [leg], new Map())
    expect(strategyHistoryLabel(resolved)).toBe('Strategy (BE260911 220C)')
  })

  it('aggregates long and short option OHLC bars directionally', () => {
    const long = makeLeg()
    const short = makeLeg({ id: 'leg-2', direction: 'short', quantity: 2, strike: 260 })
    const resolved = resolveHistoryLegs('BE', [long, short], new Map())
    const timestamp = '2026-08-07T13:30:00Z'
    const series: HistoricalPriceSeries[] = resolved.map(({ code }, index) => ({
      code,
      interval: 'K_DAY',
      bars: [{
        timestamp, volume: 10,
        open: index === 0 ? 30 : 8,
        high: index === 0 ? 34 : 10,
        low: index === 0 ? 28 : 7,
        close: index === 0 ? 32 : 9,
      }],
    }))

    const [bar] = aggregateActualStrategyBars(resolved, series)
    expect(bar.open).toBe(14)
    expect(bar.close).toBe(14)
    expect(bar.high).toBe(20)
    expect(bar.low).toBe(8)
  })

  it('reprices short-period strategy candles from underlying bars', () => {
    const [bar] = calcHistoricalStrategy(
      [{ strike: 220, quantity: 1, isCall: true, isLong: true, expiry: '2026-09-11', iv: 1.1 }],
      [{ timestamp: '2026-08-07T13:30:00Z', open: 215, high: 225, low: 210, close: 220, volume: 100 }],
      0.045,
      0,
    )

    expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close))
    expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close))
    expect(bar.close).toBeGreaterThan(bar.open)
  })
})
