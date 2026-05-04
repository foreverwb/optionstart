import { useEffect, useRef } from 'react'
import type { OptionType, PositionSide } from '@/types'

interface AddPickerProps {
  open: boolean
  anchorRef: React.RefObject<HTMLButtonElement | null>
  anchorRect: DOMRect | null
  onAdd: (type: OptionType, direction: PositionSide) => void
  onClose: () => void
}

const items: Array<{ label: string; type: OptionType; dir: PositionSide; filled: boolean; call: boolean }> = [
  { label: 'Buy Call', type: 'call', dir: 'long', filled: true, call: true },
  { label: 'Buy Put', type: 'put', dir: 'long', filled: true, call: false },
  { label: 'Sell Call', type: 'call', dir: 'short', filled: false, call: true },
  { label: 'Sell Put', type: 'put', dir: 'short', filled: false, call: false },
]

export function AddPicker({ open, anchorRef, anchorRect, onAdd, onClose }: AddPickerProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchorRef.current?.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [open, anchorRef, onClose])

  if (!open || !anchorRect) return null

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: anchorRect.left,
        top: anchorRect.bottom + 6,
        zIndex: 600,
        background: 'var(--surface)',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r10)',
        boxShadow: 'var(--shadow-lg)',
        width: 158,
        overflow: 'hidden',
        animation: 'fadeUp .12s ease',
      }}
    >
      {items.map((item) => (
        <div
          key={`${item.dir}-${item.type}`}
          onClick={() => { onAdd(item.type, item.dir); onClose() }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '10px 14px',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--t0)',
            borderBottom: '1px solid var(--border)',
            cursor: 'pointer',
            transition: 'background .1s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface3)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              flexShrink: 0,
              background: item.filled ? (item.call ? 'var(--green)' : 'var(--red)') : 'transparent',
              border: item.filled ? 'none' : `2px solid ${item.call ? 'var(--green)' : 'var(--red)'}`,
            }}
          />
          {item.label}
        </div>
      ))}
    </div>
  )
}
