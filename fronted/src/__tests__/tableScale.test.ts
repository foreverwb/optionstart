import { describe, expect, it } from 'vitest'
import { formatPriceLabel, formatPricePercent } from '../../components/HeatTable/heatTableFormat'
import { autoRangePercent, strategyImpliedVolatility } from '../../store/useAppStore'
import type { Leg } from '../../types'

function leg(iv: number, quantity: number, excluded = false): Leg {
  return {
    id: `${iv}-${quantity}`,
    optionType: 'call',
    direction: 'long',
    quantity,
    strike: 220,
    expiry: '2026-10-16',
    costBasis: 5,
    iv,
    lotSize: 100,
    excluded,
  }
}

describe('OptionStrat-compatible table scale', () => {
  it('uses the active strategy IV for the one-standard-deviation range', () => {
    const iv = strategyImpliedVolatility([
      leg(0.8, 1),
      leg(1.2, 2),
      leg(2, 10, true),
    ], 0.3)

    expect(iv).toBeCloseTo(1.0667, 4)
    expect(autoRangePercent(60, 1.02)).toBe(41.3)
  })

  it('formats the price ruler like OptionStrat', () => {
    expect(formatPriceLabel(320.2628)).toBe('$320')
    expect(formatPriceLabel(223.96)).toBe('$224')
    expect(formatPricePercent(320.2628, 223.96)).toBe('43%')
    expect(formatPricePercent(233.81, 223.96)).toBe('4.4%')
    expect(formatPricePercent(223.96, 223.96)).toBe('0%')
    expect(formatPricePercent(214.11, 223.96)).toBe('-4.4%')
  })
})
