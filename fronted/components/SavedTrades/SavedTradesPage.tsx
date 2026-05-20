import { useMemo, useEffect, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { SavedTrade, SavedTradeFilter, SavedTradeSortKey } from '../../types'
import {
  daysToExpiry,
  formatExpiry,
  formatSignedCurrency,
  savedTradesToCsv,
} from './savedTradeFormat'

const FILTERS: Array<{ label: string; value: SavedTradeFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Expired', value: 'expired' },
]

const SORT_OPTIONS: Array<{ label: string; value: SavedTradeSortKey }> = [
  { label: 'Symbol', value: 'ticker' },
  { label: 'Date', value: 'recent' },
  { label: 'Expiry', value: 'expiry' },
  { label: 'P&L', value: 'pnl' },
]

interface SavedTradesPageProps {
  onToast: (text: string, type?: 'info' | 'success' | 'error') => void
}

function downloadCsv(csv: string) {
  const href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`
  const link = document.createElement('a')
  link.href = href
  link.download = 'saved_trades.csv'
  link.click()
}

function buildSummary(savedTrades: SavedTrade[]) {
  const activeTrades = savedTrades.filter((t) => t.status === 'active')
  const resolved = savedTrades.filter((t) => t.status === 'closed' || t.status === 'expired')
  const wins = resolved.filter((t) => t.unrealizedPnl > 0)
  return {
    totalUnrealized: activeTrades.reduce((sum, t) => sum + t.unrealizedPnl, 0),
    activeCount: activeTrades.length,
    winRate: resolved.length === 0 ? 0 : (wins.length / resolved.length) * 100,
    totalSaved: savedTrades.length,
  }
}

function filterTrades(trades: SavedTrade[], filter: SavedTradeFilter): SavedTrade[] {
  if (filter === 'all') return trades
  return trades.filter((t) => t.status === filter)
}

interface TickerGroup {
  ticker: string
  trades: SavedTrade[]
}

function groupByTicker(trades: SavedTrade[], sortKey: SavedTradeSortKey): TickerGroup[] {
  const map = new Map<string, SavedTrade[]>()
  for (const trade of trades) {
    const key = trade.ticker || '—'
    const list = map.get(key)
    if (list) list.push(trade)
    else map.set(key, [trade])
  }

  for (const list of map.values()) {
    list.sort((a, b) => b.createdAt - a.createdAt)
  }

  const groups = [...map.entries()].map(([ticker, items]) => ({ ticker, trades: items }))

  if (sortKey === 'pnl') {
    groups.sort((a, b) => {
      const aPnl = a.trades.reduce((s, t) => s + t.unrealizedPnl, 0)
      const bPnl = b.trades.reduce((s, t) => s + t.unrealizedPnl, 0)
      return bPnl - aPnl
    })
  } else if (sortKey === 'expiry') {
    groups.sort((a, b) => (a.trades[0]?.expiry ?? '').localeCompare(b.trades[0]?.expiry ?? ''))
  } else if (sortKey === 'recent') {
    groups.sort((a, b) => (b.trades[0]?.createdAt ?? 0) - (a.trades[0]?.createdAt ?? 0))
  } else {
    groups.sort((a, b) => a.ticker.localeCompare(b.ticker))
  }

  return groups
}

function formatPnl(value: number, pct: number): string {
  if (value === 0 && pct === 0) return '+$0 (0%)'
  const sign = value >= 0 ? '+' : '-'
  const abs = Math.abs(value)
  const dollars = abs < 1000
    ? `$${abs.toFixed(2)}`
    : `$${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `${sign}${dollars} (${sign}${Math.abs(pct).toFixed(0)}%)`
}

function pnlColor(value: number): string {
  if (value > 0) return 'var(--green-t)'
  if (value < 0) return 'var(--red-t)'
  return 'var(--t1)'
}

function formatCreatedAt(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatDte(expiry: string | null): string {
  const days = daysToExpiry(expiry)
  if (days === null) return '—'
  const dateStr = formatExpiry(expiry)
  return `${days}d (${dateStr})`
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--t2)',
  textTransform: 'uppercase',
  letterSpacing: '.04em',
  textAlign: 'left',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--t0)',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}

function TradeActionsMenu({ trade, onOpen, onClose, onDelete }: {
  trade: SavedTrade
  onOpen: (id: string) => void
  onClose: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        style={{
          width: 24, height: 24, border: 'none', background: 'transparent',
          color: 'var(--t2)', cursor: 'pointer', fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 'var(--r4)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface3)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        ⚙
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 800 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', right: 0, top: 28, zIndex: 801,
            background: 'var(--surface)', border: '1px solid var(--border2)',
            borderRadius: 'var(--r8)', boxShadow: 'var(--shadow-lg)',
            minWidth: 140, overflow: 'hidden',
          }}>
            {[
              { label: 'Open in Build', action: () => onOpen(trade.id) },
              ...(trade.status === 'active' ? [{ label: 'Close Trade', action: () => onClose(trade.id) }] : []),
              { label: 'Delete', action: () => onDelete(trade.id), danger: true },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen(false); item.action() }}
                style={{
                  display: 'block', width: '100%', padding: '8px 14px',
                  border: 'none', background: 'transparent', textAlign: 'left',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  color: 'danger' in item && item.danger ? 'var(--red-t)' : 'var(--t1)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface2)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function SummaryBar({ trades }: { trades: SavedTrade[] }) {
  const summary = useMemo(() => buildSummary(trades), [trades])
  const tone = summary.totalUnrealized >= 0 ? 'var(--green-t)' : 'var(--red-t)'
  const items = [
    { label: 'Total Unrealized', value: formatSignedCurrency(summary.totalUnrealized), color: tone },
    { label: 'Active Positions', value: String(summary.activeCount), color: 'var(--t0)' },
    { label: 'Win Rate', value: summary.totalSaved === 0 ? '—' : `${summary.winRate.toFixed(0)}%`, color: 'var(--t0)' },
    { label: 'Total Saved', value: String(summary.totalSaved), color: 'var(--t0)' },
  ]
  return (
    <div style={{ display: 'flex', gap: 0, padding: '10px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      {items.map((item) => (
        <div key={item.label} style={{ padding: '6px 16px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{item.label}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: item.color }}>{item.value}</div>
        </div>
      ))}
    </div>
  )
}

export function SavedTradesPage({ onToast }: SavedTradesPageProps) {
  const savedTrades = useAppStore((s) => s.savedTrades)
  const savedTradesFilter = useAppStore((s) => s.savedTradesFilter)
  const savedTradesSort = useAppStore((s) => s.savedTradesSort)
  const setSavedTradesFilter = useAppStore((s) => s.setSavedTradesFilter)
  const setSavedTradesSort = useAppStore((s) => s.setSavedTradesSort)
  const loadSavedTrade = useAppStore((s) => s.loadSavedTrade)
  const closeSavedTrade = useAppStore((s) => s.closeSavedTrade)
  const deleteSavedTrade = useAppStore((s) => s.deleteSavedTrade)
  const refreshSavedTradesPnl = useAppStore((s) => s.refreshSavedTradesPnl)

  useEffect(() => { refreshSavedTradesPnl() }, [refreshSavedTradesPnl])

  const filtered = useMemo(() => filterTrades(savedTrades, savedTradesFilter), [savedTrades, savedTradesFilter])
  const groups = useMemo(() => groupByTicker(filtered, savedTradesSort), [filtered, savedTradesSort])
  const activeCount = useMemo(() => savedTrades.filter((t) => t.status === 'active').length, [savedTrades])

  const handleOpen = (id: string) => {
    const trade = savedTrades.find((t) => t.id === id)
    loadSavedTrade(id)
    onToast(trade ? `Opened: ${trade.name}` : 'Trade not found', trade ? 'success' : 'error')
  }

  const handleClose = async (id: string) => {
    try { await closeSavedTrade(id); onToast('Trade closed', 'success') }
    catch { onToast('Failed to close trade', 'error') }
  }

  const handleDelete = async (id: string) => {
    const trade = savedTrades.find((t) => t.id === id)
    if (!window.confirm(`Delete ${trade?.name ?? 'this trade'}?`)) return
    try { await deleteSavedTrade(id); onToast('Deleted', 'success') }
    catch { onToast('Failed to delete trade', 'error') }
  }

  const handleExport = () => {
    if (savedTrades.length === 0) { onToast('No trades to export', 'info'); return }
    downloadCsv(savedTradesToCsv(savedTrades))
    onToast('Exported saved_trades.csv', 'success')
  }

  return (
    <main style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Toolbar */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--t0)' }}>Saved Trades</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 500 }}>Group:</span>
          <div style={{ display: 'flex', background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: 'var(--r8)', padding: 3, gap: 1 }}>
            {FILTERS.map((f) => {
              const active = savedTradesFilter === f.value
              return (
                <button key={f.value} onClick={() => setSavedTradesFilter(f.value)} style={{
                  padding: '4px 13px', borderRadius: 'var(--r6)', border: 0,
                  background: active ? 'var(--surface)' : 'transparent',
                  color: active ? 'var(--t0)' : 'var(--t2)',
                  fontSize: 12, fontWeight: active ? 600 : 500, cursor: 'pointer',
                  boxShadow: active ? 'var(--shadow-sm)' : 'none', fontFamily: 'var(--sans)',
                }}>
                  {f.label}
                  {f.value === 'active' && (
                    <span style={{ background: 'var(--green-bg)', color: 'var(--green-t)', padding: '0 4px', borderRadius: 10, fontSize: 9, marginLeft: 4 }}>{activeCount}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 500 }}>Sort by:</span>
          <select
            value={savedTradesSort}
            onChange={(e) => setSavedTradesSort(e.target.value as SavedTradeSortKey)}
            style={{ padding: '5px 8px', background: 'var(--surface3)', border: '1px solid var(--border2)', borderRadius: 'var(--r8)', fontSize: 11, color: 'var(--t1)', cursor: 'pointer' }}
          >
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 500 }}>Show:</span>
          <select
            value={savedTradesFilter}
            onChange={(e) => setSavedTradesFilter(e.target.value as SavedTradeFilter)}
            style={{ padding: '5px 8px', background: 'var(--surface3)', border: '1px solid var(--border2)', borderRadius: 'var(--r8)', fontSize: 11, color: 'var(--t1)', cursor: 'pointer' }}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={handleExport}
          disabled={savedTrades.length === 0}
          style={{
            padding: '6px 14px', background: 'var(--red-t)', border: 'none', borderRadius: 'var(--r8)',
            fontSize: 12, fontWeight: 600, color: '#fff',
            cursor: savedTrades.length === 0 ? 'default' : 'pointer',
            opacity: savedTrades.length === 0 ? 0.5 : 1,
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          Export <span style={{ fontSize: 13 }}>↓</span>
        </button>
      </div>

      {/* Summary */}
      <SummaryBar trades={savedTrades} />

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {groups.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: 'var(--t3)', fontSize: 13, fontWeight: 500 }}>
            No saved trades yet. Go to Build and click Save.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
            <thead>
              <tr style={{ background: 'var(--surface)' }}>
                <th style={{ ...thStyle, width: '30%' }}>Name</th>
                <th style={{ ...thStyle, width: 32, padding: '8px 4px' }} />
                <th style={{ ...thStyle, textAlign: 'right' }}>Total Return</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Today&apos;s Return</th>
                <th style={thStyle}>Created At</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Days Until Expiration</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <TickerSection
                  key={group.ticker}
                  group={group}
                  onOpen={handleOpen}
                  onClose={handleClose}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  )
}

function TickerSection({ group, onOpen, onClose, onDelete }: {
  group: TickerGroup
  onOpen: (id: string) => void
  onClose: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <>
      <tr>
        <td colSpan={6} style={{
          padding: '12px 12px 6px',
          fontSize: 14, fontWeight: 700, color: 'var(--t0)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
        }}>
          {group.ticker}
        </td>
      </tr>
      {group.trades.map((trade) => (
        <TradeRow
          key={trade.id}
          trade={trade}
          onOpen={onOpen}
          onClose={onClose}
          onDelete={onDelete}
        />
      ))}
    </>
  )
}

function TradeRow({ trade, onOpen, onClose, onDelete }: {
  trade: SavedTrade
  onOpen: (id: string) => void
  onClose: (id: string) => void
  onDelete: (id: string) => void
}) {
  const color = pnlColor(trade.unrealizedPnl)
  const dte = formatDte(trade.expiry)

  return (
    <tr
      style={{ cursor: 'pointer' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      onClick={() => onOpen(trade.id)}
    >
      <td style={tdStyle}>
        <span style={{ color: 'var(--blue-t)', fontWeight: 600, fontSize: 13 }}>
          {trade.name}
        </span>
      </td>
      <td style={{ ...tdStyle, padding: '10px 4px' }} onClick={(e) => e.stopPropagation()}>
        <TradeActionsMenu trade={trade} onOpen={onOpen} onClose={onClose} onDelete={onDelete} />
      </td>
      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color }}>
        {formatPnl(trade.unrealizedPnl, trade.returnPct)}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color }}>
        {formatPnl(trade.unrealizedPnl, trade.returnPct)}
      </td>
      <td style={{ ...tdStyle, fontSize: 11, color: 'var(--t2)' }}>
        {formatCreatedAt(trade.createdAt)}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>
        {dte}
      </td>
    </tr>
  )
}
