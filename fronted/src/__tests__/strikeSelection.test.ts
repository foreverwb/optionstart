import { describe, expect, it } from 'vitest'
import { formatStrike } from '../../components/StrikesVisualizer/formatStrike'
import { nearestValidStrike, reconcileLegStrikesWithChain } from '../../store/useAppStore'
import type { Leg, OptionContract, OptionType } from '../../types'

function contract(strike: number, optionType: OptionType): OptionContract {
  return {
    symbol: `NVDA-${strike}-${optionType}`,
    strike,
    optionType,
    expiry: '2026-05-22',
    iv: 0.72,
    lotSize: 1,
    bid: 1,
    ask: 1.2,
    last: 1.1,
  }
}

describe('nearestValidStrike', () => {
  it('snaps target strike to a listed option-chain strike', () => {
    const chain = new Map<string, OptionContract[]>([
      ['2026-05-22', [202.5, 205, 207.5, 210, 212.5, 215, 217.5, 220, 222.5, 225].map((strike) => contract(strike, 'put'))],
    ])

    expect(nearestValidStrike(chain, '2026-05-22', 'put', 213)).toBe(212.5)
  })

  it('uses the requested option type and expiry only', () => {
    const chain = new Map<string, OptionContract[]>([
      ['2026-05-22', [contract(212.5, 'put'), contract(215, 'put'), contract(213, 'call')]],
      ['2026-05-29', [contract(213, 'put')]],
    ])

    expect(nearestValidStrike(chain, '2026-05-22', 'put', 213)).toBe(212.5)
  })

  it('returns null when no chain strikes are available', () => {
    const chain = new Map<string, OptionContract[]>()

    expect(nearestValidStrike(chain, '2026-05-22', 'put', 213)).toBeNull()
  })

  it('reconciles an existing invalid leg after the chain is loaded', () => {
    const chain = new Map<string, OptionContract[]>([
      ['2026-05-22', [202.5, 205, 207.5, 210, 212.5, 215, 217.5].map((strike) => contract(strike, 'call'))],
    ])
    const leg: Leg = {
      id: 'leg-1',
      optionType: 'call',
      direction: 'long',
      quantity: 1,
      strike: 213,
      expiry: '2026-05-22',
      costBasis: 0,
      iv: 0.3,
      lotSize: 1,
      excluded: false,
    }

    expect(reconcileLegStrikesWithChain([leg], chain)[0].strike).toBe(212.5)
  })

  it('renders fractional strikes without rounding to illegal integers', () => {
    expect(formatStrike(212.5)).toBe('212.5')
    expect(formatStrike(215)).toBe('215')
  })
})
