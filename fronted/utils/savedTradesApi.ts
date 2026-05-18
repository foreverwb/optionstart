import type { Leg, SavedTrade, SavedTradeStatus } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8018/api'

interface SavedTradeLegPayload {
  id: string
  option_type: 'call' | 'put'
  direction: 'long' | 'short'
  quantity: number
  strike: number
  expiry: string
  cost_basis: number
  iv: number
  lot_size: number
  excluded: boolean
}

interface SavedTradePayload {
  name: string
  ticker: string
  strategy_name: string
  legs: SavedTradeLegPayload[]
  stock_price: number
  expiry: string | null
  status: SavedTradeStatus
  cost_basis: number
  max_profit: number | null
  max_loss: number | null
  unrealized_pnl: number
  return_pct: number
}

interface SavedTradeResponse extends SavedTradePayload {
  id: string
  created_at: string
  updated_at: string
}

type SavedTradeUpdate = Partial<Omit<SavedTrade, 'id' | 'createdAt' | 'updatedAt'>>

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null
}

function decodeFinite(value: number | null): number {
  return value === null ? Number.POSITIVE_INFINITY : value
}

function legToPayload(leg: Leg): SavedTradeLegPayload {
  return {
    id: leg.id,
    option_type: leg.optionType,
    direction: leg.direction,
    quantity: leg.quantity,
    strike: leg.strike,
    expiry: leg.expiry,
    cost_basis: leg.costBasis,
    iv: leg.iv,
    lot_size: leg.lotSize,
    excluded: leg.excluded,
  }
}

function legFromResponse(leg: SavedTradeLegPayload): Leg {
  return {
    id: leg.id,
    optionType: leg.option_type,
    direction: leg.direction,
    quantity: leg.quantity,
    strike: leg.strike,
    expiry: leg.expiry,
    costBasis: leg.cost_basis,
    iv: leg.iv,
    lotSize: leg.lot_size,
    excluded: leg.excluded,
  }
}

function tradeFromResponse(trade: SavedTradeResponse): SavedTrade {
  return {
    id: trade.id,
    name: trade.name,
    ticker: trade.ticker,
    strategyName: trade.strategy_name,
    legs: trade.legs.map(legFromResponse),
    stockPrice: trade.stock_price,
    createdAt: new Date(trade.created_at).getTime(),
    updatedAt: new Date(trade.updated_at).getTime(),
    expiry: trade.expiry,
    status: trade.status,
    costBasis: trade.cost_basis,
    maxProfit: decodeFinite(trade.max_profit),
    maxLoss: decodeFinite(trade.max_loss),
    unrealizedPnl: trade.unrealized_pnl,
    returnPct: trade.return_pct,
  }
}

function tradeToPayload(trade: Omit<SavedTrade, 'id' | 'createdAt' | 'updatedAt'>): SavedTradePayload {
  return {
    name: trade.name,
    ticker: trade.ticker,
    strategy_name: trade.strategyName,
    legs: trade.legs.map(legToPayload),
    stock_price: trade.stockPrice,
    expiry: trade.expiry,
    status: trade.status,
    cost_basis: trade.costBasis,
    max_profit: finiteOrNull(trade.maxProfit),
    max_loss: finiteOrNull(trade.maxLoss),
    unrealized_pnl: trade.unrealizedPnl,
    return_pct: trade.returnPct,
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${body}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function fetchSavedTrades(): Promise<SavedTrade[]> {
  const rows = await apiFetch<SavedTradeResponse[]>('/saved-trades')
  return rows.map(tradeFromResponse)
}

export async function createSavedTrade(trade: Omit<SavedTrade, 'id' | 'createdAt' | 'updatedAt'>): Promise<SavedTrade> {
  const row = await apiFetch<SavedTradeResponse>('/saved-trades', {
    method: 'POST',
    body: JSON.stringify(tradeToPayload(trade)),
  })
  return tradeFromResponse(row)
}

export async function closeSavedTradeRequest(id: string): Promise<SavedTrade> {
  const row = await apiFetch<SavedTradeResponse>(`/saved-trades/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'closed' }),
  })
  return tradeFromResponse(row)
}

export async function updateSavedTradeRequest(id: string, partial: SavedTradeUpdate): Promise<SavedTrade> {
  const body = {
    ...(partial.name !== undefined ? { name: partial.name } : {}),
    ...(partial.ticker !== undefined ? { ticker: partial.ticker } : {}),
    ...(partial.strategyName !== undefined ? { strategy_name: partial.strategyName } : {}),
    ...(partial.legs !== undefined ? { legs: partial.legs.map(legToPayload) } : {}),
    ...(partial.stockPrice !== undefined ? { stock_price: partial.stockPrice } : {}),
    ...(partial.expiry !== undefined ? { expiry: partial.expiry } : {}),
    ...(partial.status !== undefined ? { status: partial.status } : {}),
    ...(partial.costBasis !== undefined ? { cost_basis: partial.costBasis } : {}),
    ...(partial.maxProfit !== undefined ? { max_profit: finiteOrNull(partial.maxProfit) } : {}),
    ...(partial.maxLoss !== undefined ? { max_loss: finiteOrNull(partial.maxLoss) } : {}),
    ...(partial.unrealizedPnl !== undefined ? { unrealized_pnl: partial.unrealizedPnl } : {}),
    ...(partial.returnPct !== undefined ? { return_pct: partial.returnPct } : {}),
  }
  const row = await apiFetch<SavedTradeResponse>(`/saved-trades/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return tradeFromResponse(row)
}

export async function deleteSavedTradeRequest(id: string): Promise<void> {
  await apiFetch<void>(`/saved-trades/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
