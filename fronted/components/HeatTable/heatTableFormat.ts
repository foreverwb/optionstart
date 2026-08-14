import type { DisplayMode } from '@/types'
import type { HeatmapData } from '@/engine/bsm'

export function matrixForMode(
  data: HeatmapData,
  mode: DisplayMode,
  costBasis: number,
  maxLoss: number,
): number[][] {
  if (mode === 'contract') return data.contractValue
  if (mode === 'delta') return data.delta
  if (mode === 'theta') return data.theta
  if (mode === 'gamma') return data.gamma
  if (mode === 'vega') return data.vega
  if (mode === 'rho') return data.rho
  if (mode === 'pct') {
    const denominator = Math.abs(costBasis)
    return data.pnl.map((col) => col.map((value) => denominator > 0 ? value / denominator * 100 : 0))
  }
  if (mode === 'risk') {
    return data.pnl.map((col) => col.map((value) => maxLoss > 0 ? value / maxLoss * 100 : 0))
  }
  return data.pnl
}

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatPriceLabel(price: number): string {
  return `$${formatNumber(price, 0)}`
}

export function formatPricePercent(price: number, stockPrice: number): string {
  if (!Number.isFinite(stockPrice) || stockPrice <= 0) return '0%'
  const percentage = (price / stockPrice - 1) * 100
  if (Math.abs(percentage) < 0.05) return '0%'
  return `${formatNumber(percentage, Math.abs(percentage) < 10 ? 1 : 0)}%`
}

export function formatCell(value: number, mode: DisplayMode): string {
  if (mode === 'contract') {
    const amount = `$${formatNumber(Math.abs(value), 2)}`
    return value < 0 ? `-${amount}` : amount
  }
  if (mode === 'pct' || mode === 'risk') return `${formatNumber(value, 1)}%`
  if (['delta', 'theta', 'gamma', 'vega', 'rho'].includes(mode)) {
    return formatNumber(value, 4)
  }
  return formatNumber(value, 0)
}

export function heatColor(value: number, maxAbs: number): { background: string; color: string } {
  if (!Number.isFinite(value) || maxAbs <= 0) return { background: '#d7dbe4', color: '#050914' }
  if (Math.abs(value) < 1e-9) return { background: '#e3e5eb', color: '#050914' }
  const ratio = Math.min(1, Math.abs(value) / maxAbs)
  const strength = 0.34 + ratio * 0.66
  if (value >= 0) {
    const green = Math.round(150 + strength * 35)
    const blue = Math.round(25 + (1 - strength) * 38)
    return { background: `rgb(0, ${green}, ${blue})`, color: strength > 0.74 ? '#fff' : '#050914' }
  }
  const red = Math.round(184 + strength * 38)
  const green = Math.round((1 - strength) * 88)
  const blue = Math.round(40 + (1 - strength) * 36)
  return { background: `rgb(${red}, ${green}, ${blue})`, color: strength > 0.72 ? '#fff' : '#050914' }
}
