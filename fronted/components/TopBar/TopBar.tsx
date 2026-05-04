import { useRef, useState, useCallback } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Logo } from './Logo'
import { NavPills } from './NavPills'
import { LiveDot } from './LiveDot'
import { TickerSearch } from './TickerSearch'
import { AddPicker } from './AddPicker'
import { PositionsDrawer } from './PositionsDrawer'
import { SaveTradePopover } from './SaveTradePopover'
import { HistoricalChartModal } from './HistoricalChartModal'
import type { AppPage } from '../../types'

interface TopBarProps {
  activePage: AppPage
  onPageChange: (page: AppPage) => void
  onOpenStrategyModal?: () => void
  onToast?: (text: string, type: 'info' | 'success' | 'error') => void
  liveConnected?: boolean
  liveLatency?: number
}

const btnActStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: '6px 12px',
  background: 'var(--blue)',
  color: '#fff',
  borderRadius: 'var(--r8)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  border: 'none',
  transition: 'all 0.12s',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  fontFamily: 'var(--sans)',
}

const hoverIn = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'var(--blue-t)' }
const hoverOut = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'var(--blue)' }

export function TopBar({
  activePage,
  onPageChange,
  onOpenStrategyModal,
  onToast,
  liveConnected = false,
  liveLatency = 0,
}: TopBarProps) {
  const legsCount = useAppStore((s) => s.legs.length)
  const addLeg = useAppStore((s) => s.addLeg)

  const addBtnRef = useRef<HTMLButtonElement>(null)
  const saveBtnRef = useRef<HTMLButtonElement>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [posOpen, setPosOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [histOpen, setHistOpen] = useState(false)
  const [addAnchorRect, setAddAnchorRect] = useState<DOMRect | null>(null)
  const [saveAnchorRect, setSaveAnchorRect] = useState<DOMRect | null>(null)

  const handleToast = useCallback((text: string, type: 'info' | 'success' | 'error') => {
    onToast?.(text, type)
  }, [onToast])

  return (
    <>
      <div
        id="topbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 16px',
          height: 50,
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
          flexShrink: 0,
          zIndex: 90,
          position: 'relative',
        }}
      >
        <Logo />
        <NavPills activePage={activePage} onPageChange={onPageChange} />

        <div style={{ flex: 1 }} />

        <LiveDot connected={liveConnected} latency={liveLatency} />
        <TickerSearch />

        <button
          onClick={onOpenStrategyModal}
          style={{
            padding: '6px 12px',
            background: 'var(--surface3)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r8)',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--t1)',
            cursor: 'pointer',
            transition: 'all 0.12s',
            fontFamily: 'var(--sans)',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--t0)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = 'var(--t1)' }}
        >
          ⊞ Strategy
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        <button
          ref={addBtnRef}
          onClick={(e) => {
            setAddAnchorRect(e.currentTarget.getBoundingClientRect())
            setAddOpen((v) => !v)
          }}
          style={btnActStyle}
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
        >
          <span style={{ fontSize: 13, lineHeight: 1 }}>＋</span>Add
        </button>

        <button onClick={() => setPosOpen((v) => !v)} style={btnActStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>☰</span>Positions
          <span style={{ background: 'rgba(255,255,255,.25)', borderRadius: 20, padding: '0 5px', fontSize: 10, fontWeight: 700, minWidth: 16, textAlign: 'center', lineHeight: '16px' }}>
            {legsCount}
          </span>
        </button>

        <button
          ref={saveBtnRef}
          onClick={(e) => {
            setSaveAnchorRect(e.currentTarget.getBoundingClientRect())
            setSaveOpen((v) => !v)
          }}
          style={btnActStyle}
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
        >
          <span style={{ fontSize: 13, lineHeight: 1 }}>🖫</span>Save Trade
        </button>

        <button onClick={() => setHistOpen(true)} style={btnActStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>↺</span>Historical Chart
        </button>
      </div>

      <AddPicker
        open={addOpen}
        anchorRef={addBtnRef}
        anchorRect={addAnchorRect}
        onAdd={addLeg}
        onClose={() => setAddOpen(false)}
      />
      <PositionsDrawer open={posOpen} onClose={() => setPosOpen(false)} />
      <SaveTradePopover
        open={saveOpen}
        anchorRef={saveBtnRef}
        anchorRect={saveAnchorRect}
        onClose={() => setSaveOpen(false)}
        onToast={handleToast}
      />
      <HistoricalChartModal open={histOpen} onClose={() => setHistOpen(false)} />
    </>
  )
}
