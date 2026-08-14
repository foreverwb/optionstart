import { useState } from 'react'
import type { DisplayMode, GreekDisplayMode, ViewMode } from '@/types'
import { SegBtn } from './SegBtn'

const PRIMARY_MODES: Array<{ key: DisplayMode; label: string }> = [
  { key: 'dollar', label: 'Profit / Loss $' },
  { key: 'pct', label: 'Profit / Loss %' },
  { key: 'contract', label: 'Contract Value' },
  { key: 'risk', label: '% of Max Risk' },
]

const GREEK_MODES: Array<{ key: GreekDisplayMode; label: string }> = [
  { key: 'delta', label: 'Delta Δ' },
  { key: 'theta', label: 'Theta Θ' },
  { key: 'gamma', label: 'Gamma Γ' },
  { key: 'vega', label: 'Vega ν' },
  { key: 'rho', label: 'Rho ρ' },
]

const groupStyle: React.CSSProperties = {
  display: 'flex', border: '2px solid #24a8df', borderRadius: 8,
  overflow: 'visible', background: '#fff', minWidth: 0,
}

export function DisplayControls({
  viewMode, displayMode, setViewMode, setDisplayMode,
}: {
  viewMode: ViewMode
  displayMode: DisplayMode
  setViewMode: (mode: ViewMode) => void
  setDisplayMode: (mode: DisplayMode) => void
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const greekSelected = GREEK_MODES.some(({ key }) => key === displayMode)

  const changeView = (mode: ViewMode) => {
    if (mode === 'chart' && greekSelected) setDisplayMode('dollar')
    setViewMode(mode)
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', minWidth: 0, flex: 1 }}>
      <div role="group" aria-label="Display mode" style={groupStyle}>
        <SegBtn blue active={viewMode === 'table'} onClick={() => changeView('table')}>▦ Table</SegBtn>
        <SegBtn blue active={viewMode === 'chart'} onClick={() => changeView('chart')}>▰ Graph</SegBtn>
      </div>

      <div role="group" aria-label="Display units" style={{ ...groupStyle, flex: 1 }}>
        {PRIMARY_MODES.map(({ key, label }) => (
          <div key={key} style={{ flex: 1, display: 'flex' }}>
            <SegBtn active={displayMode === key} onClick={() => setDisplayMode(key)}>
              {label}
            </SegBtn>
          </div>
        ))}
        <div style={{ position: 'relative', display: 'flex', flex: 1 }}>
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
            style={{
              flex: 1, minWidth: 98, padding: '8px 18px', border: 0, background: greekSelected ? 'var(--surface3)' : '#fff',
              color: greekSelected ? 'var(--t0)' : 'var(--t2)', fontWeight: greekSelected ? 600 : 500, fontSize: 13,
            }}
          >
            {greekSelected ? GREEK_MODES.find(({ key }) => key === displayMode)?.label : '▾ More'}
          </button>
          {moreOpen && (
            <div
              style={{
                position: 'absolute', right: 0, bottom: 'calc(100% + 6px)', zIndex: 30,
                width: 160, padding: 5, border: '1px solid var(--border2)', borderRadius: 8,
                background: '#fff', boxShadow: 'var(--shadow)',
              }}
            >
              {GREEK_MODES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setDisplayMode(key); setMoreOpen(false) }}
                  style={{
                    display: 'block', width: '100%', padding: '8px 10px', border: 0, borderRadius: 5,
                    background: displayMode === key ? 'var(--blue-bg)' : '#fff',
                    color: displayMode === key ? 'var(--blue-t)' : 'var(--t1)', textAlign: 'left', fontSize: 13,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
