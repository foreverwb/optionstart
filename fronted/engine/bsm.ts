/** Black-Scholes-Merton pricing engine. Pure functions, no side effects. */

const SQRT2PI = Math.sqrt(2 * Math.PI)
const MIN_T = 0.001

function cdf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const sign = x < 0 ? -1 : 1
  x = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + p * x)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  return 0.5 * (1 + sign * y)
}

function pdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT2PI
}

interface BSMInput {
  S: number   // underlying price
  K: number   // strike
  T: number   // time to expiry in years
  r: number   // risk-free rate
  q?: number   // dividend yield
  sigma: number // implied volatility (annualised)
  isCall: boolean
}

export interface BSMResult {
  price: number
  delta: number
  gamma: number
  theta: number
  vega: number
  rho: number
}

export function calcBSM({ S, K, T, r, q = 0, sigma, isCall }: BSMInput): BSMResult {
  T = Math.max(T, MIN_T)
  const sqrtT = Math.sqrt(T)
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT)
  const d2 = d1 - sigma * sqrtT
  const sign = isCall ? 1 : -1

  const Nd1 = cdf(sign * d1)
  const Nd2 = cdf(sign * d2)
  const nd1 = pdf(d1)
  const discountS = Math.exp(-q * T)
  const discountK = K * Math.exp(-r * T)

  const price = sign * (S * discountS * cdf(sign * d1) - discountK * cdf(sign * d2))
  const delta = sign * discountS * Nd1
  const gamma = discountS * nd1 / (S * sigma * sqrtT)
  const theta = (
    -(S * discountS * nd1 * sigma) / (2 * sqrtT)
    - sign * r * discountK * Nd2
    + sign * q * S * discountS * Nd1
  ) / 365
  const vega = S * discountS * nd1 * sqrtT / 100  // per 1% IV move
  const rho = sign * discountK * T * Nd2 / 100

  return { price, delta, gamma, theta, vega, rho }
}

export interface PnLInput {
  legs: Array<{
    strike: number
    premium: number
    quantity: number
    lotSize: number
    isCall: boolean
    isLong: boolean
    expiry: string
    iv: number
  }>
  S: number
  r: number
  q: number
  commission: number
  targetDate?: string
}

export interface PnLPoint {
  price: number
  pnl: number
}

function yearFraction(from: string, to: string): number {
  return Math.max((new Date(to).getTime() - new Date(from).getTime()) / (365.25 * 86400_000), MIN_T)
}

export function calcPnL(input: PnLInput, priceRange: [number, number], steps = 200): PnLPoint[] {
  const today = new Date().toISOString().slice(0, 10)
  const evalDate = input.targetDate ?? today
  const [lo, hi] = priceRange
  const step = (hi - lo) / steps

  return Array.from({ length: steps + 1 }, (_, i) => {
    const S = lo + i * step
    let pnl = 0
    for (const leg of input.legs) {
      const T = yearFraction(evalDate, leg.expiry)
      const bsm = calcBSM({ S, K: leg.strike, T, r: input.r, q: input.q, sigma: leg.iv, isCall: leg.isCall })
      const direction = leg.isLong ? 1 : -1
      pnl += direction * (bsm.price - leg.premium) * leg.quantity * leg.lotSize
        - input.commission * leg.quantity
    }
    return { price: parseFloat(S.toFixed(2)), pnl: parseFloat(pnl.toFixed(2)) }
  })
}

export function calcExpiryPnL(input: PnLInput, priceRange: [number, number], steps = 200): PnLPoint[] {
  const [lo, hi] = priceRange
  const step = (hi - lo) / steps

  return Array.from({ length: steps + 1 }, (_, i) => {
    const S = lo + i * step
    let pnl = 0
    for (const leg of input.legs) {
      const intrinsic = leg.isCall ? Math.max(S - leg.strike, 0) : Math.max(leg.strike - S, 0)
      const dir = leg.isLong ? 1 : -1
      pnl += dir * (intrinsic - leg.premium) * leg.quantity * leg.lotSize
        - input.commission * leg.quantity
    }
    return { price: parseFloat(S.toFixed(2)), pnl: parseFloat(pnl.toFixed(2)) }
  })
}

export function calcPortfolioGreeks(
  legs: PnLInput['legs'],
  S: number,
  r: number,
  q: number,
): { delta: number; gamma: number; theta: number; vega: number; rho: number; iv: number } {
  const today = new Date().toISOString().slice(0, 10)
  let delta = 0, gamma = 0, theta = 0, vega = 0, rho = 0, ivSum = 0

  for (const leg of legs) {
    const T = yearFraction(today, leg.expiry)
    const bsm = calcBSM({ S, K: leg.strike, T, r, q, sigma: leg.iv, isCall: leg.isCall })
    const scale = (leg.isLong ? 1 : -1) * leg.quantity * leg.lotSize
    delta += bsm.delta * scale
    gamma += bsm.gamma * scale
    theta += bsm.theta * scale
    vega += bsm.vega * scale
    rho += bsm.rho * scale
    ivSum += leg.iv
  }

  return { delta, gamma, theta, vega, rho, iv: legs.length > 0 ? ivSum / legs.length : 0 }
}

