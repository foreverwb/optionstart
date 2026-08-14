import { describe, expect, it } from 'vitest'
import { calcHeatmap } from '../../../engine/bsm'
import type { PnLInput } from '../../../engine/bsm'

function futureDate(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

describe('table heatmap', () => {
  it('returns aligned P&L, contract value, and Greek matrices', () => {
    const expiry = futureDate(30)
    const input: PnLInput = {
      S: 100,
      r: 0.045,
      q: 0,
      commission: 0,
      legs: [
        { strike: 100, premium: 5, quantity: 1, lotSize: 100, isCall: true, isLong: true, expiry, iv: 0.25 },
      ],
    }

    const result = calcHeatmap(input, [90, 110], [futureDate(0), expiry], 21)

    expect(result.pnl).toHaveLength(2)
    expect(result.pnl[0]).toHaveLength(21)
    expect(result.contractValue[0]).toHaveLength(21)
    expect(result.delta[0]).toHaveLength(21)
    expect(result.pnl[0][10]).toBeCloseTo((result.contractValue[0][10] - 5) * 100, 2)
  })

  it('uses intrinsic value in the expiration column', () => {
    const expiry = futureDate(30)
    const input: PnLInput = {
      S: 100,
      r: 0.045,
      q: 0,
      commission: 0,
      legs: [
        { strike: 100, premium: 5, quantity: 1, lotSize: 100, isCall: true, isLong: true, expiry, iv: 0.25 },
      ],
    }

    const result = calcHeatmap(input, [90, 110], [expiry], 21)

    expect(result.contractValue[0][0]).toBe(0)
    expect(result.pnl[0][0]).toBe(-500)
    expect(result.contractValue[0][20]).toBe(10)
    expect(result.pnl[0][20]).toBe(500)
    expect(result.gamma[0][10]).toBe(0)
  })
})
