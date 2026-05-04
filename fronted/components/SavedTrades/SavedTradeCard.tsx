import type { SavedTrade } from '../../types'
import {
  daysToExpiry,
  formatCurrency,
  formatExpiry,
  formatReturnPct,
  formatSignedCurrency,
  statusLabel,
  tradeDotColor,
} from './savedTradeFormat'

interface SavedTradeCardProps {
  trade: SavedTrade
  onOpen: (id: string) => void
  onClose: (id: string) => void
  onDelete: (id: string) => void
}

function TradeStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '4px 14px', borderRight: '1px solid var(--border)', minWidth: 80 }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: color ?? 'var(--t0)' }}>
        {value}
      </div>
    </div>
  )
}

function ActionButton({
  children,
  onClick,
  tone = 'default',
  disabled = false,
}: {
  children: string
  onClick: () => void
  tone?: 'default' | 'primary' | 'danger'
  disabled?: boolean
}) {
  const background = tone === 'primary' ? 'var(--blue)' : tone === 'danger' ? 'var(--red-bg)' : 'var(--surface)'
  const color = tone === 'primary' ? '#fff' : tone === 'danger' ? 'var(--red-t)' : 'var(--t1)'
  const borderColor = tone === 'primary' ? 'var(--blue)' : tone === 'danger' ? 'var(--red-b)' : 'var(--border)'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 11px',
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 'var(--r6)',
        cursor: disabled ? 'default' : 'pointer',
        border: `1px solid ${borderColor}`,
        background,
        color: disabled ? 'var(--t3)' : color,
        opacity: disabled ? 0.7 : 1,
        fontFamily: 'var(--sans)',
      }}
    >
      {children}
    </button>
  )
}

export function SavedTradeCard({ trade, onOpen, onClose, onDelete }: SavedTradeCardProps) {
  const pnlTone = trade.unrealizedPnl >= 0 ? 'var(--green-t)' : 'var(--red-t)'
  const expiryDays = daysToExpiry(trade.expiry)
  const opacity = trade.status === 'expired' ? 0.6 : 1
  const statusBg = trade.status === 'active' ? 'var(--green-bg)' : trade.status === 'closed' ? 'var(--blue-bg)' : 'var(--surface3)'
  const statusColor = trade.status === 'active' ? 'var(--green-t)' : trade.status === 'closed' ? 'var(--blue-t)' : 'var(--t2)'

  return (
    <article style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--r12)', overflow: 'hidden', opacity }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px' }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: tradeDotColor(trade), flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13, color: 'var(--t0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {trade.name}
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, padding: '2px 7px', background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: 'var(--r4)', color: 'var(--t1)' }}>
          {trade.ticker || '-'}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: statusBg, color: statusColor, border: '1px solid var(--border)' }}>
          {statusLabel(trade.status)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '0 14px 11px', flexWrap: 'wrap' }}>
        <TradeStat label="P&L" value={formatSignedCurrency(trade.unrealizedPnl)} color={pnlTone} />
        <TradeStat label="Return %" value={formatReturnPct(trade.returnPct)} color={pnlTone} />
        <TradeStat label="Cost Basis" value={`${trade.costBasis >= 0 ? 'Debit' : 'Credit'} ${formatCurrency(trade.costBasis)}`} />
        <TradeStat label="Max Profit" value={formatSignedCurrency(Math.max(0, trade.maxProfit))} color="var(--green-t)" />
        <TradeStat label="Max Loss" value={`-${formatCurrency(trade.maxLoss)}`} color="var(--red-t)" />
        <TradeStat label="Expiry" value={`${formatExpiry(trade.expiry)}${expiryDays ? ` (${expiryDays}d)` : ''}`} />
        <TradeStat label="Strategy" value={trade.strategyName} color="var(--t1)" />
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderTop: '1px solid var(--border)', background: 'var(--surface3)' }}>
        <ActionButton tone="primary" onClick={() => onOpen(trade.id)}>Open in Build</ActionButton>
        <ActionButton onClick={() => onClose(trade.id)} disabled={trade.status !== 'active'}>Close Trade</ActionButton>
        <ActionButton tone="danger" onClick={() => onDelete(trade.id)}>Delete</ActionButton>
      </div>
    </article>
  )
}
