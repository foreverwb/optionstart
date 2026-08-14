import { useMemo } from 'react'
import { strategyImpliedVolatility, useAppStore } from '@/store/useAppStore'
import { DisplayControls } from './DisplayControls'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function expiryDateFromIso(iso: string): Date {
  return new Date(`${iso}T04:00:00`)
}

function interpolateDate(today: Date, expiry: Date, progress: number): Date {
  return new Date(today.getTime() + (expiry.getTime() - today.getTime()) * progress)
}

function formatDate(date: Date, daysFromToday: number): string {
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const hour = date.getHours() % 12 || 12
  const period = date.getHours() >= 12 ? 'pm' : 'am'
  return `${DAY_NAMES[date.getDay()]} ${MONTH_NAMES[date.getMonth()]} ${date.getDate()} ${hour}:${minutes}${period} (${daysFromToday}d)`
}

function fillPercent(value: number, min: number, max: number): number {
  return Math.max(0, Math.min(100, (value - min) / (max - min) * 100))
}

function sliderStyle(value: number, min: number, max: number): React.CSSProperties {
  const fill = fillPercent(value, min, max)
  return {
    flex: 1, minWidth: 180, height: 8, border: 0, borderRadius: 8, outline: 'none', cursor: 'pointer',
    appearance: 'none', WebkitAppearance: 'none',
    background: `linear-gradient(90deg, #25a9e8 0%, #25a9e8 ${fill}%, rgba(5,9,20,.22) ${fill}%, rgba(5,9,20,.22) 100%)`,
  }
}

const labelStyle: React.CSSProperties = {
  color: '#050914', fontSize: 14, whiteSpace: 'nowrap',
}

export function BottomControls() {
  const state = useAppStore()
  const today = useMemo(() => new Date(), [])
  const expiry = useMemo(
    () => state.selectedExpiry ? expiryDateFromIso(state.selectedExpiry) : today,
    [state.selectedExpiry, today],
  )
  const currentDate = useMemo(
    () => interpolateDate(today, expiry, state.dateProgress),
    [today, expiry, state.dateProgress],
  )
  const elapsedDays = Math.max(0, Math.round((currentDate.getTime() - today.getTime()) / 86_400_000))
  const remainingDays = Math.max(0, Math.round((expiry.getTime() - currentDate.getTime()) / 86_400_000))
  const ivValue = Math.round(state.ivMultiplier * 100)
  const strategyIv = strategyImpliedVolatility(state.legs, state.baseIV)
  const ivDisplay = `${(strategyIv * state.ivMultiplier * 100).toFixed(1)}%`

  return (
    <div style={{ background: '#eef3ff', borderTop: '1px solid rgba(120,130,150,.20)', padding: '12px 0' }}>
      <style>{`
        .optionstart-range::-webkit-slider-thumb { -webkit-appearance:none; width:18px; height:40px; border-radius:3px; background:#6d737a; border:0; }
        .optionstart-range::-moz-range-thumb { width:18px; height:40px; border-radius:3px; background:#6d737a; border:0; }
      `}</style>

      {state.viewMode === 'chart' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px 18px' }}>
          <span style={labelStyle}>DATE: <strong>{formatDate(currentDate, elapsedDays)}</strong></span>
          <input
            aria-label="Date" className="optionstart-range" type="range" min={0} max={100}
            value={Math.round(state.dateProgress * 100)}
            onChange={(event) => state.setDateProgress(Number(event.target.value) / 100)}
            style={sliderStyle(state.dateProgress * 100, 0, 100)}
          />
          <span style={{ ...labelStyle, minWidth: 128, textAlign: 'right' }}>
            {state.dateProgress >= 0.99 ? 'At expiration' : `${remainingDays}d remaining`}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '0 16px 20px' }}>
        <span style={labelStyle}>RANGE: <strong>±{Math.round(state.rangePercent)}%</strong></span>
        <input
          aria-label="Price range" className="optionstart-range" type="range" min={1} max={49} step={0.1}
          value={state.rangePercent} onChange={(event) => state.setRangePercent(Number(event.target.value))}
          style={sliderStyle(state.rangePercent, 1, 49)}
        />
        <span style={labelStyle}>IMPLIED VOLATILITY: <strong>{ivDisplay}</strong></span>
        <div style={{ flex: 1, minWidth: 220, position: 'relative', paddingBottom: 12 }}>
          <input
            aria-label="Implied volatility" className="optionstart-range" type="range" min={10} max={300}
            value={ivValue} onChange={(event) => state.setIvMultiplier(Number(event.target.value) / 100)}
            style={{ ...sliderStyle(ivValue, 10, 300), width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, color: '#303540', fontSize: 12 }}>
            <span style={{ marginLeft: '31%' }}>×1</span><span>×2</span><span>×3</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', padding: '0 0', alignItems: 'stretch' }}>
        <DisplayControls
          viewMode={state.viewMode} displayMode={state.displayMode}
          setViewMode={state.setViewMode} setDisplayMode={state.setDisplayMode}
        />
        {state.viewMode === 'chart' && (
          <button
            type="button" onClick={state.toggleProbDist}
            style={{ marginLeft: 10, padding: '8px 14px', border: '1px solid var(--border2)', borderRadius: 8,
              background: state.showProbDist ? 'var(--purple-bg)' : '#fff', color: 'var(--t1)' }}
          >
            〜 Prob Dist
          </button>
        )}
      </div>
    </div>
  )
}