function expiryPayoff(price: number, input: PnLInput): number {
  return input.legs.reduce((sum, leg) => {
    const intrinsic = leg.isCall ? Math.max(price - leg.strike, 0) : Math.max(leg.strike - price, 0)
    const direction = leg.isLong ? 1 : -1
    return sum + direction * (intrinsic - leg.premium) * leg.quantity * leg.lotSize
      - input.commission * leg.quantity
  }, 0)
}

function uniqueSortedStrikes(legs: PnLInput['legs']): number[] {
  const strikes = legs
    .map((leg) => leg.strike)
    .filter((strike) => Number.isFinite(strike) && strike > 0)
    .sort((a, b) => a - b)
  return strikes.filter((strike, idx) => idx === 0 || Math.abs(strike - strikes[idx - 1]) > 1e-8)
}

function weightedIv(legs: PnLInput['legs']): number {
  const weighted = legs.reduce(
    (acc, leg) => {
      const weight = leg.quantity * leg.lotSize
      return {
        total: acc.total + weight,
        value: acc.value + Math.max(leg.iv, 0.0001) * weight,
      }
    },
    { total: 0, value: 0 },
  )
  return weighted.total > 0 ? weighted.value / weighted.total : 0.3
}

function lognormalCdf(price: number, mu: number, sigT: number): number {
  if (price <= 0) return 0
  if (!Number.isFinite(price)) return 1
  return cdf((Math.log(price) - mu) / sigT)
}

function profitProbabilityBetween(input: PnLInput, lo: number, hi: number, mu: number, sigT: number): number {
  const width = Number.isFinite(hi) ? hi - lo : Math.max(input.S, 1)
  if (width <= 0) return 0

  const x1 = lo
  const x2 = Number.isFinite(hi) ? hi : lo + width
  const y1 = expiryPayoff(x1, input)
  const y2 = expiryPayoff(x2, input)
  const slope = (y2 - y1) / (x2 - x1)

  if (Math.abs(slope) < 1e-8) {
    return y1 > 0 ? lognormalCdf(hi, mu, sigT) - lognormalCdf(lo, mu, sigT) : 0
  }

  const root = x1 - y1 / slope
  const lower = slope > 0 ? Math.max(lo, root) : lo
  const upper = slope > 0 ? hi : Math.min(hi, root)

  if (upper <= lower) return 0
  return lognormalCdf(upper, mu, sigT) - lognormalCdf(lower, mu, sigT)
}

export function calcCop(input: PnLInput, _priceRange: [number, number]): number {
  void _priceRange
  if (input.legs.length === 0) return 0
  const today = new Date().toISOString().slice(0, 10)
  const avgIv = weightedIv(input.legs)
  const nearestExpiry = input.legs.reduce((m, l) => (l.expiry < m ? l.expiry : m), input.legs[0].expiry)
  const T = yearFraction(today, nearestExpiry)
  const mu = Math.log(input.S) + (input.r - input.q - 0.5 * avgIv * avgIv) * T
  const sigT = avgIv * Math.sqrt(T)

  if (sigT <= 0) {
    const terminalPrice = input.S * Math.exp((input.r - input.q) * T)
    return expiryPayoff(terminalPrice, input) > 0 ? 100 : 0
  }

  const boundaries = [0, ...uniqueSortedStrikes(input.legs), Number.POSITIVE_INFINITY]
  const probability = boundaries.slice(0, -1).reduce((sum, lo, idx) =>
    sum + profitProbabilityBetween(input, lo, boundaries[idx + 1], mu, sigT),
  0)

  return Math.max(0, Math.min(100, probability * 100))
}

export function calcHeatmap(
  input: PnLInput,
  priceRange: [number, number],
  dates: string[],
  priceSteps = 50,
): number[][] {
  const [lo, hi] = priceRange
  const step = (hi - lo) / priceSteps

  return dates.map((date) =>
    Array.from({ length: priceSteps + 1 }, (_, i) => {
      const S = lo + i * step
      let pnl = 0
      for (const leg of input.legs) {
        const T = yearFraction(date, leg.expiry)
        const bsm = calcBSM({ S, K: leg.strike, T, r: input.r, q: input.q, sigma: leg.iv, isCall: leg.isCall })
        pnl += (leg.isLong ? 1 : -1) * (bsm.price - leg.premium) * leg.quantity * leg.lotSize
          - input.commission * leg.quantity
      }
      return parseFloat(pnl.toFixed(2))
    }),
  )
}
