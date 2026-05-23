import { create } from 'zustand'
import { persist, subscribeWithSelector } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import { calcBSM } from '@/engine/bsm'
import {
  closeSavedTradeRequest,
  createSavedTrade,
  deleteSavedTradeRequest,
  fetchSavedTrades,
  updateSavedTradeRequest,
} from '@/utils/savedTradesApi'
import type {
  AppPage,
  Leg,
  ExpiryDate,
  OptionContract,
  DisplayMode,
  ViewMode,
  ComputedStats,
  OptionType,
  PositionSide,
  RealtimeQuote,
  SavedTrade,
  SavedTradeFilter,
  SavedTradeSortKey,
  SavedTradeSummary,
  SavedTradeStatus,
} from '@/types'

// ── Strategy template definitions (mirroring prototype STRATEGIES) ──

type TemplateLeg = {
  type: OptionType
  dir: PositionSide
  sp: number       // strike offset as % of stock price (e.g. +3 = ATM+3%)
  qty?: number
  expOff?: number  // 0 = base expiry, 1 = next expiry (calendar/diagonal)
}

export type StrategyKey =
  | 'long_call' | 'long_put' | 'covered_call' | 'cash_put' | 'protective_put'
  | 'bull_call' | 'bear_put' | 'bull_put' | 'bear_call'
  | 'iron_condor' | 'iron_butterfly' | 'straddle' | 'strangle' | 'collar'
  | 'call_butterfly' | 'put_butterfly'
  | 'calendar_call' | 'calendar_put' | 'diagonal_call'
  | 'jade_lizard' | 'short_straddle' | 'short_strangle'
  | 'call_ratio' | 'put_ratio'

const STRATEGIES: Record<StrategyKey, TemplateLeg[]> = {
  long_call:      [{ type: 'call', dir: 'long',  sp: +3 }],
  long_put:       [{ type: 'put',  dir: 'long',  sp: -3 }],
  covered_call:   [{ type: 'call', dir: 'short', sp: +5 }],
  cash_put:       [{ type: 'put',  dir: 'short', sp: -3 }],
  protective_put: [{ type: 'put',  dir: 'long',  sp: -5 }],
  bull_call:      [{ type: 'call', dir: 'long',  sp: -2 }, { type: 'call', dir: 'short', sp: +3 }],
  bear_put:       [{ type: 'put',  dir: 'long',  sp: +2 }, { type: 'put',  dir: 'short', sp: -3 }],
  bull_put:       [{ type: 'put',  dir: 'long',  sp: -8 }, { type: 'put',  dir: 'short', sp: -3 }],
  bear_call:      [{ type: 'call', dir: 'short', sp: +3 }, { type: 'call', dir: 'long',  sp: +8 }],
  iron_condor:    [
    { type: 'put',  dir: 'long',  sp: -8 },
    { type: 'put',  dir: 'short', sp: -3 },
    { type: 'call', dir: 'short', sp: +3 },
    { type: 'call', dir: 'long',  sp: +8 },
  ],
  iron_butterfly: [
    { type: 'put',  dir: 'long',  sp: -5 },
    { type: 'put',  dir: 'short', sp:  0 },
    { type: 'call', dir: 'short', sp:  0 },
    { type: 'call', dir: 'long',  sp: +5 },
  ],
  straddle:       [{ type: 'call', dir: 'long', sp: 0 }, { type: 'put', dir: 'long', sp: 0 }],
  strangle:       [{ type: 'call', dir: 'long', sp: +3 }, { type: 'put', dir: 'long', sp: -3 }],
  collar:         [{ type: 'put',  dir: 'long',  sp: -5 }, { type: 'call', dir: 'short', sp: +5 }],
  call_butterfly: [
    { type: 'call', dir: 'long',  sp: -5 },
    { type: 'call', dir: 'short', sp:  0, qty: 2 },
    { type: 'call', dir: 'long',  sp: +5 },
  ],
  put_butterfly: [
    { type: 'put', dir: 'long',  sp: -5 },
    { type: 'put', dir: 'short', sp:  0, qty: 2 },
    { type: 'put', dir: 'long',  sp: +5 },
  ],
  calendar_call:  [
    { type: 'call', dir: 'short', sp: 0, expOff: 0 },
    { type: 'call', dir: 'long',  sp: 0, expOff: 1 },
  ],
  calendar_put:   [
    { type: 'put', dir: 'short', sp: 0, expOff: 0 },
    { type: 'put', dir: 'long',  sp: 0, expOff: 1 },
  ],
  diagonal_call:  [
    { type: 'call', dir: 'short', sp:  0, expOff: 0 },
    { type: 'call', dir: 'long',  sp: +5, expOff: 1 },
  ],
  jade_lizard:    [
    { type: 'put',  dir: 'short', sp: -3 },
    { type: 'call', dir: 'short', sp: +3 },
    { type: 'call', dir: 'long',  sp: +6 },
  ],
  short_straddle: [{ type: 'call', dir: 'short', sp: 0 }, { type: 'put', dir: 'short', sp: 0 }],
  short_strangle: [{ type: 'call', dir: 'short', sp: +4 }, { type: 'put', dir: 'short', sp: -4 }],
  call_ratio:     [{ type: 'call', dir: 'long',  sp: -3 }, { type: 'call', dir: 'short', sp: +2, qty: 2 }],
  put_ratio:      [{ type: 'put',  dir: 'long',  sp: +3 }, { type: 'put',  dir: 'short', sp: -2, qty: 2 }],
}

