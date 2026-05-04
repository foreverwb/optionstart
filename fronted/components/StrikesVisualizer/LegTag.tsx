import type { Leg } from '@/types'
import { formatStrike } from './formatStrike'

interface LegTagProps {
  leg: Leg
  x: number
  y: number
  onMouseDown: (e: React.MouseEvent, id: string) => void
  onClick: (e: React.MouseEvent<HTMLDivElement>, id: string) => void
  onEditClick: (e: React.MouseEvent<HTMLSpanElement>, id: string) => void
}

export function LegTag({ leg, x, y, onMouseDown, onClick, onEditClick }: LegTagProps) {
  const isCall = leg.optionType === 'call'
  const tooltip = `${leg.direction} ${leg.quantity}× ${leg.strike} ${leg.optionType.toUpperCase()} @ $${leg.costBasis.toFixed(2)}`
  const bg = isCall ? '#10a778' : '#c9002b'
  const pointerTop = leg.direction === 'short' ? -6 : undefined
  const pointerBottom = leg.direction === 'long' ? -6 : undefined

  return (
    <div
      title={tooltip}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 8px',
        borderRadius: 7,
        cursor: 'grab',
        fontFamily: 'var(--mono)',
        fontSize: 17,
        fontWeight: 800,
        userSelect: 'none',
        whiteSpace: 'nowrap',
        zIndex: 10,
        boxShadow: '0 3px 8px rgba(13,20,33,.24)',
        transition: 'box-shadow 0.12s, opacity 0.12s',
        background: bg,
        color: '#fff',
        opacity: leg.excluded ? 0.38 : 1,
      }}
      onMouseDown={(e) => onMouseDown(e, leg.id)}
      onClick={(e) => onClick(e, leg.id)}
    >
      <span
        style={{
          position: 'absolute',
          left: '50%',
          top: pointerTop,
          bottom: pointerBottom,
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: leg.direction === 'long' ? `7px solid ${bg}` : undefined,
          borderBottom: leg.direction === 'short' ? `7px solid ${bg}` : undefined,
        }}
      />
      {formatStrike(leg.strike)}{leg.optionType[0].toUpperCase()}
      <span style={{ fontSize: 11, lineHeight: 1, background: '#6ec5e9', color: '#00334d', borderRadius: '50%', width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        $
      </span>
      {(leg.quantity > 1 || leg.direction === 'short') && (
        <span style={{ position: 'absolute', left: -9, bottom: -15, fontSize: 11, background: 'rgba(0,0,0,.75)', color: '#fff', padding: '0 5px', borderRadius: 5 }}>
          ×{leg.direction === 'short' ? `-${leg.quantity}` : leg.quantity}
        </span>
      )}
      <span
        style={{ display: 'none' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.opacity = '1' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.opacity = '0.5' }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onEditClick(e, leg.id) }}
      >
        ✎
      </span>
    </div>
  )
}
