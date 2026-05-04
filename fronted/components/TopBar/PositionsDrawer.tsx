import { useMemo } from 'react'
import { useAppStore } from '@/store/useAppStore'
import type { OptionType, PositionSide } from '@/types'

interface PositionsDrawerProps {
  open: boolean
  onClose: () => void
}

const addButtons: Array<{ label: string; type: OptionType; dir: PositionSide; call: boolean }> = [
  { label: '+ Buy Call', type: 'call', dir: 'long', call: true },
  { label: '+ Buy Put', type: 'put', dir: 'long', call: false },
  { label: '+ Sell Call', type: 'call', dir: 'short', call: true },
  { label: '+ Sell Put', type: 'put', dir: 'short', call: false },
]

export function PositionsDrawer({ open, onClose }: PositionsDrawerProps) {
  const legs = useAppStore((s) => s.legs)
  const addLeg = useAppStore((s) => s.addLeg)
  const removeLeg = useAppStore((s) => s.removeLeg)
  const setSelectedLegId = useAppStore((s) => s.setSelectedLegId)

  const subtitle = `${legs.length} leg${legs.length !== 1 ? 's' : ''}`

  const netPnl = useMemo(() => {
    return legs.reduce((sum, leg) => {
      if (leg.excluded) return sum
      const dir = leg.direction === 'long' ? 1 : -1
      return sum + dir * leg.costBasis * leg.quantity * leg.lotSize
    }, 0)
  }, [legs])

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--surface)',
        borderTop: '2px solid var(--border2)',
        boxShadow: '0 -6px 24px rgba(13,20,33,.12)',
        zIndex: 400,
        maxHeight: 300,
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform .22s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '11px 16px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t0)', display: 'flex', alignItems: 'center', gap: 8 }}>
          Positions
          <span style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 400, fontFamily: 'var(--mono)' }}>{subtitle}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--t2)' }}>
            Net Debit:{' '}
            <strong style={{ color: netPnl >= 0 ? 'var(--green-t)' : 'var(--red-t)' }}>
              {netPnl >= 0 ? '+' : ''}${Math.abs(netPnl).toFixed(0)}
            </strong>
          </span>
          <span
            onClick={onClose}
            style={{ fontSize: 18, color: 'var(--t2)', cursor: 'pointer', padding: '0 4px', borderRadius: 4, lineHeight: 1 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = 'var(--t0)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t2)' }}
          >
            ×
          </span>
        </div>
      </div>

      <div style={{ overflowY: 'auto', maxHeight: 220, padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {legs.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--t3)', padding: '12px 4px' }}>
            No legs added — use Add + to build a strategy
          </div>
        ) : (
          legs.map((leg) => {
            const dirStr = leg.direction === 'long' ? 'L' : 'S'
            const isCall = leg.optionType === 'call'
            return (
              <div
                key={leg.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r8)',
                  opacity: leg.excluded ? 0.45 : 1,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    flexShrink: 0,
                    background: isCall ? 'var(--green-bg)' : 'var(--red-bg)',
                    color: isCall ? 'var(--green-t)' : 'var(--red-t)',
                    border: `1px solid ${isCall ? 'var(--green-b)' : 'var(--red-b)'}`,
                  }}
                >
                  {dirStr} {leg.strike}{leg.optionType[0].toUpperCase()}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 11,
                    color: 'var(--t1)',
                    fontFamily: 'var(--mono)',
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {leg.expiry} &nbsp;·&nbsp; ×{leg.quantity} &nbsp;·&nbsp; cost ${leg.costBasis.toFixed(2)}
                  {leg.excluded ? <em style={{ color: 'var(--t3)' }}> [excl]</em> : null}
                </span>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={() => setSelectedLegId(leg.id)}
                    title="Edit"
                    style={{
                      padding: '3px 7px',
                      borderRadius: 'var(--r6)',
                      fontSize: 11,
                      border: '1px solid var(--border2)',
                      background: 'var(--surface3)',
                      color: 'var(--t1)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--blue-bg)'; e.currentTarget.style.color = 'var(--blue)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = 'var(--t1)' }}
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => removeLeg(leg.id)}
                    title="Remove"
                    style={{
                      padding: '3px 7px',
                      borderRadius: 'var(--r6)',
                      fontSize: 11,
                      border: '1px solid var(--border2)',
                      background: 'var(--surface3)',
                      color: 'var(--t1)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--red-bg)'; e.currentTarget.style.color = 'var(--red-t)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = 'var(--t1)' }}
                  >
                    ×
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '0 12px 10px' }}>
        {addButtons.map((btn) => (
          <button
            key={`${btn.dir}-${btn.type}`}
            onClick={() => addLeg(btn.type, btn.dir)}
            style={{
              flex: 1,
              padding: 7,
              fontSize: 11,
              fontWeight: 600,
              textAlign: 'center',
              border: `1.5px dashed ${btn.call ? 'var(--green-b)' : 'var(--red-b)'}`,
              borderRadius: 'var(--r8)',
              color: btn.call ? 'var(--green-t)' : 'var(--red-t)',
              background: 'transparent',
              cursor: 'pointer',
              transition: 'background .1s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = btn.call ? 'var(--green-bg)' : 'var(--red-bg)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  )
}
