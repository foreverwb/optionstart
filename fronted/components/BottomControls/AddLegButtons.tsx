import type { OptionType, PositionSide } from '@/types'

interface AddLegButtonsProps {
  onAdd: (type: OptionType, direction: PositionSide) => void
}

const buttons: Array<{ label: string; type: OptionType; direction: PositionSide; tone: 'call' | 'put'; muted?: boolean }> = [
  { label: 'Buy Call', type: 'call', direction: 'long', tone: 'call' },
  { label: 'Buy Put', type: 'put', direction: 'long', tone: 'put' },
  { label: 'Sell Call', type: 'call', direction: 'short', tone: 'call', muted: true },
  { label: 'Sell Put', type: 'put', direction: 'short', tone: 'put', muted: true },
]

export function AddLegButtons({ onAdd }: AddLegButtonsProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>
      {buttons.map((button) => {
        const isCall = button.tone === 'call'
        return (
          <button
            key={`${button.direction}-${button.type}`}
            type="button"
            onClick={() => onAdd(button.type, button.direction)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              background: 'var(--surface3)',
              border: `1.5px solid ${isCall ? 'var(--green-b)' : 'var(--red-b)'}`,
              borderRadius: 'var(--r8)',
              fontSize: 11,
              fontWeight: 600,
              color: isCall ? 'var(--green-t)' : 'var(--red-t)',
              cursor: 'pointer',
              opacity: button.muted ? 0.72 : 1,
              whiteSpace: 'nowrap',
              fontFamily: 'var(--sans)',
            }}
          >
            + {button.label}
          </button>
        )
      })}
    </div>
  )
}
