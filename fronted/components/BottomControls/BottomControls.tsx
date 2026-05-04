import { useMemo } from 'react'
import { useAppStore } from '@/store/useAppStore'
import type { DisplayMode } from '@/types'
import { SegBtn } from './SegBtn'

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`
  const suffix = day % 10 === 1 ? 'st' : day % 10 === 2 ? 'nd' : day % 10 === 3 ? 'rd' : 'th'
  return `${day}${suffix}`
}

function formatTime(d: Date): string {
  const hours = d.getHours()
  const minutes = d.getMinutes()
  const period = hours >= 12 ? 'pm' : 'am'
  const hour12 = hours % 12 || 12
  return `${hour12}:${String(minutes).padStart(2, '0')}${period}`
}

function formatDate(d: Date, daysFromToday: number): string {
  return `${DAY_NAMES[d.getDay()]} ${MONTH_NAMES[d.getMonth()]} ${ordinal(d.getDate())} ${formatTime(d)} (${daysFromToday}d)`
}

function expiryDateFromIso(iso: string): Date {
  return new Date(`${iso}T04:00:00`)
}

function interpolateDate(today: Date, expiry: Date, progress: number): Date {
  // progress=0 -> today, progress=1 -> expiration.
  const t = today.getTime() + (expiry.getTime() - today.getTime()) * progress
  return new Date(t)
}

function fillPercent(value: number, min: number, max: number): number {
  if (max <= min) return 0
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
}

// ── Sub-components ────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 16,
  color: '#050914',
  fontFamily: 'var(--sans)',
  whiteSpace: 'nowrap',
  minWidth: 'fit-content',
  lineHeight: 1.1,
}

const strongStyle: React.CSSProperties = {
  color: '#050914',
  fontWeight: 700,
}

const dividerStyle: React.CSSProperties = {
  width: 1,
  height: 20,
  background: 'var(--border)',
  flexShrink: 0,
}

const sliderStyle: React.CSSProperties = {
  WebkitAppearance: 'none',
  appearance: 'none',
  flex: 1,
  height: 8,
  borderRadius: 8,
  outline: 'none',
  cursor: 'pointer',
  border: 'none',
}

function sliderFillStyle(value: number, min: number, max: number, extra?: React.CSSProperties): React.CSSProperties {
  const pct = fillPercent(value, min, max)
  return {
    ...sliderStyle,
    background: `linear-gradient(90deg, #25a9e8 0%, #25a9e8 ${pct}%, rgba(5,9,20,.24) ${pct}%, rgba(5,9,20,.24) 100%)`,
    ...extra,
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export function BottomControls() {
  const dateProgress = useAppStore((s) => s.dateProgress)
  const rangePercent = useAppStore((s) => s.rangePercent)
  const ivMultiplier = useAppStore((s) => s.ivMultiplier)
  const baseIV = useAppStore((s) => s.baseIV)
  const displayMode = useAppStore((s) => s.displayMode) as DisplayMode
  const viewMode = useAppStore((s) => s.viewMode)
  const showProbDist = useAppStore((s) => s.showProbDist)
  const selectedExpiry = useAppStore((s) => s.selectedExpiry)

  const setDateProgress = useAppStore((s) => s.setDateProgress)
  const setRangePercent = useAppStore((s) => s.setRangePercent)
  const setIvMultiplier = useAppStore((s) => s.setIvMultiplier)
  const setDisplayMode = useAppStore((s) => s.setDisplayMode)
  const setViewMode = useAppStore((s) => s.setViewMode)
  const toggleProbDist = useAppStore((s) => s.toggleProbDist)
  const today = useMemo(() => new Date(), [])

  const expiryDate = useMemo(() => {
    if (!selectedExpiry) return today
    return expiryDateFromIso(selectedExpiry)
  }, [selectedExpiry, today])

  // Derived date label: dateProgress=0 → today, dateProgress=1 → expiry
  const currentDate = useMemo(
    () => interpolateDate(today, expiryDate, dateProgress),
    [today, expiryDate, dateProgress],
  )

  const selectedDaysFromToday = useMemo(() => {
    const selectedMs = currentDate.getTime() - today.getTime()
    return Math.max(0, Math.round(selectedMs / 86_400_000))
  }, [currentDate, today])

  const daysRemaining = useMemo(() => {
    const rem = Math.round(
      ((expiryDate.getTime() - today.getTime()) / 86_400_000) * (1 - dateProgress),
    )
    return Math.max(0, rem)
  }, [today, expiryDate, dateProgress])

  const rightLabel = dateProgress >= 0.99 ? '(At expiration)' : `(${daysRemaining}d remaining)`

  // IV slider: min=50 (0.5×), max=300 (3.0×), value=100 (1.0×)
  const ivSliderValue = Math.round(ivMultiplier * 100)
  const ivDisplayPct = ((baseIV * ivMultiplier) * 100).toFixed(1) + '%'

  const PNL_MODES: { key: DisplayMode; label: string }[] = [
    { key: 'dollar', label: 'P&L $' },
    { key: 'pct', label: 'P&L %' },
    { key: 'risk', label: '% Risk' },
    { key: 'contract', label: 'Contract' },
  ]

  return (
    <div
      id="btm-ctrl"
      style={{
        background: '#eef3ff',
        borderTop: '1px solid rgba(120,130,150,.20)',
        padding: '10px 6px 12px',
        flexShrink: 0,
      }}
    >
      <style>
        {`
          .optionstart-range::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 18px;
            height: 40px;
            border-radius: 3px;
            background: #6d737a;
            border: none;
            box-shadow: none;
          }
          .optionstart-range::-moz-range-thumb {
            width: 18px;
            height: 40px;
            border-radius: 3px;
            background: #6d737a;
            border: none;
            box-shadow: none;
          }
        `}
      </style>
      {/* Row 1: Date slider */}
      <div
        className="ctrl-row"
        style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}
      >
        <span style={labelStyle}>
          DATE: <strong style={strongStyle}>{formatDate(currentDate, selectedDaysFromToday)}</strong>
        </span>
        <input
          className="optionstart-range"
          type="range"
          min={0}
          max={100}
          value={Math.round(dateProgress * 100)}
          onChange={(e) => setDateProgress(Number(e.target.value) / 100)}
          style={sliderFillStyle(Math.round(dateProgress * 100), 0, 100)}
        />
        <span style={{ ...labelStyle, minWidth: 156, textAlign: 'right' }}>{rightLabel}</span>
      </div>

      {/* Row 2: Range, IV, view controls */}
      <div
        className="ctrl-row"
        style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}
      >
        {/* RANGE */}
        <span style={labelStyle}>
          RANGE: <strong style={strongStyle}>±{rangePercent}%</strong>
        </span>
        <input
          className="optionstart-range"
          type="range"
          min={3}
          max={20}
          value={rangePercent}
          onChange={(e) => setRangePercent(Number(e.target.value))}
          style={sliderFillStyle(rangePercent, 3, 20, { flex: '1 1 360px', minWidth: 260 })}
        />

        <div style={dividerStyle} />

        {/* IMPLIED VOL */}
        <span style={labelStyle}>
          IMPLIED VOL: <strong style={strongStyle}>{ivDisplayPct}</strong>
        </span>
        <input
          className="optionstart-range"
          type="range"
          min={50}
          max={300}
          value={ivSliderValue}
          onChange={(e) => setIvMultiplier(Number(e.target.value) / 100)}
          style={sliderFillStyle(ivSliderValue, 50, 300, { flex: '1 1 360px', minWidth: 260 })}
        />
        {/* Scale markers */}
        {['×1', '·', '×2', '·', '×3'].map((m, i) => (
          <span
            key={i}
            style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--mono)' }}
          >
            {m}
          </span>
        ))}

        <div style={dividerStyle} />

        {/* Graph / Table toggle */}
        <div
          style={{
            display: 'flex',
            border: '1px solid var(--border2)',
            borderRadius: 'var(--r8)',
            overflow: 'hidden',
          }}
        >
          <SegBtn blue active={viewMode === 'chart'} onClick={() => setViewMode('chart')}>
            📈 Graph
          </SegBtn>
          <SegBtn blue={false} active={viewMode === 'table'} onClick={() => setViewMode('table')}>
            ⊞ Table
          </SegBtn>
        </div>

        {/* P&L display mode */}
        <div
          style={{
            display: 'flex',
            border: '1px solid var(--border2)',
            borderRadius: 'var(--r8)',
            overflow: 'hidden',
          }}
        >
          {PNL_MODES.map(({ key, label }) => (
            <SegBtn
              key={key}
              active={displayMode === key}
              onClick={() => setDisplayMode(key)}
            >
              {label}
            </SegBtn>
          ))}
        </div>

        {/* Prob Dist toggle */}
        <button
          onClick={toggleProbDist}
          style={{
            padding: '5px 12px',
            fontSize: 11,
            fontWeight: 500,
            color: showProbDist ? 'var(--purple-t, #a855f7)' : 'var(--t2)',
            background: showProbDist ? 'var(--purple-bg, rgba(168,85,247,0.12))' : 'transparent',
            border: `1px solid ${showProbDist ? 'var(--purple-b, rgba(168,85,247,0.4))' : 'var(--border2)'}`,
            borderRadius: 'var(--r8)',
            cursor: 'pointer',
            transition: 'all 0.1s',
            whiteSpace: 'nowrap',
          }}
        >
          〜 Prob Dist
        </button>

      </div>
    </div>
  )
}
