import { calcBSM } from '@/engine/bsm'
import type { ExpiryDate, OptionContract, OptionType } from '@/types'

// ── Types exported for consumers ──

export interface TickerInfo {
  price: number
  q: number              // dividend yield
  iv: number             // base implied volatility (annualised)
  events: {
    earnings: string | null
    exdiv: string | null
  }
}

export interface StrategyTemplateLeg {
  type: OptionType
  direction: 'long' | 'short'
  strikeOffset: number   // % offset from ATM; e.g. +3 = strike at stockPrice×1.03
  quantity?: number
  expOffset?: number     // 0 = near expiry, 1 = far expiry (calendar / diagonal)
}

export type StrategyCategory = 'novice' | 'intermediate' | 'advanced' | 'custom'

export interface StrategyTemplate {
  name: string
  category: StrategyCategory
  description: string
  legs: StrategyTemplateLeg[]
}

// ── Mock ticker data (mirrors prototype S.TICKERS) ──

export const MOCK_TICKERS: Record<string, TickerInfo> = {
  QQQ:  { price: 473.50, q: 0.006, iv: 0.211, events: { earnings: 'May 15', exdiv: 'Jun 20' } },
  SPY:  { price: 528.20, q: 0.013, iv: 0.181, events: { earnings: null,      exdiv: 'Jun 21' } },
  AAPL: { price: 189.30, q: 0.005, iv: 0.245, events: { earnings: 'May 30',  exdiv: null     } },
  TSLA: { price: 172.80, q: 0,     iv: 0.521, events: { earnings: 'Jul 23',  exdiv: null     } },
  NVDA: { price: 885.40, q: 0.001, iv: 0.434, events: { earnings: 'May 28',  exdiv: null     } },
}

// Mock lot sizes — in production these come from Futu get_option_chain
const MOCK_LOT_SIZES: Record<string, number> = {
  QQQ: 100, SPY: 100, AAPL: 100, TSLA: 100, NVDA: 100,
}

// ── generateExpiries — exactly mirrors prototype genExpiries() ──

