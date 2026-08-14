export type OptionType = 'call' | 'put'
export type PositionSide = 'long' | 'short'
export type GreekDisplayMode = 'delta' | 'theta' | 'gamma' | 'vega' | 'rho'
export type DisplayMode = 'dollar' | 'pct' | 'risk' | 'contract' | GreekDisplayMode
export type ViewMode = 'chart' | 'table'
export type AppPage = 'build' | 'saved'
export type SavedTradeStatus = 'active' | 'expired' | 'closed'
export type SavedTradeFilter = 'all' | SavedTradeStatus
export type SavedTradeSortKey = 'recent' | 'ticker' | 'expiry' | 'pnl'
export type HistoryTimeframe = '1d' | '1w' | '2w' | '1m' | '3m' | 'all'
export type HistoryChartStyle = 'line' | 'candlestick'

export interface HistoricalPriceBar {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface HistoricalPriceSeries {
  code: string
  interval: string
  bars: HistoricalPriceBar[]
}

export interface HistoricalPriceResponse {
  timeframe: HistoryTimeframe
  series: HistoricalPriceSeries[]
  cached: boolean
}

// ── Legacy type (kept for mock data compatibility) ──
export interface OptionLeg {
  id: string
  symbol: string
  expiry: string       // YYYY-MM-DD
  strike: number
  optionType: OptionType
  side: PositionSide
  quantity: number     // always positive; direction encoded in side
  premium: number      // per-share price paid/received
  lotSize: number      // from Futu API, never hardcoded
}

// ── Primary strategy leg used by the store ──
export interface Leg {
  id: string
  optionType: OptionType
  direction: PositionSide
  quantity: number
  strike: number
  expiry: string       // YYYY-MM-DD
  costBasis: number    // per-share BSM price at creation
  iv: number           // implied volatility (annualised, e.g. 0.30 = 30%)
  lotSize: number      // from Futu API, never hardcoded
  excluded: boolean
}

export interface ExpiryDate {
  date: string         // YYYY-MM-DD
  daysToExpiry: number
}

export interface OptionContract {
  symbol: string
  strike: number
  optionType: OptionType
  expiry: string
  iv: number
  lotSize: number      // from Futu API
  bid: number
  ask: number
  last: number
  openInterest?: number
  volume?: number
  delta?: number
  gamma?: number
  vega?: number
  theta?: number
  rho?: number
}

export interface RealtimeQuote {
  code: string
  lastPrice?: number
  bidPrice?: number
  askPrice?: number
  volume?: number
  impliedVolatility?: number
  delta?: number
  gamma?: number
  vega?: number
  theta?: number
  rho?: number
  timestamp: string
}

export interface Greeks {
  delta: number
  gamma: number
  theta: number
  vega: number
  rho: number
  iv: number
}

export interface ComputedStats {
  netDebit: number
  maxLoss: number
  maxProfit: number
  cop: number
  breakevens: number[]
  unrealizedPnl: number
  netGreeks: Greeks
}

export interface SavedTrade {
  id: string
  name: string
  ticker: string
  strategyName: string
  legs: Leg[]
  stockPrice: number
  createdAt: number
  updatedAt: number
  expiry: string | null
  status: SavedTradeStatus
  costBasis: number
  maxProfit: number
  maxLoss: number
  unrealizedPnl: number
  returnPct: number
}

export interface SavedTradeSummary {
  totalUnrealized: number
  activeCount: number
  winRate: number
  totalSaved: number
}

export interface PnLPoint {
  price: number
  pnl: number
}

export interface StrategyState {
  legs: OptionLeg[]
  underlyingPrice: number
  riskFreeRate: number
  pnlCurve: PnLPoint[]
  greeks: Greeks | null
  isComputing: boolean
}
