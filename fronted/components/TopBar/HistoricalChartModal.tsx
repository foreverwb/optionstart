import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useAppStore } from '@/store/useAppStore'

interface HistoricalChartModalProps {
  open: boolean
  onClose: () => void
}

const PERIODS = [
  { label: '10D', days: 10 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function boxMuller(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

function genHistPrices(stockPrice: number, iv: number, days: number): number[] {
  const sig = iv * 0.82 / Math.sqrt(252)
  const mu = 0.00006
  const arr = [stockPrice]
  for (let i = 1; i < days; i++) {
    arr.unshift(arr[0] * Math.exp(mu + sig * boxMuller()))
  }
  return arr
}

export function HistoricalChartModal({ open, onClose }: HistoricalChartModalProps) {
  const ticker = useAppStore((s) => s.ticker)
  const stockPrice = useAppStore((s) => s.stockPrice)
  const baseIV = useAppStore((s) => s.baseIV)
  const [period, setPeriod] = useState(30)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const prices = useMemo(() => {
    if (!open || !stockPrice) return []
    return genHistPrices(stockPrice, baseIV, period)
  }, [open, stockPrice, baseIV, period])

  const stats = useMemo(() => {
    if (prices.length < 2) return { change: 0, changePct: 0, high: 0, low: 0, hvol: 0 }
    const first = prices[0]
    const last = prices[prices.length - 1]
    const high = Math.max(...prices)
    const low = Math.min(...prices)
    const returns = prices.slice(1).map((p, i) => Math.log(p / prices[i]))
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1)
    const hvol = Math.sqrt(variance * 252) * 100
    return {
      change: last - first,
      changePct: ((last - first) / first) * 100,
      high,
      low,
      hvol,
    }
  }, [prices])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || prices.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const W = rect.width
    const H = rect.height
    const pad = { top: 20, right: 50, bottom: 30, left: 10 }

    ctx.clearRect(0, 0, W, H)

    const mn = Math.min(...prices)
    const mx = Math.max(...prices)
    const range = mx - mn || 1
    const toX = (i: number) => pad.left + (i / (prices.length - 1)) * (W - pad.left - pad.right)
    const toY = (p: number) => pad.top + (1 - (p - mn) / range) * (H - pad.top - pad.bottom)

    // grid
    ctx.strokeStyle = 'rgba(120,130,150,.15)'
    ctx.lineWidth = 1
    for (let i = 0; i < 5; i++) {
      const y = pad.top + (i / 4) * (H - pad.top - pad.bottom)
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke()
      const val = mx - (i / 4) * range
      ctx.fillStyle = 'rgba(120,130,150,.6)'
      ctx.font = '10px monospace'
      ctx.textAlign = 'left'
      ctx.fillText('$' + val.toFixed(0), W - pad.right + 4, y + 3)
    }

    // x-axis labels
    const labelCount = Math.min(6, prices.length)
    const today = new Date()
    ctx.fillStyle = 'rgba(120,130,150,.6)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.round((i / (labelCount - 1)) * (prices.length - 1))
      const d = new Date(today.getTime() - (prices.length - 1 - idx) * 86400000)
      ctx.fillText(`${MONTHS[d.getMonth()]} ${d.getDate()}`, toX(idx), H - 8)
    }

    // price line
    const up = prices[prices.length - 1] >= prices[0]
    ctx.strokeStyle = up ? '#22c55e' : '#ef4444'
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.beginPath()
    prices.forEach((p, i) => {
      const x = toX(i), y = toY(p)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    // fill
    const grad = ctx.createLinearGradient(0, pad.top, 0, H - pad.bottom)
    grad.addColorStop(0, up ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    prices.forEach((p, i) => {
      const x = toX(i), y = toY(p)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.lineTo(toX(prices.length - 1), H - pad.bottom)
    ctx.lineTo(toX(0), H - pad.bottom)
    ctx.closePath()
    ctx.fill()
  }, [prices])

  useEffect(() => { draw() }, [draw])

  if (!open) return null

  const changeColor = stats.change >= 0 ? 'var(--green-t)' : 'var(--red-t)'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 600,
        background: 'rgba(13,20,33,.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border2)',
          borderRadius: 'var(--r12)',
          width: 740,
          maxWidth: '96vw',
          maxHeight: '88vh',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t0)' }}>
            {ticker || '—'} — Historical Price
          </span>
          <span
            onClick={onClose}
            style={{ fontSize: 22, color: 'var(--t2)', cursor: 'pointer', padding: '0 4px', borderRadius: 4, lineHeight: 1 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = 'var(--t0)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t2)' }}
          >
            ×
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 24,
            padding: '10px 20px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
            overflowX: 'auto',
          }}
        >
          <StatItem label="Period Change" value={`${stats.change >= 0 ? '+' : ''}${stats.changePct.toFixed(1)}%`} color={changeColor} />
          <StatItem label="Period High" value={`$${stats.high.toFixed(2)}`} />
          <StatItem label="Period Low" value={`$${stats.low.toFixed(2)}`} />
          <StatItem label="Hist Vol (ann.)" value={`${stats.hvol.toFixed(1)}%`} />
          <StatItem label="IV vs HV" value={baseIV > 0 ? `${((baseIV * 100) / stats.hvol * 100).toFixed(0)}%` : '—'} />
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '10px 20px 6px', flexShrink: 0 }}>
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setPeriod(p.days)}
              style={{
                padding: '4px 11px',
                fontSize: 11,
                fontWeight: 500,
                borderRadius: 'var(--r6)',
                border: `1px solid ${period === p.days ? 'var(--blue-b)' : 'var(--border2)'}`,
                background: period === p.days ? 'var(--blue-bg)' : 'var(--surface3)',
                color: period === p.days ? 'var(--blue)' : 'var(--t1)',
                cursor: 'pointer',
                transition: 'all .1s',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, padding: '0 20px 16px', minHeight: 280 }}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>
      </div>
    </div>
  )
}

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: 'var(--t2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {label}
      </span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: color ?? 'var(--t0)' }}>
        {value}
      </span>
    </div>
  )
}
