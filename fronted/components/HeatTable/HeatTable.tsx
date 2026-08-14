import { useMemo } from 'react'
import type { HeatmapData } from '@/engine/bsm'
import type { DisplayMode } from '@/types'
import {
  formatCell,
  formatPriceLabel,
  formatPricePercent,
  heatColor,
  matrixForMode,
} from './heatTableFormat'

export interface ColDef {
  frac: number
  date: string
  monthLabel: string
  dayLabel: string
  weekday: string
  isEarnings: boolean
}

interface MonthGroup {
  label: string
  span: number
}

export interface HeatTableProps {
  prices: number[]
  cols: ColDef[]
  data: HeatmapData
  stockPrice: number
  displayMode: DisplayMode
  costBasis: number
  maxLoss: number
}

function buildMonthGroups(cols: ColDef[]): MonthGroup[] {
  return cols.reduce<MonthGroup[]>((groups, col) => {
    const last = groups.at(-1)
    if (last?.label === col.monthLabel) last.span += 1
    else groups.push({ label: col.monthLabel, span: 1 })
    return groups
  }, [])
}

function closestPriceIndex(prices: number[], stockPrice: number): number {
  return prices.reduce((best, price, index) =>
    Math.abs(price - stockPrice) < Math.abs(prices[best] - stockPrice) ? index : best, 0)
}

const headerCell: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 48,
  color: '#050914',
  fontWeight: 700,
}

export function HeatTable({
  prices, cols, data, stockPrice, displayMode, costBasis, maxLoss,
}: HeatTableProps) {
  const matrix = useMemo(
    () => matrixForMode(data, displayMode, costBasis, maxLoss),
    [data, displayMode, costBasis, maxLoss],
  )
  const groups = useMemo(() => buildMonthGroups(cols), [cols])
  const colorMatrix = displayMode === 'contract' ? data.pnl : matrix
  const values = colorMatrix.flat().filter(Number.isFinite)
  const maxAbs = values.length ? Math.max(...values.map(Math.abs), 1e-9) : 1
  const currentRow = prices.length ? closestPriceIndex(prices, stockPrice) : -1
  const columnTemplate = `77px repeat(${cols.length}, minmax(0, 1fr))`

  if (!cols.length || !prices.length) {
    return <div style={{ padding: 24, color: 'var(--t2)' }}>Select an expiration to view the table.</div>
  }

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#d2d6e0' }}>
      <div
        role="table"
        aria-label="Strategy profit and loss table"
        style={{
          display: 'grid', gridTemplateColumns: columnTemplate,
          gridTemplateRows: `26px 28px repeat(${prices.length}, minmax(0, 1fr))`,
          width: '100%', height: '100%', minWidth: 0,
          fontFamily: 'var(--sans)', fontSize: 'clamp(9px, 1vw, 13px)',
        }}
      >
        <div style={{ ...headerCell, background: '#d2d6e0' }} />
        {groups.map((group, index) => (
          <div
            key={`${group.label}-${index}`}
            style={{ ...headerCell, gridColumn: `span ${group.span}`, minWidth: 0, fontSize: 15, fontWeight: 500 }}
          >
            {group.label}
          </div>
        ))}

        <div style={{ ...headerCell, background: '#d2d6e0' }} />
        {cols.map((col, index) => (
          <div
            key={col.date}
            title={col.isEarnings ? 'Earnings' : undefined}
            style={{
              ...headerCell, minWidth: 0, fontSize: 13,
              color: col.isEarnings ? 'var(--amber-t)' : '#050914',
              borderLeft: index > 0 && col.weekday === 'M' ? '5px solid #edf0f6' : undefined,
            }}
          >
            <span>{col.dayLabel}</span>
            <span style={{ marginLeft: 4, fontSize: 12, fontWeight: 500 }}>{col.weekday}</span>
          </div>
        ))}

        {prices.map((price, rowIndex) => {
          const isCurrent = rowIndex === currentRow
          return (
            <div key={price} role="row" style={{ display: 'contents' }}>
              <div
                role="rowheader"
                style={{
                  minWidth: 0, minHeight: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0 5px', background: '#d2d6e0', color: '#050914',
                  fontVariantNumeric: 'tabular-nums', fontWeight: isCurrent ? 700 : 600,
                  borderTop: isCurrent ? '2px dashed rgba(5,9,20,.56)' : undefined,
                  lineHeight: 1, overflow: 'hidden',
                }}
              >
                <span>{formatPriceLabel(price)}</span>
                <span style={{ color: '#59606d', fontSize: '0.82em', fontWeight: 500 }}>
                  {formatPricePercent(price, stockPrice)}
                </span>
              </div>
              {cols.map((col, colIndex) => {
                const value = matrix[colIndex]?.[prices.length - 1 - rowIndex] ?? 0
                const colorValue = colorMatrix[colIndex]?.[prices.length - 1 - rowIndex] ?? 0
                const color = heatColor(colorValue, maxAbs)
                return (
                  <div
                    key={`${col.date}-${price}`}
                    role="cell"
                    style={{
                      minWidth: 0, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: color.background, color: color.color, fontWeight: 500,
                      fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                      borderTop: isCurrent ? '2px dashed rgba(5,9,20,.56)' : undefined,
                      borderLeft: colIndex > 0 && col.weekday === 'M' ? '5px solid rgba(237,240,246,.62)' : undefined,
                      lineHeight: 1, overflow: 'hidden',
                    }}
                  >
                    {formatCell(value, displayMode)}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
