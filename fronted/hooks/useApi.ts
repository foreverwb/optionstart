import { useCallback } from 'react'
import { useAppStore } from '@/store/useAppStore'
import type { ExpiryDate, HistoricalPriceResponse, HistoryTimeframe, OptionContract } from '@/types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8018/api'

interface SearchResult {
  ticker: string
  name: string
  market: string
}

interface StockQuoteResponse {
  ticker: string
  code: string
  name: string | null
  last_price: number
  prev_close_price: number | null
}

interface ExpiryResponse {
  date: string
  days_to_expiry: number
}

interface ChainContractResponse {
  code: string
  ticker: string
  option_type: 'call' | 'put'
  strike_price: number
  expiry: string
  lot_size: number
  last_price: number | null
  bid_price: number | null
  ask_price: number | null
  volume: number | null
  open_interest: number | null
  implied_volatility: number | null
  delta: number | null
  gamma: number | null
  vega: number | null
  theta: number | null
  rho: number | null
}

interface ChainResponse {
  ticker: string
  expiry: string
  contracts: ChainContractResponse[]
  cached: boolean
}

function normalizeVolatility(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return value > 3 ? value / 100 : value
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

export async function searchTickers(query: string): Promise<SearchResult[]> {
  return apiFetch<SearchResult[]>(`/search?q=${encodeURIComponent(query)}`)
}

export async function fetchStockQuote(ticker: string): Promise<StockQuoteResponse> {
  return apiFetch<StockQuoteResponse>(`/stock/${encodeURIComponent(ticker)}`)
}

export async function fetchPriceHistory(
  codes: string[],
  timeframe: HistoryTimeframe,
  signal?: AbortSignal,
): Promise<HistoricalPriceResponse> {
  return apiFetch<HistoricalPriceResponse>('/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codes, timeframe }),
    signal,
  })
}

export async function fetchExpiries(ticker: string): Promise<ExpiryDate[]> {
  const rows = await apiFetch<ExpiryResponse[]>(`/options/${encodeURIComponent(ticker)}/expiries`)
  return rows.map((r) => ({ date: r.date, daysToExpiry: r.days_to_expiry }))
}

export async function fetchOptionChain(ticker: string, expiry: string): Promise<OptionContract[]> {
  const data = await apiFetch<ChainResponse>(
    `/options/${encodeURIComponent(ticker)}/chain?expiry=${encodeURIComponent(expiry)}`,
  )
  return data.contracts.map((c) => ({
    symbol: c.code,
    strike: c.strike_price,
    optionType: c.option_type,
    expiry: c.expiry,
    iv: normalizeVolatility(c.implied_volatility),
    lotSize: c.lot_size,
    bid: c.bid_price ?? 0,
    ask: c.ask_price ?? 0,
    last: c.last_price ?? 0,
    openInterest: c.open_interest ?? undefined,
    volume: c.volume ?? undefined,
    delta: c.delta ?? undefined,
    gamma: c.gamma ?? undefined,
    vega: c.vega ?? undefined,
    theta: c.theta ?? undefined,
    rho: c.rho ?? undefined,
  }))
}

export function useSelectTicker() {
  const setTicker = useAppStore((s) => s.setTicker)
  const addLeg = useAppStore((s) => s.addLeg)

  return useCallback(async (ticker: string) => {
    const quote = await fetchStockQuote(ticker)
    setTicker(ticker, quote.last_price, 0, 0.3)

    const expiries = await fetchExpiries(ticker)
    if (expiries.length === 0) return

    const base = expiries.find((e) => e.daysToExpiry >= 20 && e.daysToExpiry <= 45) ?? expiries[0]
    const contracts = await fetchOptionChain(ticker, base.date)

    const chain = new Map<string, OptionContract[]>()
    chain.set(base.date, contracts)

    const nonZeroIvs = contracts.filter((c) => c.iv > 0)
    const avgIv = nonZeroIvs.length > 0
      ? nonZeroIvs.reduce((sum, c) => sum + c.iv, 0) / nonZeroIvs.length
      : 0.3

    useAppStore.setState({
      expiryDates: expiries,
      optionChain: chain,
      baseIV: avgIv,
    })
    useAppStore.getState().setSelectedExpiry(base.date)

    addLeg('call', 'long')
  }, [setTicker, addLeg])
}
