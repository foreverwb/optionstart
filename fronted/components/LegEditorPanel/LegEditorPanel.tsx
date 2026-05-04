import { useAppStore } from '@/store/useAppStore'
import type { Leg, Greeks } from '@/types'
import { LegDetailEditor } from './LegDetailEditor'

// ── LegListItem ────────────────────────────────────────────────────────────────

function LegListItem({ leg, active, onClick }: { leg: Leg; active: boolean; onClick: () => void }) {
  const isCall = leg.optionType === 'call'
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
        background: active ? 'var(--blue-bg)' : 'var(--surface2)',
        border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
        borderRadius: 'var(--r8)', cursor: 'pointer', transition: '.1s all',
      }}
    >
      <span style={{
        fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
        padding: '2px 7px', borderRadius: 4,
        background: isCall ? 'var(--green-bg)' : 'var(--red-bg)',
        color: isCall ? 'var(--green-t)' : 'var(--red-t)',
        border: `1px solid ${isCall ? 'var(--green-b)' : 'var(--red-b)'}`,
      }}>
        {leg.direction === 'long' ? 'L' : 'S'} {leg.strike}{leg.optionType[0].toUpperCase()}
      </span>
      <span style={{ flex: 1, fontSize: 11, color: 'var(--t1)', fontFamily: 'var(--mono)' }}>
        qty:{leg.quantity} ${leg.costBasis.toFixed(2)}
      </span>
      {leg.excluded && <span style={{ fontSize: 10, color: 'var(--t3)' }}>excluded</span>}
    </div>
  )
}

// ── NetGreeksPanel ─────────────────────────────────────────────────────────────