// ── Helpers ──

function rndStrike(price: number): number {
  const step = price > 500 ? 5 : price > 200 ? 2 : 1
  return Math.round(price / step) * step
}

function availableStrikes(
  chain: Map<string, OptionContract[]>,
  expiry: string,
  optionType: OptionType,
): number[] {
  const contracts = chain.get(expiry) ?? []
  const strikes = contracts
    .filter((contract) => contract.optionType === optionType)
    .map((contract) => contract.strike)
    .filter((strike) => Number.isFinite(strike))
    .sort((a, b) => a - b)

  return strikes.filter((strike, idx) => idx === 0 || Math.abs(strike - strikes[idx - 1]) > 0.0001)
}

export function nearestValidStrike(
  chain: Map<string, OptionContract[]>,
  expiry: string,
  optionType: OptionType,
  target: number,
): number | null {
  const strikes = availableStrikes(chain, expiry, optionType)
  if (strikes.length === 0) return null

  const bounded = Math.max(strikes[0], Math.min(strikes[strikes.length - 1], target))
  return strikes.reduce((best, strike) =>
    Math.abs(strike - bounded) < Math.abs(best - bounded) ? strike : best,
  strikes[0])
}

function resolveStrike(
  chain: Map<string, OptionContract[]>,
  expiry: string,
  optionType: OptionType,
  target: number,
): number {
  return nearestValidStrike(chain, expiry, optionType, target) ?? rndStrike(target)
}

function yearFraction(from: string, to: string): number {
  return Math.max(
    (new Date(to).getTime() - new Date(from).getTime()) / (365.25 * 86_400_000),
    0.001,
  )
}

function lotSizeFromChain(chain: Map<string, OptionContract[]>): number {
  for (const contracts of chain.values()) {
    if (contracts.length > 0) return contracts[0].lotSize
  }
  return 100
}

function findContract(
  chain: Map<string, OptionContract[]>,
  expiry: string,
  strike: number,
  optionType: 'call' | 'put',
): OptionContract | undefined {
  const contracts = chain.get(expiry)
  if (!contracts) return undefined
  return contracts.find((c) => Math.abs(c.strike - strike) < 0.0001 && c.optionType === optionType)
}

function marketPrice(contract: OptionContract | undefined): number | null {
  if (!contract) return null
  if (contract.bid > 0 && contract.ask > 0) return (contract.bid + contract.ask) / 2
  if (contract.last > 0) return contract.last
  return null
}

export function reconcileLegStrikesWithChain(
  legs: Leg[],
  chain: Map<string, OptionContract[]>,
): Leg[] {
  return legs.map((leg) => {
    const strike = nearestValidStrike(chain, leg.expiry, leg.optionType, leg.strike)
    if (strike === null || Math.abs(strike - leg.strike) < 0.0001) return leg

    const updated = { ...leg, strike }
    const contract = findContract(chain, leg.expiry, strike, leg.optionType)
    const mktPrice = marketPrice(contract)
    if (mktPrice !== null) updated.costBasis = mktPrice
    if (contract?.iv) updated.iv = contract.iv
    return updated
  })
}

/** Auto-range based on days to expiry: nearer expiry → tighter range */
function autoRangePercent(dte: number): number {
  if (dte <= 0) return 3
  if (dte <= 1) return 4
  if (dte <= 3) return 5
  if (dte <= 7) return 6
  if (dte <= 14) return 7
  if (dte <= 30) return 8
  if (dte <= 60) return 10
  if (dte <= 120) return 13
  return 15
}

function priceLeg(
  stockPrice: number,
  strike: number,
  expiry: string,
  r: number,
  q: number,
  iv: number,
  isCall: boolean,
): number {
  const today = new Date().toISOString().slice(0, 10)
  const T = yearFraction(today, expiry)
  const result = calcBSM({ S: stockPrice, K: strike, T, r, q, sigma: iv, isCall })
  return parseFloat(result.price.toFixed(2))
}

function tradeExpiry(legs: Leg[]): string | null {
  const expiries = legs.filter((leg) => !leg.excluded).map((leg) => leg.expiry).sort()
  return expiries[0] ?? null
}

