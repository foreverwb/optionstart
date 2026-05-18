import { useMemo } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { SavedTradeFilter, SavedTradeSortKey } from '../../types'
import { SavedTradeCard } from './SavedTradeCard'
import { formatSignedCurrency, savedTradesToCsv } from './savedTradeFormat'

const FILTERS: Array<{ label: string; value: SavedTradeFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Expired', value: 'expired' },
]

interface SavedTradesPageProps {
  onToast: (text: string, type?: 'info' | 'success' | 'error') => void
}

function SummaryCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'positive' | 'negative'
}) {
  const color = tone === 'positive' ? 'var(--green-t)' : tone === 'negative' ? 'var(--red-t)' : 'var(--t0)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 16px', borderRight: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function downloadCsv(csv: string) {
  const href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`
  const link = document.createElement('a')
  link.href = href
  link.download = 'saved_trades.csv'
  link.click()
}

function buildSummary(savedTrades: ReturnType<typeof useAppStore.getState>['savedTrades']) {
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

function buildVisibleTrades(
  savedTrades: ReturnType<typeof useAppStore.getState>['savedTrades'],
  filter: SavedTradeFilter,
  sortKey: SavedTradeSortKey,
) {
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

export function SavedTradesPage({ onToast }: SavedTradesPageProps) {
  const savedTrades = useAppStore((s) => s.savedTrades)
  const savedTradesFilter = useAppStore((s) => s.savedTradesFilter)
  const savedTradesSort = useAppStore((s) => s.savedTradesSort)
  const setSavedTradesFilter = useAppStore((s) => s.setSavedTradesFilter)
  const setSavedTradesSort = useAppStore((s) => s.setSavedTradesSort)
  const loadSavedTrade = useAppStore((s) => s.loadSavedTrade)
  const closeSavedTrade = useAppStore((s) => s.closeSavedTrade)
  const deleteSavedTrade = useAppStore((s) => s.deleteSavedTrade)
  const summary = useMemo(() => buildSummary(savedTrades), [savedTrades])
  const visibleTrades = useMemo(
    () => buildVisibleTrades(savedTrades, savedTradesFilter, savedTradesSort),
    [savedTrades, savedTradesFilter, savedTradesSort],
  )
  const activeCount = summary.activeCount
  const pnlTone = summary.totalUnrealized >= 0 ? 'positive' : 'negative'

  const handleExport = () => {
    if (savedTrades.length === 0) {
      onToast('No trades to export', 'info')
      return
    }
    downloadCsv(savedTradesToCsv(savedTrades))
    onToast('Exported saved_trades.csv', 'success')
  }

  const handleOpen = (id: string) => {
    const trade = savedTrades.find((item) => item.id === id)
    loadSavedTrade(id)
    onToast(trade ? `Opened: ${trade.name}` : 'Trade not found', trade ? 'success' : 'error')
  }

  const handleClose = async (id: string) => {
    try {
      await closeSavedTrade(id)
      onToast('Trade closed', 'success')
    } catch {
      onToast('Failed to close trade', 'error')
    }
  }

  const handleDelete = async (id: string) => {
    const trade = savedTrades.find((item) => item.id === id)
    if (!window.confirm(`Delete ${trade?.name ?? 'this trade'}?`)) return
    try {
      await deleteSavedTrade(id)
      onToast('Deleted', 'success')
    } catch {
      onToast('Failed to delete trade', 'error')
    }
  }

  return (
    <main style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--t0)' }}>Saved Trades</h2>
        <div style={{ display: 'flex', background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: 'var(--r8)', padding: 3, gap: 1 }}>
          {FILTERS.map((filter) => {
            const active = savedTradesFilter === filter.value
            return (
              <button
                key={filter.value}
                onClick={() => setSavedTradesFilter(filter.value)}
                style={{
                  padding: '4px 13px',
                  borderRadius: 'var(--r6)',
                  border: 0,
                  background: active ? 'var(--surface)' : 'transparent',
                  color: active ? 'var(--t0)' : 'var(--t2)',
                  fontSize: 12,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  boxShadow: active ? 'var(--shadow-sm)' : 'none',
                  fontFamily: 'var(--sans)',
                }}
              >
                {filter.label}
                {filter.value === 'active' && (
                  <span style={{ background: 'var(--green-bg)', color: 'var(--green-t)', padding: '0 4px', borderRadius: 10, fontSize: 9, marginLeft: 4 }}>
                    {activeCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <select
          value={savedTradesSort}
          onChange={(event) => setSavedTradesSort(event.target.value as SavedTradeSortKey)}
          style={{ padding: '5px 8px', background: 'var(--surface3)', border: '1px solid var(--border2)', borderRadius: 'var(--r8)', fontSize: 11, color: 'var(--t1)', cursor: 'pointer' }}
        >
          <option value="recent">Sort: Date ↓</option>
          <option value="ticker">Sort: Ticker</option>
          <option value="expiry">Sort: Expiry</option>
          <option value="pnl">Sort: P&L</option>
        </select>

        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={handleExport}
          disabled={savedTrades.length === 0}
          style={{ padding: '6px 12px', background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: 'var(--r8)', fontSize: 12, fontWeight: 500, color: savedTrades.length === 0 ? 'var(--t3)' : 'var(--t1)', cursor: savedTrades.length === 0 ? 'default' : 'pointer', fontFamily: 'var(--sans)' }}
        >
          Export CSV
        </button>
      </div>

      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '10px 16px', display: 'flex', gap: 0, flexShrink: 0 }}>
        <SummaryCard label="Total Unrealized" value={formatSignedCurrency(summary.totalUnrealized)} tone={pnlTone} />
        <SummaryCard label="Active Positions" value={String(summary.activeCount)} />
        <SummaryCard label="Win Rate" value={summary.totalSaved === 0 ? '-' : `${summary.winRate.toFixed(0)}%`} />
        <SummaryCard label="Total Saved" value={String(summary.totalSaved)} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visibleTrades.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--t3)', padding: 40 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>No saved trades yet. Go to Build and click Save.</div>
          </div>
        ) : (
          visibleTrades.map((trade) => (
            <SavedTradeCard
              key={trade.id}
              trade={trade}
              onOpen={handleOpen}
              onClose={handleClose}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </main>
  )
}