function NetGreeksPanel({ greeks }: { greeks: Greeks | null }) {
  const items: { label: string; key: keyof Greeks }[] = [
    { label: 'Delta Δ', key: 'delta' },
    { label: 'Gamma Γ', key: 'gamma' },
    { label: 'Vega V', key: 'vega' },
    { label: 'Theta Θ', key: 'theta' },
    { label: 'Rho ρ', key: 'rho' },
    { label: 'IV', key: 'iv' },
  ]

  return (
    <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t1)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>
        ⚗️ Net Greeks
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {items.map(({ label, key }) => {
          const val = greeks?.[key] ?? null
          const display = val === null ? '—' : key === 'iv' ? (val * 100).toFixed(1) + '%' : val.toFixed(4)
          const color = val === null ? 'var(--t0)' : val > 0 ? 'var(--green-t)' : val < 0 ? 'var(--red-t)' : 'var(--t0)'
          return (
            <div key={key} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r8)', padding: '8px 10px' }}>
              <div style={{ fontSize: 10, color: 'var(--t2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, marginTop: 1, color }}>{display}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── LegEditorPanel ─────────────────────────────────────────────────────────────

export interface LegEditorPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function LegEditorPanel({ isOpen, onClose }: LegEditorPanelProps) {
  const legs              = useAppStore((s) => s.legs)
  const selectedLegId    = useAppStore((s) => s.selectedLegId)
  const computedStats    = useAppStore((s) => s.computedStats)
  const commission       = useAppStore((s) => s.commissionPerContract)
  const savedStrategies  = useAppStore((s) => s.savedStrategies)
  const ticker           = useAppStore((s) => s.ticker)

  const addLeg              = useAppStore((s) => s.addLeg)
  const setSelectedLegId    = useAppStore((s) => s.setSelectedLegId)
  const setCommission       = useAppStore((s) => s.setCommission)
  const saveCurrentStrategy = useAppStore((s) => s.saveCurrentStrategy)
  const deleteSavedStrategy = useAppStore((s) => s.deleteSavedStrategy)
  const loadSavedStrategy   = useAppStore((s) => s.loadSavedStrategy)

  const selectedLeg = legs.find((l) => l.id === selectedLegId) ?? null

  const addBtn = (isCall: boolean): React.CSSProperties => ({
    flex: 1, minWidth: 100, padding: '7px 10px', fontSize: 11, fontWeight: 600,
    borderRadius: 'var(--r8)', background: 'transparent', cursor: 'pointer', textAlign: 'center',
    border: `1.5px dashed ${isCall ? 'var(--green-b)' : 'var(--red-b)'}`,
    color: isCall ? 'var(--green-t)' : 'var(--red-t)',
  })

  const savedEntries = Object.entries(savedStrategies).slice(0, 20)

  function handleSave() {
    const name = legs.length
      ? `${ticker || 'Strategy'} ${legs.map((l) => (l.direction === 'long' ? 'L' : 'S') + l.strike + l.optionType[0].toUpperCase()).join('/')}`
      : `Strategy ${Date.now()}`
    saveCurrentStrategy(name)
  }

  return (
    <div
      id="leg-editor"
      style={{
        position: 'fixed', right: 0, top: 50, width: 260,
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)', zIndex: 150,
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform .22s ease',
        display: 'flex', flexDirection: 'column',
        maxHeight: 'calc(100vh - 50px)', overflowY: 'auto',
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 5,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t0)' }}>Edit Legs</span>
        <button onClick={onClose} style={{ fontSize: 18, color: 'var(--t2)', cursor: 'pointer', lineHeight: 1, padding: '2px 5px', borderRadius: 4, background: 'transparent', border: 'none' }}>×</button>
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {legs.map((leg) => (
          <LegListItem
            key={leg.id} leg={leg} active={leg.id === selectedLegId}
            onClick={() => setSelectedLegId(leg.id === selectedLegId ? null : leg.id)}
          />
        ))}
      </div>

      <div style={{ padding: '0 16px 16px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button style={addBtn(true)}  onClick={() => addLeg('call', 'long')}>+ Buy Call</button>
        <button style={addBtn(false)} onClick={() => addLeg('put',  'long')}>+ Buy Put</button>
        <button style={addBtn(true)}  onClick={() => addLeg('call', 'short')}>+ Sell Call</button>
        <button style={addBtn(false)} onClick={() => addLeg('put',  'short')}>+ Sell Put</button>
      </div>

      {selectedLeg && (
        <div style={{ padding: '0 16px 16px' }}>
          <LegDetailEditor leg={selectedLeg} />
        </div>
      )}

      <NetGreeksPanel greeks={computedStats?.netGreeks ?? null} />

      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t1)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>💸 Commission</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--t2)' }}>Per contract:</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--t2)' }}>$</span>
          <input
            type="number" step={0.01} min={0} placeholder="0.65" value={commission}
            onChange={(e) => setCommission(parseFloat(e.target.value) || 0)}
            style={{ width: 70, background: 'var(--surface2)', border: '1.5px solid var(--border2)', borderRadius: 'var(--r6)', padding: '4px 8px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--t0)' }}
          />
          <span style={{ fontSize: 11, color: 'var(--t2)' }}>/ leg</span>
        </div>
      </div>

      <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t1)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>💾 Saved Strategies</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
          {savedEntries.length === 0
            ? <div style={{ fontSize: 11, color: 'var(--t3)', padding: '4px 0' }}>No saved strategies</div>
            : savedEntries.map(([name]) => (
              <div
                key={name} onClick={() => loadSavedStrategy(name)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r6)', cursor: 'pointer' }}
              >
                <div style={{ flex: 1, fontSize: 11, color: 'var(--t0)', fontWeight: 500 }}>{name}</div>
                <span
                  onClick={(e) => { e.stopPropagation(); deleteSavedStrategy(name) }}
                  style={{ fontSize: 12, color: 'var(--t3)', cursor: 'pointer', padding: '0 2px' }}
                >×</span>
              </div>
            ))
          }
        </div>
        {legs.length > 0 && (
          <button
            onClick={handleSave}
            style={{ marginTop: 8, width: '100%', padding: '6px 10px', borderRadius: 'var(--r8)', fontSize: 11, fontWeight: 600, background: 'var(--blue-bg)', border: '1px solid var(--blue-b)', color: 'var(--blue-t)', cursor: 'pointer' }}
          >
            💾 Save Current Strategy
          </button>
        )}
      </div>
    </div>
  )
}