function inferTradeStatus(expiry: string | null): SavedTradeStatus {
  if (!expiry) return 'active'
  const today = new Date().toISOString().slice(0, 10)
  return expiry < today ? 'expired' : 'active'
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dayOrdinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`
  switch (day % 10) {
    case 1: return `${day}st`
    case 2: return `${day}nd`
    case 3: return `${day}rd`
    default: return `${day}th`
  }
}

export function generateTradeName(ticker: string, legs: Leg[]): string {
  const active = legs.filter((l) => !l.excluded)
  if (active.length === 0 || !ticker) return `${ticker || 'Untitled'} Trade`

  const expiries = active.map((l) => l.expiry).sort()
  const [, m, d] = expiries[0].split('-').map(Number)
  const expiryStr = `${MONTH_ABBR[m - 1]} ${dayOrdinal(d)}`

  const sorted = [...active].sort((a, b) => b.strike - a.strike)
  const legParts = sorted.map((leg) => {
    const t = leg.optionType === 'call' ? 'C' : 'P'
    const sign = leg.direction === 'long' ? '+' : '-'
    return `${leg.strike}${t}(${sign}${leg.quantity})`
  })

  return `${ticker} ${expiryStr} ${legParts.join('/')}`
}

function netCostBasis(legs: Leg[]): number {
  return legs.reduce((sum, leg) => {
    if (leg.excluded) return sum
    const directionMultiplier = leg.direction === 'long' ? 1 : -1
    return sum + directionMultiplier * leg.costBasis * leg.quantity * leg.lotSize
  }, 0)
}

function calculateReturnPct(unrealizedPnl: number, costBasis: number): number {
  const denominator = Math.abs(costBasis)
  if (denominator === 0) return 0
  return (unrealizedPnl / denominator) * 100
}

function marketPriceForLeg(
  leg: Leg,
  stockPrice: number,
  dividendYield: number,
  riskFreeRate: number,
  ivMultiplier: number,
  optionChain: Map<string, OptionContract[]>,
): number {
  const contracts = optionChain.get(leg.expiry) ?? []
  const contract = contracts.find((item) =>
    item.optionType === leg.optionType && Math.abs(item.strike - leg.strike) < 0.001,
  )
  if (contract) {
    if (contract.bid > 0 && contract.ask > 0) return (contract.bid + contract.ask) / 2
    if (contract.last > 0) return contract.last
  }
  return priceLeg(stockPrice, leg.strike, leg.expiry, riskFreeRate, dividendYield, leg.iv * ivMultiplier, leg.optionType === 'call')
}

function summarizeSavedTrades(savedTrades: SavedTrade[]): SavedTradeSummary {
  const activeTrades = savedTrades.filter((trade) => trade.status === 'active')
  const resolvedTrades = savedTrades.filter((trade) => trade.status === 'closed' || trade.status === 'expired')
  const winningTrades = resolvedTrades.filter((trade) => trade.unrealizedPnl > 0)

  return {
    totalUnrealized: activeTrades.reduce((sum, trade) => sum + trade.unrealizedPnl, 0),
    activeCount: activeTrades.length,
    winRate: resolvedTrades.length === 0 ? 0 : (winningTrades.length / resolvedTrades.length) * 100,
    totalSaved: savedTrades.length,
  }
}

function filterAndSortSavedTrades(
  savedTrades: SavedTrade[],
  filter: SavedTradeFilter,
  sortKey: SavedTradeSortKey,
): SavedTrade[] {
  const filtered = filter === 'all'
    ? savedTrades
    : savedTrades.filter((trade) => trade.status === filter)

  return [...filtered].sort((a, b) => {
    if (sortKey === 'ticker') return a.ticker.localeCompare(b.ticker)
    if (sortKey === 'expiry') return (a.expiry ?? '').localeCompare(b.expiry ?? '')
    if (sortKey === 'pnl') return b.unrealizedPnl - a.unrealizedPnl
    return b.updatedAt - a.updatedAt
  })
}

// ── State & Actions interface ──

interface AppState {
  // Market data
  ticker: string
  stockPrice: number
  dividendYield: number
  riskFreeRate: number
  baseIV: number

  // Option chain
  expiryDates: ExpiryDate[]
  optionChain: Map<string, OptionContract[]>
  selectedExpiry: string | null

  // Strategy legs
  legs: Leg[]
  selectedLegId: string | null
  savedStrategies: Record<string, Leg[]>
  savedTrades: SavedTrade[]
  savedTradesFilter: SavedTradeFilter
  savedTradesSort: SavedTradeSortKey
  currentSavedTradeId: string | null
  savedTradesChain: Map<string, OptionContract[]>
  savedTradesChainBasePrices: Map<string, number>  // ticker → stock price at chain-fetch time

  // View controls
  appPage: AppPage
  dateProgress: number          // 0~1: fraction of time elapsed to expiry
  rangePercent: number          // 1~20: price axis range as % of stock price
  ivMultiplier: number          // 0.5~3.0: scales baseIV for scenario analysis
  displayMode: DisplayMode
  viewMode: ViewMode
  showProbDist: boolean
  commissionPerContract: number

  // Computed stats (updated by Worker callback)
  computedStats: ComputedStats | null

  // Actions
  setAppPage: (page: AppPage) => void
  setTicker: (ticker: string, price: number, q: number, iv: number) => void
  setSelectedExpiry: (date: string) => void
  migrateLegsToExpiry: (date: string) => void
  setSelectedLegId: (id: string | null) => void
  addLeg: (type: OptionType, direction: PositionSide) => void
  updateLeg: (id: string, partial: Partial<Omit<Leg, 'id'>>) => void
  resetLegCostBasis: (id: string) => void
  removeLeg: (id: string) => void
  toggleLegExcluded: (id: string) => void
  loadStrategy: (templateKey: StrategyKey) => void
  setDateProgress: (value: number) => void
  setRangePercent: (value: number) => void
  setIvMultiplier: (value: number) => void
  setDisplayMode: (mode: DisplayMode) => void
  setViewMode: (mode: ViewMode) => void
  toggleProbDist: () => void
  setCommission: (value: number) => void
  updateComputedStats: (stats: ComputedStats | null) => void
  updateOptionQuotes: (quotes: RealtimeQuote[]) => void
  updateSavedTradesQuotes: (quotes: RealtimeQuote[]) => void
  reconcileLegStrikes: () => void
  saveCurrentStrategy: (name: string) => void
  deleteSavedStrategy: (name: string) => void
  loadSavedStrategy: (name: string) => void
  setSavedTradesFilter: (filter: SavedTradeFilter) => void
  setSavedTradesSort: (sortKey: SavedTradeSortKey) => void
  loadSavedTrades: () => Promise<void>
  saveCurrentTrade: (name?: string) => Promise<string>
  updateSavedTrade: (id: string, partial: Partial<Omit<SavedTrade, 'id' | 'createdAt'>>) => Promise<void>
  closeSavedTrade: (id: string) => Promise<void>
  deleteSavedTrade: (id: string) => Promise<void>
  loadSavedTrade: (id: string) => Promise<void>
  refreshSavedTradesPnl: () => Promise<void>
  getSavedTradeSummary: () => SavedTradeSummary
  getVisibleSavedTrades: () => SavedTrade[]
}

type CurrentTradeSnapshot = Omit<SavedTrade, 'id' | 'createdAt' | 'updatedAt'>

function mergePersistedState(persisted: unknown, current: AppState): AppState {
  if (typeof persisted !== 'object' || persisted === null) return current
  const persistedState = { ...(persisted as Partial<AppState>) }
  delete persistedState.savedTrades
  delete persistedState.currentSavedTradeId
  return { ...current, ...persistedState }
}

function buildCurrentTradeSnapshot(
  state: AppState,
  tradeName: string,
): CurrentTradeSnapshot {
  const expiry = tradeExpiry(state.legs)
  const costBasis = state.computedStats?.netDebit ?? netCostBasis(state.legs)
  const unrealizedPnl = state.computedStats?.unrealizedPnl ?? 0

  return {
    name: tradeName,
    ticker: state.ticker,
    strategyName: tradeName,
    legs: state.legs.map((leg) => ({ ...leg })),
    stockPrice: state.stockPrice,
    expiry,
    status: inferTradeStatus(expiry),
    costBasis,
    maxProfit: state.computedStats?.maxProfit ?? 0,
    maxLoss: state.computedStats?.maxLoss ?? 0,
    unrealizedPnl,
    returnPct: calculateReturnPct(unrealizedPnl, costBasis),
  }
}

// ── Store ──

export const useAppStore = create<AppState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        // ── Initial state ──
        ticker: '',
        stockPrice: 0,
        dividendYield: 0,
        riskFreeRate: 0.045,
        baseIV: 0.3,

        expiryDates: [],
        optionChain: new Map(),
        selectedExpiry: null,

        legs: [],
        selectedLegId: null,
        savedStrategies: {},
        savedTrades: [],
        savedTradesFilter: 'all',
        savedTradesSort: 'recent',
        currentSavedTradeId: null,
        savedTradesChain: new Map(),
        savedTradesChainBasePrices: new Map(),

        appPage: 'build',
        dateProgress: 1,
        rangePercent: 10,
        ivMultiplier: 1.0,
        displayMode: 'dollar',
        viewMode: 'chart',
        showProbDist: true,
        commissionPerContract: 0,

        computedStats: null,

        // ── Actions ──

        setAppPage: (page) => set({ appPage: page }),

        setTicker: (ticker, price, q, iv) => {
          set({
            ticker,
            stockPrice: price,
            dividendYield: q,
            baseIV: iv,
            // reset derived state when ticker changes
            expiryDates: [],
            optionChain: new Map(),
            selectedExpiry: null,
            dateProgress: 1,
            legs: [],
            selectedLegId: null,
            currentSavedTradeId: null,
            computedStats: null,
          })
        },

        setSelectedExpiry: (date) => {
          const today = new Date().toISOString().slice(0, 10)
          const dte = Math.max(0, Math.round((new Date(date).getTime() - new Date(today).getTime()) / 86_400_000))
          set({ selectedExpiry: date, dateProgress: 1, computedStats: null, rangePercent: autoRangePercent(dte) })
        },

        migrateLegsToExpiry: (date) =>
          set((s) => {
            const today = new Date().toISOString().slice(0, 10)
            const dte = Math.max(0, Math.round((new Date(date).getTime() - new Date(today).getTime()) / 86_400_000))
            if (s.legs.length === 0) return { selectedExpiry: date, dateProgress: 1, computedStats: null, rangePercent: autoRangePercent(dte) }
            const legs = s.legs.map((l) => {
              const strike = resolveStrike(s.optionChain, date, l.optionType, l.strike)
              const updated = { ...l, expiry: date, strike }
              const contract = findContract(s.optionChain, date, strike, l.optionType)
              const mktPrice = marketPrice(contract)
              if (mktPrice !== null) updated.costBasis = mktPrice
              if (contract?.iv) updated.iv = contract.iv
              return updated
            })
            return { selectedExpiry: date, dateProgress: 1, legs, computedStats: null, rangePercent: autoRangePercent(dte) }
          }),

        setSelectedLegId: (id) => set({ selectedLegId: id }),

        addLeg: (type, direction) => {
          const { stockPrice, dividendYield, riskFreeRate, baseIV, ivMultiplier, selectedExpiry, expiryDates, optionChain } = get()
          const today = new Date().toISOString().slice(0, 10)
          const expiry = selectedExpiry ?? expiryDates[0]?.date ?? today
          const strike = resolveStrike(optionChain, expiry, type, stockPrice)
          const lotSize = lotSizeFromChain(optionChain)

          const contract = findContract(optionChain, expiry, strike, type)
          const mktPrice = marketPrice(contract)
          const iv = contract?.iv ?? baseIV
          const costBasis = mktPrice ?? priceLeg(stockPrice, strike, expiry, riskFreeRate, dividendYield, iv * ivMultiplier, type === 'call')

          const leg: Leg = {
            id: uuidv4(),
            optionType: type,
            direction,
            quantity: 1,
            strike,
            expiry,
            costBasis,
            iv,
            lotSize,
            excluded: false,
          }
          set((s) => ({ legs: [...s.legs, leg], selectedLegId: leg.id, currentSavedTradeId: null }))
        },

        updateLeg: (id, partial) =>
          set((s) => {
            let structureChanged = false
            const legs = s.legs.map((l) => {
              if (l.id !== id) return l
              const updated = { ...l, ...partial }
              const strikeChanged = partial.strike !== undefined && partial.strike !== l.strike
              const typeChanged = partial.optionType !== undefined && partial.optionType !== l.optionType
              const expiryChanged = partial.expiry !== undefined && partial.expiry !== l.expiry
              if (strikeChanged || typeChanged || expiryChanged) {
                structureChanged = true
                updated.strike = resolveStrike(s.optionChain, updated.expiry, updated.optionType, updated.strike)
                const contract = findContract(s.optionChain, updated.expiry, updated.strike, updated.optionType)
                const mktPrice = marketPrice(contract)
                if (mktPrice !== null) updated.costBasis = mktPrice
                if (contract?.iv) updated.iv = contract.iv
              }
              return updated
            })
            return {
              legs,
              ...(structureChanged && s.currentSavedTradeId ? { currentSavedTradeId: null } : {}),
            }
          }),

        resetLegCostBasis: (id) =>
          set((s) => ({
            legs: s.legs.map((leg) => (
              leg.id === id
                ? {
                    ...leg,
                    costBasis: marketPriceForLeg(
                      leg,
                      s.stockPrice,
                      s.dividendYield,
                      s.riskFreeRate,
                      s.ivMultiplier,
                      s.optionChain,
                    ),
                  }
                : leg
            )),
          })),

        removeLeg: (id) =>
          set((s) => ({
            legs: s.legs.filter((l) => l.id !== id),
            selectedLegId: s.selectedLegId === id ? null : s.selectedLegId,
            currentSavedTradeId: null,
          })),

        toggleLegExcluded: (id) =>
          set((s) => ({
            legs: s.legs.map((l) => (l.id === id ? { ...l, excluded: !l.excluded } : l)),
          })),

        loadStrategy: (templateKey) => {
          const template = STRATEGIES[templateKey]
          if (!template) return

          const { stockPrice, dividendYield, riskFreeRate, baseIV, ivMultiplier, expiryDates, optionChain, selectedExpiry } = get()

          const selectedIdx = selectedExpiry ? expiryDates.findIndex((e) => e.date === selectedExpiry) : -1
          const base = selectedIdx >= 0 ? expiryDates[selectedIdx] : (expiryDates[6] ?? expiryDates[0])
          const next = expiryDates[Math.min(selectedIdx + 4, expiryDates.length - 1)] ?? expiryDates[expiryDates.length - 1]
          if (!base) return

          const lotSize = lotSizeFromChain(optionChain)

          const legs: Leg[] = template.map((tmpl) => {
            const targetStrike = stockPrice * (1 + (tmpl.sp ?? 0) / 100)
            const expiry = (tmpl.expOff ? next : base)?.date ?? base.date
            const strike = resolveStrike(optionChain, expiry, tmpl.type, targetStrike)
            const contract = findContract(optionChain, expiry, strike, tmpl.type)
            const mktPrice = marketPrice(contract)
            const iv = contract?.iv ?? baseIV
            const costBasis = mktPrice ?? priceLeg(stockPrice, strike, expiry, riskFreeRate, dividendYield, iv * ivMultiplier, tmpl.type === 'call')
            return {
              id: uuidv4(),
              optionType: tmpl.type,
              direction: tmpl.dir,
              quantity: tmpl.qty ?? 1,
              strike,
              expiry,
              costBasis,
              iv,
              lotSize,
              excluded: false,
            }
          })

          set({
            legs,
            selectedExpiry: legs[0]?.expiry ?? base.date,
            selectedLegId: null,
            dateProgress: 1,
            currentSavedTradeId: null,
            computedStats: null,
          })
        },

        setDateProgress: (value) => set({ dateProgress: Math.max(0, Math.min(1, value)) }),

        setRangePercent: (value) => set({ rangePercent: Math.max(1, Math.min(20, value)) }),

        setIvMultiplier: (value) => set({ ivMultiplier: Math.max(0.5, Math.min(3.0, value)) }),

        setDisplayMode: (mode) => set({ displayMode: mode }),

        setViewMode: (mode) => set({ viewMode: mode }),

        toggleProbDist: () => set((s) => ({ showProbDist: !s.showProbDist })),

        setCommission: (value) => set({ commissionPerContract: Math.max(0, value) }),

        updateComputedStats: (stats) => set({ computedStats: stats }),

        updateOptionQuotes: (quotes) =>
          set((s) => {
            if (quotes.length === 0) return {}
            const byCode = new Map(quotes.map((quote) => [quote.code, quote]))
            const optionChain = new Map<string, OptionContract[]>()
            for (const [expiry, contracts] of s.optionChain.entries()) {
              optionChain.set(
                expiry,
                contracts.map((contract) => {
                  const quote = byCode.get(contract.symbol) ?? byCode.get(`US.${contract.symbol}`)
                  if (!quote) return contract
                  return {
                    ...contract,
                    last: quote.lastPrice ?? contract.last,
                    bid: quote.bidPrice ?? contract.bid,
                    ask: quote.askPrice ?? contract.ask,
                    volume: quote.volume ?? contract.volume,
                    iv: quote.impliedVolatility ?? contract.iv,
                    delta: quote.delta ?? contract.delta,
                    gamma: quote.gamma ?? contract.gamma,
                    vega: quote.vega ?? contract.vega,
                    theta: quote.theta ?? contract.theta,
                    rho: quote.rho ?? contract.rho,
                  }
                }),
              )
            }
            const tickerCode = s.ticker ? `US.${s.ticker}`.toUpperCase() : ''
            const stockQuote = tickerCode
              ? quotes.find((q) => q.code.toUpperCase() === tickerCode)
              : undefined
            if (stockQuote?.lastPrice && stockQuote.lastPrice > 0) {
              return { optionChain, stockPrice: stockQuote.lastPrice }
            }
            return { optionChain }
          }),

        updateSavedTradesQuotes: (quotes) =>
          set((s) => {
            if (quotes.length === 0 || s.savedTradesChain.size === 0) return {}
            const byCode = new Map(quotes.map((q) => [q.code, q]))

            const savedTradesChain = new Map<string, OptionContract[]>()
            for (const [key, contracts] of s.savedTradesChain.entries()) {
              savedTradesChain.set(
                key,
                contracts.map((c) => {
                  const q = byCode.get(c.symbol) ?? byCode.get(`US.${c.symbol}`)
                  if (!q) return c
                  return {
                    ...c,
                    last: q.lastPrice ?? c.last,
                    bid: q.bidPrice ?? c.bid,
                    ask: q.askPrice ?? c.ask,
                    volume: q.volume ?? c.volume,
                    iv: q.impliedVolatility ?? c.iv,
                    delta: q.delta ?? c.delta,
                    gamma: q.gamma ?? c.gamma,
                    vega: q.vega ?? c.vega,
                    theta: q.theta ?? c.theta,
                    rho: q.rho ?? c.rho,
                  }
                }),
              )
            }

            const r = s.riskFreeRate
            const savedTrades = s.savedTrades.map((trade) => {
              if (trade.status !== 'active') return trade
              const contracts = trade.expiry
                ? savedTradesChain.get(`${trade.ticker}::${trade.expiry}`) ?? []
                : []
              const stockQuote = quotes.find((q) => q.code.toUpperCase() === `US.${trade.ticker}`.toUpperCase())
              const stockPrice = (stockQuote?.lastPrice && stockQuote.lastPrice > 0) ? stockQuote.lastPrice : trade.stockPrice
              // Baseline stock price from when the chain was fetched (for delta adjustment)
              const baseStockPrice = s.savedTradesChainBasePrices.get(trade.ticker) ?? trade.stockPrice

              let pnl = 0
              for (const leg of trade.legs) {
                if (leg.excluded) continue
                const contract = contracts.find(
                  (c) => c.optionType === leg.optionType && Math.abs(c.strike - leg.strike) < 0.001,
                )
                // Check if this option contract was updated in THIS quote batch
                const optionQuote = contract
                  ? (byCode.get(contract.symbol) ?? byCode.get(`US.${contract.symbol}`))
                  : undefined
                let currentPrice: number
                if (optionQuote && (optionQuote.bidPrice ?? 0) > 0 && (optionQuote.askPrice ?? 0) > 0) {
                  // Fresh option quote from WebSocket — use live bid/ask
                  currentPrice = ((optionQuote.bidPrice ?? 0) + (optionQuote.askPrice ?? 0)) / 2
                } else if (optionQuote && (optionQuote.lastPrice ?? 0) > 0) {
                  currentPrice = optionQuote.lastPrice ?? 0
                } else if (contract && contract.bid > 0 && contract.ask > 0) {
                  // No fresh option quote — use chain mid as anchor + delta adjustment
                  const chainMid = (contract.bid + contract.ask) / 2
                  const delta = contract.delta ?? 0
                  const stockDelta = stockPrice - baseStockPrice
                  currentPrice = Math.max(0, chainMid + delta * stockDelta)
                } else if (contract && contract.last > 0) {
                  const delta = contract.delta ?? 0
                  const stockDelta = stockPrice - baseStockPrice
                  currentPrice = Math.max(0, contract.last + delta * stockDelta)
                } else {
                  // No chain data at all — BSM fallback
                  currentPrice = priceLeg(stockPrice, leg.strike, leg.expiry, r, 0, leg.iv, leg.optionType === 'call')
                }
                const direction = leg.direction === 'long' ? 1 : -1
                pnl += direction * (currentPrice - leg.costBasis) * leg.quantity * leg.lotSize
              }
              pnl = parseFloat(pnl.toFixed(2))
              return { ...trade, stockPrice, unrealizedPnl: pnl, returnPct: calculateReturnPct(pnl, trade.costBasis) }
            })

            return { savedTradesChain, savedTrades }
          }),

        reconcileLegStrikes: () =>
          set((s) => {
            const legs = reconcileLegStrikesWithChain(s.legs, s.optionChain)
            if (legs.every((leg, index) => leg === s.legs[index])) return {}
            return { legs }
          }),

        saveCurrentStrategy: (name) =>
          set((s) => {
            const entries = Object.entries(s.savedStrategies).filter(([k]) => k !== name)
            const next = [[name, [...s.legs]], ...entries].slice(0, 20)
            return { savedStrategies: Object.fromEntries(next) }
          }),

        deleteSavedStrategy: (name) =>
          set((s) => {
            const rest = { ...s.savedStrategies }
            delete rest[name]
            return { savedStrategies: rest }
          }),

        loadSavedStrategy: (name) => {
          const legs = get().savedStrategies[name]
          if (!legs) return
          set({ legs: legs.map((l) => ({ ...l })), selectedLegId: null, dateProgress: 1, computedStats: null })
        },

        setSavedTradesFilter: (filter) => set({ savedTradesFilter: filter }),

        setSavedTradesSort: (sortKey) => set({ savedTradesSort: sortKey }),

        loadSavedTrades: async () => {
          const savedTrades = await fetchSavedTrades()
          set({ savedTrades })
        },

        saveCurrentTrade: async (name) => {
          const state = get()
          const currentTrade = state.currentSavedTradeId
            ? state.savedTrades.find((trade) => trade.id === state.currentSavedTradeId)
            : undefined
          const tradeName = name?.trim() || currentTrade?.name || generateTradeName(state.ticker, state.legs)
          const snapshot = buildCurrentTradeSnapshot(state, tradeName)
          const savedTrade = state.currentSavedTradeId
            ? await updateSavedTradeRequest(state.currentSavedTradeId, snapshot)
            : await createSavedTrade(snapshot)

          set((s) => ({
            currentSavedTradeId: savedTrade.id,
            savedTrades: [savedTrade, ...s.savedTrades.filter((trade) => trade.id !== savedTrade.id)],
          }))
          return savedTrade.id
        },

        updateSavedTrade: async (id, partial) => {
          const savedTrade = await updateSavedTradeRequest(id, partial)
          set((s) => ({
            savedTrades: s.savedTrades.map((trade) => trade.id === id ? savedTrade : trade),
          }))
        },

        closeSavedTrade: async (id) => {
          const savedTrade = await closeSavedTradeRequest(id)
          set((s) => ({
            savedTrades: s.savedTrades.map((trade) => trade.id === id ? savedTrade : trade),
          }))
        },

        deleteSavedTrade: async (id) => {
          await deleteSavedTradeRequest(id)
          set((s) => ({
            currentSavedTradeId: s.currentSavedTradeId === id ? null : s.currentSavedTradeId,
            savedTrades: s.savedTrades.filter((trade) => trade.id !== id),
          }))
        },

        loadSavedTrade: async (id) => {
          const trade = get().savedTrades.find((savedTrade) => savedTrade.id === id)
          if (!trade) return
          const today = new Date().toISOString().slice(0, 10)
          const dte = trade.expiry
            ? Math.max(0, Math.round((new Date(trade.expiry).getTime() - new Date(today).getTime()) / 86_400_000))
            : 30
          set({
            ticker: trade.ticker,
            stockPrice: trade.stockPrice,
            legs: trade.legs.map((leg) => ({ ...leg })),
            selectedExpiry: trade.expiry,
            selectedLegId: null,
            dateProgress: 1,
            computedStats: null,
            currentSavedTradeId: trade.id,
            appPage: 'build',
            rangePercent: autoRangePercent(dte),
          })
          try {
            const { fetchExpiries, fetchOptionChain, fetchStockQuote } = await import('@/hooks/useApi')
            const [expiries, quote] = await Promise.all([
              fetchExpiries(trade.ticker),
              fetchStockQuote(trade.ticker),
            ])
            if (quote.last_price > 0) set({ stockPrice: quote.last_price })
            const chain = new Map<string, OptionContract[]>()
            if (trade.expiry) {
              const contracts = await fetchOptionChain(trade.ticker, trade.expiry)
              chain.set(trade.expiry, contracts)
              const nonZeroIvs = contracts.filter((c) => c.iv > 0)
              const avgIv = nonZeroIvs.length > 0
                ? nonZeroIvs.reduce((sum, c) => sum + c.iv, 0) / nonZeroIvs.length
                : 0.3
              set({ baseIV: avgIv })
            }
            set({ expiryDates: expiries, optionChain: chain })
          } catch {
            /* offline or backend unavailable — use BSM fallback */
          }
        },

        refreshSavedTradesPnl: async () => {
          const activeTrades = get().savedTrades.filter((t) => t.status === 'active')
          if (activeTrades.length === 0) return

          const { fetchOptionChain, fetchStockQuote } = await import('@/hooks/useApi')

          const expiryKeys = new Set<string>()
          const tickers = new Set<string>()
          for (const trade of activeTrades) {
            tickers.add(trade.ticker)
            if (trade.expiry) expiryKeys.add(`${trade.ticker}::${trade.expiry}`)
          }

          const [stockQuotes, chains] = await Promise.all([
            Promise.all(
              [...tickers].map(async (ticker) => {
                try {
                  const q = await fetchStockQuote(ticker)
                  return [ticker, q.last_price] as const
                } catch {
                  return [ticker, 0] as const
                }
              }),
            ),
            Promise.all(
              [...expiryKeys].map(async (key) => {
                const [ticker, expiry] = key.split('::')
                try {
                  const contracts = await fetchOptionChain(ticker, expiry)
                  return [key, contracts] as const
                } catch {
                  return [key, [] as OptionContract[]] as const
                }
              }),
            ),
          ])

          const priceMap = new Map(stockQuotes)
          const chainMap = new Map(chains)

          const savedTradesChain = new Map<string, OptionContract[]>()
          for (const [key, contracts] of chainMap) {
            savedTradesChain.set(key, contracts)
          }

          // Store baseline stock prices at chain-fetch time for delta adjustment
          const savedTradesChainBasePrices = new Map<string, number>()
          for (const [ticker, price] of priceMap) {
            if (price > 0) savedTradesChainBasePrices.set(ticker, price)
          }

          const r = get().riskFreeRate

          set((s) => ({
            savedTradesChain,
            savedTradesChainBasePrices,
            savedTrades: s.savedTrades.map((trade) => {
              if (trade.status !== 'active') return trade
              const contracts = trade.expiry
                ? chainMap.get(`${trade.ticker}::${trade.expiry}`) ?? []
                : []
              const stockPrice = priceMap.get(trade.ticker) ?? trade.stockPrice

              let pnl = 0
              for (const leg of trade.legs) {
                if (leg.excluded) continue
                const contract = contracts.find(
                  (c) => c.optionType === leg.optionType && Math.abs(c.strike - leg.strike) < 0.001,
                )
                let currentPrice: number
                if (contract && contract.bid > 0 && contract.ask > 0) {
                  currentPrice = (contract.bid + contract.ask) / 2
                } else if (contract && contract.last > 0) {
                  currentPrice = contract.last
                } else {
                  currentPrice = priceLeg(stockPrice, leg.strike, leg.expiry, r, 0, leg.iv, leg.optionType === 'call')
                }
                const direction = leg.direction === 'long' ? 1 : -1
                pnl += direction * (currentPrice - leg.costBasis) * leg.quantity * leg.lotSize
              }
              pnl = parseFloat(pnl.toFixed(2))
              return {
                ...trade,
                stockPrice,
                unrealizedPnl: pnl,
                returnPct: calculateReturnPct(pnl, trade.costBasis),
              }
            }),
          }))
        },

        getSavedTradeSummary: () => summarizeSavedTrades(get().savedTrades),

        getVisibleSavedTrades: () => {
          const { savedTrades, savedTradesFilter, savedTradesSort } = get()
          return filterAndSortSavedTrades(savedTrades, savedTradesFilter, savedTradesSort)
        },
      }),
      {
        name: 'optionstart-app',
        // Saved trades are stored in SQLite through the backend, not localStorage.
        partialize: (s) => ({
          savedStrategies: s.savedStrategies,
          savedTradesFilter: s.savedTradesFilter,
          savedTradesSort: s.savedTradesSort,
        }),
        merge: mergePersistedState,
      },
    ),
  ),
)
