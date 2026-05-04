import type { OptionLeg } from '@/types'

export const mockLegs: OptionLeg[] = [
  {
    id: 'mock-leg-1',
    symbol: 'AAPL',
    expiry: '2026-06-20',
    strike: 200,
    optionType: 'call',
    side: 'long',
    quantity: 1,
    premium: 5.5,
    lotSize: 100,
  },
  {
    id: 'mock-leg-2',
    symbol: 'AAPL',
    expiry: '2026-06-20',
    strike: 210,
    optionType: 'call',
    side: 'short',
    quantity: 1,
    premium: 2.8,
    lotSize: 100,
  },
]

export const mockUnderlyingPrice = 202.5