export function generateExpiries(): ExpiryDate[] {
  const months: Array<{ lbl: string; y: number; days: number[] }> = [
    { lbl: 'May', y: 2025, days: [4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 22, 29] },
    { lbl: 'Jun', y: 2025, days: [5, 12, 18, 30] },
    { lbl: 'Jul', y: 2025, days: [17, 31] },
    { lbl: 'Aug', y: 2025, days: [21] },
    { lbl: 'Sep', y: 2025, days: [18, 30] },
    { lbl: 'Oct', y: 2025, days: [16] },
    { lbl: 'Dec', y: 2025, days: [18, 31] },
  ]
  const monthIndex: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return months.flatMap((m) =>
    m.days.map((d) => {
      const mi = monthIndex[m.lbl]
      const dt = new Date(m.y, mi, d)
      const date = `${m.y}-${String(mi + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const daysToExpiry = Math.round((dt.getTime() - today.getTime()) / 86_400_000)
      return { date, daysToExpiry }
    }),
  )
}

// ── Strategy templates (24 strategies, matching prototype tiers) ──

export const STRATEGY_TEMPLATES: Record<string, StrategyTemplate> = {
  // ── Novice ─────────────────────────────────────────────────────────────────
  long_call: {
    name: 'Buy Call',
    category: 'novice',
    description: 'Bullish · Limited risk',
    legs: [{ type: 'call', direction: 'long', strikeOffset: +3 }],
  },
  long_put: {
    name: 'Buy Put',
    category: 'novice',
    description: 'Bearish · Limited risk',
    legs: [{ type: 'put', direction: 'long', strikeOffset: -3 }],
  },
  covered_call: {
    name: 'Covered Call',
    category: 'novice',
    description: 'Neutral-Bullish · Income',
    legs: [{ type: 'call', direction: 'short', strikeOffset: +5 }],
  },
  cash_put: {
    name: 'Cash-Secured Put',
    category: 'novice',
    description: 'Bullish · Income',
    legs: [{ type: 'put', direction: 'short', strikeOffset: -3 }],
  },
  protective_put: {
    name: 'Protective Put',
    category: 'novice',
    description: 'Hedge · Insurance',
    legs: [{ type: 'put', direction: 'long', strikeOffset: -5 }],
  },

  // ── Intermediate ────────────────────────────────────────────────────────────
  bull_call: {
    name: 'Bull Call Spread',
    category: 'intermediate',
    description: 'Bullish · Defined',
    legs: [
      { type: 'call', direction: 'long',  strikeOffset: -2 },
      { type: 'call', direction: 'short', strikeOffset: +3 },
    ],
  },
  bear_put: {
    name: 'Bear Put Spread',
    category: 'intermediate',
    description: 'Bearish · Defined',
    legs: [
      { type: 'put', direction: 'long',  strikeOffset: +2 },
      { type: 'put', direction: 'short', strikeOffset: -3 },
    ],
  },
  bull_put: {
    name: 'Bull Put Spread',
    category: 'intermediate',
    description: 'Bullish · Credit',
    legs: [
      { type: 'put', direction: 'long',  strikeOffset: -8 },
      { type: 'put', direction: 'short', strikeOffset: -3 },
    ],
  },
  bear_call: {
    name: 'Bear Call Spread',
    category: 'intermediate',
    description: 'Bearish · Credit',
    legs: [
      { type: 'call', direction: 'short', strikeOffset: +3 },
      { type: 'call', direction: 'long',  strikeOffset: +8 },
    ],
  },
  iron_condor: {
    name: 'Iron Condor',
    category: 'intermediate',
    description: 'Neutral · Range',
    legs: [
      { type: 'put',  direction: 'long',  strikeOffset: -8 },
      { type: 'put',  direction: 'short', strikeOffset: -3 },
      { type: 'call', direction: 'short', strikeOffset: +3 },
      { type: 'call', direction: 'long',  strikeOffset: +8 },
    ],
  },
  iron_butterfly: {
    name: 'Iron Butterfly',
    category: 'intermediate',
    description: 'Neutral · ATM',
    legs: [
      { type: 'put',  direction: 'long',  strikeOffset: -5 },
      { type: 'put',  direction: 'short', strikeOffset:  0 },
      { type: 'call', direction: 'short', strikeOffset:  0 },
      { type: 'call', direction: 'long',  strikeOffset: +5 },
    ],
  },
  straddle: {
    name: 'Long Straddle',
    category: 'intermediate',
    description: 'Volatile · Unlimited',
    legs: [
      { type: 'call', direction: 'long', strikeOffset: 0 },
      { type: 'put',  direction: 'long', strikeOffset: 0 },
    ],
  },
  strangle: {
    name: 'Long Strangle',
    category: 'intermediate',
    description: 'Volatile · Cheap',
    legs: [
      { type: 'call', direction: 'long', strikeOffset: +3 },
      { type: 'put',  direction: 'long', strikeOffset: -3 },
    ],
  },
  collar: {
    name: 'Collar',
    category: 'intermediate',
    description: 'Hedged · Income',
    legs: [
      { type: 'put',  direction: 'long',  strikeOffset: -5 },
      { type: 'call', direction: 'short', strikeOffset: +5 },
    ],
  },

  // ── Advanced ────────────────────────────────────────────────────────────────
  call_butterfly: {
    name: 'Call Butterfly',
    category: 'advanced',
    description: 'Neutral-Bullish',
    legs: [
      { type: 'call', direction: 'long',  strikeOffset: -5 },
      { type: 'call', direction: 'short', strikeOffset:  0, quantity: 2 },
      { type: 'call', direction: 'long',  strikeOffset: +5 },
    ],
  },
  put_butterfly: {
    name: 'Put Butterfly',
    category: 'advanced',
    description: 'Neutral-Bearish',
    legs: [
      { type: 'put', direction: 'long',  strikeOffset: -5 },
      { type: 'put', direction: 'short', strikeOffset:  0, quantity: 2 },
      { type: 'put', direction: 'long',  strikeOffset: +5 },
    ],
  },
  calendar_call: {
    name: 'Calendar Call',
    category: 'advanced',
    description: 'Time decay play',
    legs: [
      { type: 'call', direction: 'short', strikeOffset: 0, expOffset: 0 },
      { type: 'call', direction: 'long',  strikeOffset: 0, expOffset: 1 },
    ],
  },
  calendar_put: {
    name: 'Calendar Put',
    category: 'advanced',
    description: 'Time decay play',
    legs: [
      { type: 'put', direction: 'short', strikeOffset: 0, expOffset: 0 },
      { type: 'put', direction: 'long',  strikeOffset: 0, expOffset: 1 },
    ],
  },
  diagonal_call: {
    name: 'Diagonal Call',
    category: 'advanced',
    description: 'Directional calendar',
    legs: [
      { type: 'call', direction: 'short', strikeOffset:  0, expOffset: 0 },
      { type: 'call', direction: 'long',  strikeOffset: +5, expOffset: 1 },
    ],
  },
  jade_lizard: {
    name: 'Jade Lizard',
    category: 'advanced',
    description: 'No upside risk',
    legs: [
      { type: 'put',  direction: 'short', strikeOffset: -3 },
      { type: 'call', direction: 'short', strikeOffset: +3 },
      { type: 'call', direction: 'long',  strikeOffset: +6 },
    ],
  },
  short_straddle: {
    name: 'Short Straddle',
    category: 'advanced',
    description: 'High theta · Risk',
    legs: [
      { type: 'call', direction: 'short', strikeOffset: 0 },
      { type: 'put',  direction: 'short', strikeOffset: 0 },
    ],
  },
  short_strangle: {
    name: 'Short Strangle',
    category: 'advanced',
    description: 'Wide range · Credit',
    legs: [
      { type: 'call', direction: 'short', strikeOffset: +4 },
      { type: 'put',  direction: 'short', strikeOffset: -4 },
    ],
  },
  call_ratio: {
    name: 'Call Ratio',
    category: 'advanced',
    description: 'Backspread',
    legs: [
      { type: 'call', direction: 'long',  strikeOffset: -3 },
      { type: 'call', direction: 'short', strikeOffset: +2, quantity: 2 },
    ],
  },
  put_ratio: {
    name: 'Put Ratio',
    category: 'advanced',
    description: 'Backspread',
    legs: [
      { type: 'put', direction: 'long',  strikeOffset: +3 },
      { type: 'put', direction: 'short', strikeOffset: -2, quantity: 2 },
    ],
  },
}

// ── roundStrike — mirrors prototype rndStrike(p) ──

export function roundStrike(price: number): number {
  const step = price > 500 ? 5 : price > 200 ? 2 : 1
  return Math.round(price / step) * step
}

// ── generateMockOptionChain ──

const RISK_FREE_RATE = 0.045

export function generateMockOptionChain(
  ticker: string,
  expiryDate: string,
  stockPrice: number,
  iv: number,
): OptionContract[] {
  const lotSize = MOCK_LOT_SIZES[ticker] ?? MOCK_LOT_SIZES['QQQ']
  const today = new Date().toISOString().slice(0, 10)
  const T = Math.max(
    (new Date(expiryDate).getTime() - new Date(today).getTime()) / (365.25 * 86_400_000),
    0.001,
  )

  const step = stockPrice > 500 ? 5 : stockPrice > 200 ? 2 : 1
  const lo = roundStrike(stockPrice * 0.80)
  const hi = roundStrike(stockPrice * 1.20)

  const contracts: OptionContract[] = []

  for (let strike = lo; strike <= hi; strike = parseFloat((strike + step).toFixed(4))) {
    const moneyness = Math.abs(strike / stockPrice - 1)
    // Simple vol smile: OTM options carry slightly higher IV than ATM
    const strikeIv = iv * (1 + 0.15 * moneyness)

    for (const optionType of ['call', 'put'] as OptionType[]) {
      const isCall = optionType === 'call'
      const bsm = calcBSM({ S: stockPrice, K: strike, T, r: RISK_FREE_RATE, sigma: strikeIv, isCall })
      const mid = Math.max(bsm.price, 0.01)

      // Spread widens for deep OTM and cheap options
      const spreadPct = mid < 0.10 ? 0.50 : mid < 1.00 ? 0.15 : mid < 5.00 ? 0.05 : 0.02
      const halfSpread = Math.max(mid * spreadPct * 0.5, 0.01)
      const bid = parseFloat(Math.max(mid - halfSpread, 0).toFixed(2))
      const ask = parseFloat((mid + halfSpread).toFixed(2))
      const last = parseFloat(((bid + ask) / 2).toFixed(2))

      // ATM options attract most of the volume and open interest
      const atmGaussian = Math.exp(-0.5 * (moneyness / 0.05) ** 2)
      const volume = Math.max(
        10,
        Math.round((2000 + 28000 * atmGaussian) * (0.4 + 1.2 * seededRandom(ticker, expiryDate, strike, isCall, 0))),
      )
      const openInterest = Math.max(
        100,
        Math.round((10000 + 140000 * atmGaussian) * (0.6 + 0.8 * seededRandom(ticker, expiryDate, strike, isCall, 1))),
      )

      contracts.push({
        symbol: `${ticker}_${expiryDate}_${isCall ? 'C' : 'P'}${strike}`,
        strike: parseFloat(strike.toFixed(2)),
        optionType,
        expiry: expiryDate,
        iv: parseFloat(strikeIv.toFixed(4)),
        lotSize,
        bid,
        ask,
        last,
        volume,
        openInterest,
      })
    }
  }

  return contracts
}

// Deterministic pseudo-random so the chain looks consistent across re-renders
function seededRandom(ticker: string, expiry: string, strike: number, isCall: boolean, salt: number): number {
  let h = salt * 2654435761
  for (let i = 0; i < ticker.length; i++) h ^= ticker.charCodeAt(i) * (i + 1)
  for (let i = 0; i < expiry.length; i++) h ^= expiry.charCodeAt(i) * (i + 7)
  h ^= Math.round(strike * 100) * 1000003
  h ^= isCall ? 0xdeadbeef : 0xcafebabe
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff
}
