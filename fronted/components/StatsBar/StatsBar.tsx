import { useAppStore } from '@/store/useAppStore'
import type { ComputedStats } from '@/types'

const panelBg = '#eef3ff'

function fmtMoney(value: number, decimals = 0): string {
  return `$${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

function StatBlock({
  label,
  children,
  align = 'center',
}: {
  label: string
  children: React.ReactNode
  align?: 'left' | 'center' | 'right'
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
        justifyContent: 'center',
        gap: 6,
        minWidth: 0,
        textAlign: align,
      }}
    >
      <div
        style={{
          fontSize: 16,
          lineHeight: 1,
          fontWeight: 500,
          color: '#050914',
          letterSpacing: 0,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

function ValueLine({
  icon,
  value,
  color = '#050914',
}: {
  icon: string
  value: string
  color?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontSize: 17,
        lineHeight: 1.1,
        fontWeight: 700,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
      <span>{value}</span>
    </div>
  )
}

function breakevenText(values: number[]): React.ReactNode {
  if (values.length === 0) return '—'
  if (values.length === 1) {
    return (
      <>
        <span style={{ color: '#7c7f88', fontWeight: 400 }}>→ </span>
        Above <strong>{fmtMoney(values[0], 2)}</strong>
      </>
    )
  }

  return (
    <>
      <span style={{ color: '#7c7f88', fontWeight: 400 }}>→ </span>
      Between <strong>{fmtMoney(values[0], 2)}</strong> -<br />
      <strong>{fmtMoney(values[values.length - 1], 2)}</strong>
    </>
  )
}

function EmptyStats() {
  return (
    <div
      style={{
        height: 104,
        background: panelBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(5,9,20,.48)',
        fontSize: 15,
      }}
    >
      Select legs to build a strategy
    </div>
  )
}

interface StatsBarProps {
  onClickGreeks?: () => void
}

export function StatsBar({ onClickGreeks }: StatsBarProps) {
  void onClickGreeks
  const stats: ComputedStats | null = useAppStore((s) => s.computedStats)

  if (stats == null) return <EmptyStats />

  const isDebit = stats.netDebit >= 0
  const maxLoss = !Number.isFinite(stats.maxLoss) || stats.maxLoss > 50000
    ? 'Infinite'
    : fmtMoney(stats.maxLoss)
  const maxProfit = !Number.isFinite(stats.maxProfit) || stats.maxProfit > 50000
    ? 'Unlimited'
    : fmtMoney(stats.maxProfit)

  const pnl = stats.unrealizedPnl
  const isGain = pnl >= 0
  const pnlPct = Math.round((Math.abs(pnl) / Math.max(1, Math.abs(stats.netDebit))) * 100)
  const pnlDisplay = `${isGain ? '+' : '-'}${fmtMoney(pnl, 2)} (${pnlPct}%)`
  const pnlColor = isGain ? 'var(--green-t)' : 'var(--red-t)'

  return (
    <div
      id="stats-bar"
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr 1fr 1.1fr 1.4fr',
        alignItems: 'center',
        gap: 16,
        height: 104,
        padding: '0 56px',
        background: panelBg,
        borderBottom: 'none',
        flexShrink: 0,
        minWidth: 'max-content',
      }}
    >
      <button
        type="button"
        aria-label="Previous metric"
        style={{
          position: 'absolute',
          left: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          border: 'none',
          background: 'transparent',
          color: 'rgba(5,9,20,.34)',
          fontSize: 36,
          lineHeight: 1,
          cursor: 'default',
          padding: 0,
        }}
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="Next metric"
        style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          border: 'none',
          background: 'transparent',
          color: 'rgba(5,9,20,.34)',
          fontSize: 36,
          lineHeight: 1,
          cursor: 'default',
          padding: 0,
        }}
      >
        ›
      </button>

      <StatBlock label={isDebit ? 'Net Debit:' : 'Net Credit:'}>
        <ValueLine icon={isDebit ? '🪙' : '💰'} value={fmtMoney(stats.netDebit)} />
      </StatBlock>
      <StatBlock label="Max Loss:">
        <ValueLine icon="↘" value={maxLoss} color="#050914" />
      </StatBlock>
      <StatBlock label="Max Profit:">
        <ValueLine icon="↗" value={maxProfit} color="#050914" />
      </StatBlock>
      <StatBlock label="Chance of Profit:">
        <ValueLine icon="🎲" value={`${Math.round(stats.cop)}%`} color="#050914" />
      </StatBlock>
      <StatBlock label="Breakevens:">
        <div
          style={{
            fontSize: 17,
            lineHeight: 1.15,
            fontWeight: 500,
            color: '#050914',
            maxWidth: 270,
          }}
        >
          {breakevenText(stats.breakevens)}
        </div>
      </StatBlock>
      <StatBlock label="Unrealized Gain:" align="right">
        <ValueLine icon="💵" value={pnlDisplay} color={pnlColor} />
      </StatBlock>
    </div>
  )
}
