import type { SavedTrade } from '../../types'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return value > 0 ? 'Unlimited' : '-'
  return currency.format(Math.abs(value))
}

export function formatSignedCurrency(value: number): string {
  if (!Number.isFinite(value)) return value > 0 ? '+Unlimited' : '-'
  const sign = value >= 0 ? '+' : '-'
  return `${sign}${formatCurrency(value)}`
}

export function formatReturnPct(value: number): string {
  if (!Number.isFinite(value)) return '-'
  const sign = value >= 0 ? '+' : '-'
  return `${sign}${Math.abs(value).toFixed(1)}%`
}

export function formatExpiry(expiry: string | null): string {
  if (!expiry) return '-'
  const date = new Date(`${expiry}T00:00:00`)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}

export function daysToExpiry(expiry: string | null): number | null {
  if (!expiry) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${expiry}T00:00:00`)
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86_400_000))
}

export function statusLabel(status: SavedTrade['status']): string {
  if (status === 'active') return 'active'
  if (status === 'expired') return 'expired'
  return 'closed'
}

export function tradeDotColor(trade: SavedTrade): string {
  const firstLeg = trade.legs.find((leg) => !leg.excluded) ?? trade.legs[0]
  if (!firstLeg) return 'var(--blue-t)'
  return firstLeg.direction === 'long' ? 'var(--green-t)' : 'var(--red-t)'
}

function csvCell(value: string | number | null): string {
  const raw = value === null ? '' : String(value)
  return `"${raw.replaceAll('"', '""')}"`
}

export function savedTradesToCsv(savedTrades: SavedTrade[]): string {
  const rows = [
    ['Name', 'Ticker', 'Strategy', 'Status', 'Cost Basis', 'Current P&L', 'Return %', 'Max Profit', 'Max Loss', 'Expiry', 'Created'],
    ...savedTrades.map((trade) => [
      trade.name,
      trade.ticker,
      trade.strategyName,
      trade.status,
      trade.costBasis.toFixed(2),
      trade.unrealizedPnl.toFixed(2),
      `${trade.returnPct.toFixed(1)}%`,
      Number.isFinite(trade.maxProfit) ? trade.maxProfit.toFixed(2) : 'Unlimited',
      Number.isFinite(trade.maxLoss) ? trade.maxLoss.toFixed(2) : 'Unlimited',
      trade.expiry,
      new Date(trade.createdAt).toLocaleDateString(),
    ]),
  ]
  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}
