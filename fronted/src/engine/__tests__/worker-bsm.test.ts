import { describe, expect, it } from 'vitest'
import { calcCop } from '../../../engine/bsm'
import type { PnLInput } from '../../../engine/bsm'

function dateAfter(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

describe('worker calcCop', () => {
  it('does not depend on the visible chart range', () => {
    const expiry = dateAfter(14)
    const input: PnLInput = {
      S: 214,
      r: 0.045,
      q: 0,
      commission: 0,
      legs: [
        { strike: 210, premium: 5.46, quantity: 1, lotSize: 100, isCall: false, isLong: true, expiry, iv: 0.22 },
        { strike: 195, premium: 2, quantity: 3, lotSize: 100, isCall: false, isLong: false, expiry, iv: 0.24 },
      ],
    }

    const narrow = calcCop(input, [180, 230])
    const wide = calcCop(input, [1, 600])

    expect(narrow).toBeCloseTo(wide, 10)
  })
})
