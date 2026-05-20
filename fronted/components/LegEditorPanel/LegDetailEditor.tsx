import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import type { Leg } from '@/types'

function CostBasisInput({ style, value, onChange }: { style: React.CSSProperties; value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const display = value.toFixed(2)
  return (
    <input
      type="text"
      inputMode="decimal"
      value={editing ? draft : display}
      onFocus={(e) => { setDraft(display); setEditing(true); requestAnimationFrame(() => e.target.select()) }}
      onChange={(e) => { if (/^-?\d*\.?\d{0,2}$/.test(e.target.value) || e.target.value === '') setDraft(e.target.value) }}
      onBlur={() => { setEditing(false); const p = parseFloat(draft); if (Number.isFinite(p)) onChange(p) }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      style={style}
    />
  )
}

export function LegDetailEditor({ leg }: { leg: Leg }) {
  const updateLeg        = useAppStore((s) => s.updateLeg)
  const removeLeg        = useAppStore((s) => s.removeLeg)
  const toggleLegExcluded = useAppStore((s) => s.toggleLegExcluded)
  const setSelectedLegId = useAppStore((s) => s.setSelectedLegId)

  const qtyBtn: React.CSSProperties = {
    width: 30, height: 30, borderRadius: 'var(--r6)',
    background: 'var(--surface3)', border: '1px solid var(--border2)',
    fontSize: 16, fontWeight: 700, color: 'var(--t1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', flexShrink: 0,
  }

  const numInput: React.CSSProperties = {
    flex: 1, background: 'var(--surface2)', border: '1.5px solid var(--border2)',
    borderRadius: 'var(--r8)', padding: '6px 10px',
    fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--t0)',
  }

  const fieldLbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--t1)',
    letterSpacing: '.04em', textTransform: 'uppercase',
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={fieldLbl}>Quantity</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={qtyBtn} onClick={() => updateLeg(leg.id, { quantity: Math.max(1, leg.quantity - 1) })}>−</button>
          <input
            style={numInput} type="number" min={1} max={100} value={leg.quantity}
            onChange={(e) => updateLeg(leg.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
          />
          <button style={qtyBtn} onClick={() => updateLeg(leg.id, { quantity: Math.min(100, leg.quantity + 1) })}>+</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={fieldLbl}>Cost Basis (per contract)</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--t2)', fontSize: 14 }}>$</span>
          <CostBasisInput style={numInput} value={leg.costBasis} onChange={(v) => updateLeg(leg.id, { costBasis: v })} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={fieldLbl}>Exclude from P&amp;L</span>
        <label style={{ position: 'relative', width: 38, height: 20, cursor: 'pointer' }}>
          <input
            type="checkbox" checked={leg.excluded}
            onChange={() => toggleLegExcluded(leg.id)}
            style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
          />
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 20, transition: '.2s',
            background: leg.excluded ? 'var(--blue)' : 'var(--surface3)',
            border: `1px solid ${leg.excluded ? 'var(--blue)' : 'var(--border2)'}`,
          }} />
          <div style={{
            position: 'absolute', top: 2, left: leg.excluded ? 20 : 2,
            width: 14, height: 14, borderRadius: '50%', transition: '.2s',
            background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)', pointerEvents: 'none',
          }} />
        </label>
      </div>

      <button
        onClick={() => { removeLeg(leg.id); setSelectedLegId(null) }}
        style={{
          width: '100%', padding: 8, borderRadius: 'var(--r8)', fontSize: 12, fontWeight: 600,
          background: 'var(--red-bg)', border: '1px solid var(--red-b)', color: 'var(--red-t)', cursor: 'pointer',
        }}
      >
        Delete This Leg
      </button>
    </div>
  )
}
