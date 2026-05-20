import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import type { Leg, OptionContract } from '@/types'

interface LegQuickEditPopupProps {
  legId: string | null
  anchor: { left: number; top: number } | null
  onClose: () => void
}

function formatExpiry(expiry: string): string {
  const [y, m, d] = expiry.split('-')
  return `${parseInt(m, 10)}/${parseInt(d, 10)}/${y.slice(2)}`
}

function formatGreek(value: number | undefined, decimals = 4): string {
  if (value === undefined || value === null) return '–'
  return value.toFixed(decimals)
}

function formatPct(value: number | undefined): string {
  if (value === undefined || value === null || value === 0) return '–'
  return (value * 100).toFixed(1) + '%'
}

function formatNumber(value: number | undefined): string {
  if (value === undefined || value === null) return '–'
  return value.toLocaleString()
}

function findLegContract(
  chain: Map<string, OptionContract[]>,
  leg: Leg,
): OptionContract | undefined {
  const contracts = chain.get(leg.expiry)
  if (!contracts) return undefined
  return contracts.find((c) => c.strike === leg.strike && c.optionType === leg.optionType)
}

function DataCell({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
      <span style={{ fontSize: 11, color: 'var(--t2)', fontFamily: 'var(--sans)' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: color ?? 'var(--t0)', fontFamily: 'var(--mono)' }}>{value}</span>
    </div>
  )
}

function QuantityStepper({ leg, onUpdate }: { leg: Leg; onUpdate: (partial: Partial<Pick<Leg, 'quantity' | 'direction'>>) => void }) {
  const arrowBtn: React.CSSProperties = {
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--t1)',
    background: 'var(--surface2)',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--sans)',
  }

  const displayQty = leg.direction === 'short' ? -leg.quantity : leg.quantity

  const step = (delta: number) => {
    const next = displayQty + delta
    if (next === 0) {
      onUpdate({ direction: delta > 0 ? 'long' : 'short', quantity: 1 })
    } else if (next > 0) {
      onUpdate({ direction: 'long', quantity: Math.min(99, next) })
    } else {
      onUpdate({ direction: 'short', quantity: Math.min(99, -next) })
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border2)', borderRadius: 'var(--r6)', overflow: 'hidden' }}>
      <button type="button" style={arrowBtn} onClick={() => step(-1)}>‹</button>
      <span style={{ width: 28, textAlign: 'center', fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--t0)', background: 'var(--surface)', lineHeight: '24px' }}>
        {displayQty}
      </span>
      <button type="button" style={arrowBtn} onClick={() => step(1)}>›</button>
    </div>
  )
}

function ActionItem({
  label,
  onClick,
  color,
  danger,
}: {
  label: string
  onClick: () => void
  color?: string
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        padding: '7px 12px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 500,
        color: danger ? 'var(--red-t)' : color ?? 'var(--t1)',
        fontFamily: 'var(--sans)',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface2)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {label}
    </button>
  )
}

function CostInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const display = value.toFixed(2)

  return (
    <input
      type="text"
      inputMode="decimal"
      value={editing ? draft : display}
      onFocus={(e) => {
        setDraft(display)
        setEditing(true)
        requestAnimationFrame(() => e.target.select())
      }}
      onChange={(e) => {
        const raw = e.target.value
        if (/^-?\d*\.?\d{0,2}$/.test(raw) || raw === '') setDraft(raw)
      }}
      onBlur={() => {
        setEditing(false)
        const parsed = parseFloat(draft)
        if (Number.isFinite(parsed)) onChange(parsed)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      style={{
        width: 64,
        textAlign: 'right',
        background: 'var(--surface2)',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r6)',
        padding: '3px 6px',
        fontFamily: 'var(--mono)',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--t0)',
      }}
    />
  )
}

