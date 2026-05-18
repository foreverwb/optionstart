import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/store/useAppStore'

interface SaveTradePopoverProps {
  open: boolean
  anchorRef: React.RefObject<HTMLButtonElement | null>
  anchorRect: DOMRect | null
  onClose: () => void
  onToast: (text: string, type: 'info' | 'success' | 'error') => void
}

export function SaveTradePopover({ open, anchorRef, anchorRect, onClose, onToast }: SaveTradePopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [name, setName] = useState<string | null>(null)
  const ticker = useAppStore((s) => s.ticker)
  const legs = useAppStore((s) => s.legs)
  const savedTrades = useAppStore((s) => s.savedTrades)
  const currentSavedTradeId = useAppStore((s) => s.currentSavedTradeId)
  const saveCurrentTrade = useAppStore((s) => s.saveCurrentTrade)
  const deleteSavedTrade = useAppStore((s) => s.deleteSavedTrade)

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

  const currentSavedTrade = currentSavedTradeId
    ? savedTrades.find((trade) => trade.id === currentSavedTradeId)
    : undefined
  const isUpdatingSavedTrade = Boolean(currentSavedTrade)
  const defaultName = currentSavedTrade?.name ?? `${ticker || 'Untitled'} Trade`
  const displayName = name ?? defaultName

  const closePopover = () => {
    setName(null)
    onClose()
  }

  const handleSave = async () => {
    if (legs.length === 0) {
      onToast('No strategy legs to save', 'error')
      return
    }
    const tradeName = name?.trim() ? name.trim() : defaultName
    try {
      await saveCurrentTrade(tradeName)
      onToast(isUpdatingSavedTrade ? `Trade updated: ${tradeName}` : `Trade saved: ${tradeName}`, 'success')
      closePopover()
    } catch {
      onToast('Failed to save trade', 'error')
    }
  }

  const meta = `${legs.length} leg${legs.length !== 1 ? 's' : ''} · ${ticker || '—'}`

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        right: Math.max(8, window.innerWidth - anchorRect.right),
        top: anchorRect.bottom + 6,
        zIndex: 700,
        background: 'var(--surface)',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r12)',
        boxShadow: 'var(--shadow-lg)',
        width: 288,
        overflow: 'hidden',
        animation: 'fadeUp .15s ease',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--t0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {isUpdatingSavedTrade ? 'Update Strategy' : 'Save Strategy'}
        <span
          onClick={closePopover}
          style={{ fontSize: 18, color: 'var(--t2)', cursor: 'pointer', padding: '0 3px', borderRadius: 3, lineHeight: 1 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = 'var(--t0)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t2)' }}
        >
          ×
        </span>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t1)', letterSpacing: '.03em' }}>Strategy Name</div>
        <input
          value={displayName}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
          placeholder="e.g. QQQ Bull Call Spread"
          style={{
            width: '100%',
            background: 'var(--surface2)',
            border: '1.5px solid var(--border2)',
            borderRadius: 'var(--r8)',
            padding: '7px 10px',
            fontFamily: 'var(--mono)',
            fontSize: 12,
            color: 'var(--t0)',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--mono)', marginTop: -4 }}>{meta}</div>

        <button
          onClick={handleSave}
          style={{
            width: '100%',
            padding: 8,
            background: 'var(--blue)',
            color: '#fff',
            borderRadius: 'var(--r8)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--blue-t)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--blue)' }}
        >
          {isUpdatingSavedTrade ? 'Update Strategy' : 'Save Strategy'}
        </button>

        {savedTrades.length > 0 && (
          <>
            <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t1)', letterSpacing: '.03em', marginBottom: -2 }}>
              Recent Saves
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 110, overflowY: 'auto' }}>
              {savedTrades.slice(0, 8).map((trade) => (
                <div
                  key={trade.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 8px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r6)',
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: 11,
                      color: 'var(--t0)',
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {trade.name}
                  </span>
                  <span
                    onClick={() => {
                      deleteSavedTrade(trade.id).catch(() => onToast('Failed to delete trade', 'error'))
                    }}
                    style={{ fontSize: 12, color: 'var(--t3)', cursor: 'pointer', padding: '0 3px', flexShrink: 0 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--red-t)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t3)' }}
                  >
                    ×
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