export function LegQuickEditPopup({ legId, anchor, onClose }: LegQuickEditPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const leg = useAppStore((s) => s.legs.find((item) => item.id === legId) ?? null)
  const ticker = useAppStore((s) => s.ticker)
  const optionChain = useAppStore((s) => s.optionChain)
  const expiryDates = useAppStore((s) => s.expiryDates)
  const updateLeg = useAppStore((s) => s.updateLeg)
  const removeLeg = useAppStore((s) => s.removeLeg)
  const toggleLegExcluded = useAppStore((s) => s.toggleLegExcluded)
  const resetLegCostBasis = useAppStore((s) => s.resetLegCostBasis)
  const setSelectedLegId = useAppStore((s) => s.setSelectedLegId)

  useEffect(() => {
    if (!legId) return
    const handlePointerDown = (event: PointerEvent) => {
      const popup = popupRef.current
      if (!popup || popup.contains(event.target as Node)) return
      onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [legId, onClose])

  useEffect(() => {
    if (legId && !leg) onClose()
  }, [leg, legId, onClose])

  if (!leg || !anchor) return null

  const contract = findLegContract(optionChain, leg)
  const isCall = leg.optionType === 'call'
  const typeChar = isCall ? 'C' : 'P'
  const headerTitle = `${ticker.toUpperCase()} ${leg.strike}${typeChar} ${formatExpiry(leg.expiry)}`

  const handleSwitchType = () => {
    updateLeg(leg.id, { optionType: isCall ? 'put' : 'call' })
  }

  const handleFlipDirection = () => {
    updateLeg(leg.id, { direction: leg.direction === 'long' ? 'short' : 'long' })
  }

  const handleChangeExpiration = () => {
    const currentIdx = expiryDates.findIndex((e) => e.date === leg.expiry)
    const nextIdx = currentIdx + 1 < expiryDates.length ? currentIdx + 1 : 0
    if (expiryDates[nextIdx]) {
      updateLeg(leg.id, { expiry: expiryDates[nextIdx].date })
    }
  }

  const handleRemove = () => {
    removeLeg(leg.id)
    setSelectedLegId(null)
    onClose()
  }

  const dirLabel = leg.direction === 'long' ? 'Sell to Close' : 'Buy to Close'
  const switchLabel = isCall ? 'Switch to Put' : 'Switch to Call'

  return (
    <div
      ref={popupRef}
      style={{
        position: 'fixed',
        zIndex: 200,
        left: anchor.left,
        top: anchor.top,
        width: 280,
        background: 'var(--surface)',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r12)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface2)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t0)', fontFamily: 'var(--mono)', letterSpacing: '.02em' }}>
          {headerTitle}
        </span>
        <button type="button" onClick={onClose} style={{ width: 22, height: 22, borderRadius: 'var(--r4)', border: 'none', background: 'transparent', color: 'var(--t2)', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ×
        </button>
      </div>

      {/* Quantity + Cost Basis row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', gap: 12, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--t2)' }}>Qty</span>
          <QuantityStepper leg={leg} onUpdate={(partial) => updateLeg(leg.id, partial)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--t2)' }}>Cost</span>
          <span style={{ fontSize: 12, color: 'var(--t2)' }}>$</span>
          <CostInput value={leg.costBasis} onChange={(v) => updateLeg(leg.id, { costBasis: v })} />
          <button
            type="button"
            onClick={() => resetLegCostBasis(leg.id)}
            title="Reset to market price"
            style={{
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              background: 'transparent',
              color: 'var(--t2)',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ↻
          </button>
        </div>
      </div>

      {/* Market data grid */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <DataCell label="Bid" value={contract?.bid ? contract.bid.toFixed(2) : '–'} color="var(--green-t)" />
          <DataCell label="Ask" value={contract?.ask ? contract.ask.toFixed(2) : '–'} color="var(--red-t)" />
          <DataCell label="Volume" value={formatNumber(contract?.volume)} />
          <DataCell label="OI" value={formatNumber(contract?.openInterest)} />
          <DataCell label="IV" value={formatPct(contract?.iv ?? leg.iv)} />
          <DataCell label="Delta" value={formatGreek(contract?.delta)} />
          <DataCell label="Theta" value={formatGreek(contract?.theta)} />
          <DataCell label="Gamma" value={formatGreek(contract?.gamma)} />
          <DataCell label="Vega" value={formatGreek(contract?.vega)} />
          <DataCell label="Rho" value={formatGreek(contract?.rho)} />
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: '4px 0' }}>
        <ActionItem label={switchLabel} onClick={handleSwitchType} />
        <ActionItem label={dirLabel} onClick={handleFlipDirection} />
        <ActionItem label="Change Expiration" onClick={handleChangeExpiration} />
        <ActionItem label={leg.excluded ? 'Include' : 'Exclude'} onClick={() => toggleLegExcluded(leg.id)} />
        <ActionItem label="Remove" onClick={handleRemove} danger />
      </div>
    </div>
  )
}
