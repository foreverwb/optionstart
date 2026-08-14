import { useEffect, useRef } from 'react'
import {
  Chart,
  type ChartConfiguration,
  type Plugin,
  LineElement,
  PointElement,
  LineController,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import type { DisplayMode } from '@/types'

Chart.register(
  LineElement,
  PointElement,
  LineController,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend,
)

export interface PnlChartProps {
  prices: number[]
  pnl: number[]
  expiryPnl: number[]
  ticker: string
  stockPrice: number
  displayMode: DisplayMode
  costBasis: number
  maxLoss: number
  breakevens?: number[]
  daysToExpiry?: number
  isAtExpiration?: boolean
  showProbDist?: boolean
  probDistParams?: { mu: number; sigma: number }
}

const PANEL_BG = '#eef3ff'
const GRID = 'rgba(5,9,20,.10)'
const AXIS = '#050914'
const BLUE = '#159bed'
const PROB_BLUE = 'rgba(103,178,238,.34)'
const GREEN = '#0ec441'
const RED = '#d8062f'
const ORANGE = '#d36b12'
const ZERO_LINE_COLOR = '#e08a29'
const GREEN_LIGHT = 'rgba(14,196,65,.55)'
const RED_LIGHT = 'rgba(216,6,47,.55)'
const ORANGE_LIGHT = 'rgba(211,107,18,.55)'

const SQRT2PI = Math.sqrt(2 * Math.PI)

function transformY(value: number, mode: DisplayMode, costBasis: number, maxLoss: number): number {
  switch (mode) {
    case 'pct':
      return costBasis !== 0 ? (value / Math.abs(costBasis)) * 100 : value
    case 'risk':
      return maxLoss > 0 ? (value / maxLoss) * 100 : value
    case 'contract':
      return value / 100
    default:
      return value
  }
}

function fmtAxisY(value: number, mode: DisplayMode): string {
  if (mode === 'pct') return `${value.toFixed(1)}%`
  if (mode === 'risk') return `${value.toFixed(0)}%`
  if (mode === 'contract') return `$${value.toFixed(2)}`
  if (value < 0) return `-$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function fmtHoverPnl(value: number, mode: DisplayMode): string {
  if (mode === 'pct') return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
  if (mode === 'risk') return `${value >= 0 ? '+' : ''}${value.toFixed(0)}%`
  if (mode === 'contract') return value >= 0 ? `+$${value.toFixed(2)}` : `-$${Math.abs(value).toFixed(2)}`
  return value >= 0
    ? `+$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `-$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function normalCdf(value: number): number {
  const sign = value < 0 ? -1 : 1
  const x = Math.abs(value) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return 0.5 * (1 + sign * y)
}

function lognormalCdf(price: number, mu: number, sigma: number): number {
  if (price <= 0 || sigma <= 0) return 0
  return normalCdf((Math.log(price) - mu) / sigma)
}

function lognormalPdf(x: number, mu: number, sigma: number): number {
  if (x <= 0 || sigma <= 0) return 0
  const z = (Math.log(x) - mu) / sigma
  return Math.exp(-0.5 * z * z) / (x * sigma * SQRT2PI)
}

function nearestIndex(prices: number[], value: number): number {
  if (prices.length === 0) return 0
  return prices.reduce((best, price, idx) =>
    Math.abs(price - value) < Math.abs(prices[best] - value) ? idx : best,
  0)
}

// ── Chart.js Plugins ─────────────────────────────────────────────────────────

function makeZeroLinePlugin(): Plugin {
  return {
    id: 'zeroLine',
    afterDraw(chart) {
      const { ctx, scales } = chart
      const y = scales.y
      const x = scales.x
      if (!y || !x) return
      const yZero = y.getPixelForValue(0)
      ctx.save()
      ctx.strokeStyle = ZERO_LINE_COLOR
      ctx.lineWidth = 1.5
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(x.left, yZero)
      ctx.lineTo(x.right, yZero)
      ctx.stroke()
      ctx.restore()
    },
  }
}

function makePriceMarkersPlugin(prices: number[], stockPrice: number, breakevens: number[]): Plugin {
  return {
    id: 'priceMarkers',
    afterDraw(chart) {
      const { ctx, scales } = chart
      const y = scales.y
      const x = scales.x
      if (!y || !x || prices.length === 0) return

      ctx.save()

      // Current stock price - dashed line
      const currentX = x.getPixelForValue(nearestIndex(prices, stockPrice))
      ctx.strokeStyle = AXIS
      ctx.lineWidth = 1
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.moveTo(currentX, y.top)
      ctx.lineTo(currentX, y.bottom)
      ctx.stroke()

      // Stock price label at bottom
      ctx.setLineDash([])
      ctx.fillStyle = AXIS
      ctx.font = '600 11px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`$${stockPrice.toFixed(2)}`, currentX, y.bottom + 16)

      // Breakeven markers - blue vertical lines (full height like optionstrat)
      ctx.strokeStyle = BLUE
      ctx.fillStyle = BLUE
      ctx.lineWidth = 1
      ctx.font = '600 12px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      for (const breakeven of breakevens) {
        if (breakeven < prices[0] || breakeven > prices[prices.length - 1]) continue
        const beX = x.getPixelForValue(nearestIndex(prices, breakeven))
        ctx.setLineDash([])
        ctx.globalAlpha = 0.6
        ctx.beginPath()
        ctx.moveTo(beX, y.top)
        ctx.lineTo(beX, y.bottom)
        ctx.stroke()
        ctx.globalAlpha = 1.0
        ctx.fillText(`$${breakeven.toFixed(2)}`, beX, y.top + 14)
      }
      ctx.restore()
    },
  }
}

function makeLegendPlugin(
  daysToExpiry: number | undefined,
  showProjected: boolean,
  showProbDist: boolean,
): Plugin {
  return {
    id: 'optionstratLegend',
    afterDraw(chart) {
      const { ctx, chartArea } = chart
      if (!chartArea) return
      const left = chartArea.left + 14
      let top = chartArea.top + 12

      ctx.save()

      // Expiry line legend
      ctx.strokeStyle = AXIS
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(left, top + 4)
      ctx.lineTo(left + 42, top + 4)
      ctx.stroke()

      ctx.fillStyle = AXIS
      ctx.font = '500 13px Inter, system-ui, sans-serif'
      ctx.textAlign = 'left'
      const dte = daysToExpiry === undefined ? '' : ` (${daysToExpiry}d)`
      ctx.fillText(`Expiration${dte}`, left + 52, top + 8)

      // Projected line legend
      if (showProjected) {
        top += 22
        ctx.strokeStyle = 'rgba(5,9,20,.45)'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        ctx.moveTo(left, top + 4)
        ctx.lineTo(left + 42, top + 4)
        ctx.stroke()

        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(5,9,20,.6)'
        ctx.font = '500 13px Inter, system-ui, sans-serif'
        ctx.fillText('Projected P&L', left + 52, top + 8)
      }

      // Probability distribution legend
      if (showProbDist) {
        top += 22
        ctx.beginPath()
        ctx.moveTo(left + 4, top + 14)
        ctx.bezierCurveTo(left + 12, top, left + 30, top, left + 38, top + 14)
        ctx.closePath()
        ctx.fillStyle = 'rgba(103,178,238,.78)'
        ctx.fill()
        ctx.fillStyle = 'rgba(5,9,20,.6)'
        ctx.font = '500 13px Inter, system-ui, sans-serif'
        ctx.fillText('Probability', left + 52, top + 12)
      }
      ctx.restore()
    },
  }
}

function makeHoverPlugin(
  prices: number[],
  expiryPnl: number[],
  projectedPnl: number[] | null,
  stockPrice: number,
  displayMode: DisplayMode,
  probDistParams: { mu: number; sigma: number } | undefined,
  hoverRef: React.MutableRefObject<number | null>,
): Plugin {
  return {
    id: 'optionstratHover',
    afterDraw(chart) {
      const rawIndex = hoverRef.current
      if (rawIndex == null || prices.length === 0) return
      const activeIndex = Math.max(0, Math.min(prices.length - 1, rawIndex))

      const { ctx, scales, chartArea } = chart
      const x = scales.x
      const y = scales.y
      if (!x || !y) return

      const price = prices[activeIndex]
      const expiryVal = expiryPnl[activeIndex]
      if (price === undefined || expiryVal === undefined) return

      const xPos = x.getPixelForValue(activeIndex)
      const yExpiryPos = y.getPixelForValue(expiryVal)
      const changePct = stockPrice > 0 ? ((price - stockPrice) / stockPrice) * 100 : 0

      ctx.save()

      // Vertical crosshair
      ctx.strokeStyle = 'rgba(5,9,20,.4)'
      ctx.lineWidth = 1
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(xPos, chartArea.top)
      ctx.lineTo(xPos, chartArea.bottom)
      ctx.stroke()
      ctx.setLineDash([])

      // Price label at top
      ctx.fillStyle = AXIS
      ctx.font = '600 14px Inter, system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      const topLabel = `$${price.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%)`
      const topMetrics = ctx.measureText(topLabel)
      const topX = Math.max(chartArea.left + 8, Math.min(chartArea.right - topMetrics.width - 8, xPos - topMetrics.width / 2))
      ctx.fillText(topLabel, topX, chartArea.top + 13)

      // Expiry P&L dot + label
      const expiryColor = expiryVal >= 0 ? GREEN : RED
      ctx.fillStyle = expiryColor
      ctx.beginPath()
      ctx.arc(xPos, yExpiryPos, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.font = '700 15px Inter, system-ui, sans-serif'
      ctx.fillStyle = expiryColor
      const expiryLabel = fmtHoverPnl(expiryVal, displayMode)
      const expiryMetrics = ctx.measureText(expiryLabel)
      const expiryLabelX = Math.min(chartArea.right - expiryMetrics.width - 8, xPos + 14)
      ctx.fillText(expiryLabel, expiryLabelX, yExpiryPos - 10)

      // Projected P&L dot + label (if visible)
      if (projectedPnl) {
        const projVal = projectedPnl[activeIndex]
        if (projVal !== undefined && Math.abs(projVal - expiryVal) > 0.01) {
          const yProjPos = y.getPixelForValue(projVal)
          const projColor = projVal >= 0 ? GREEN_LIGHT : RED_LIGHT
          ctx.fillStyle = projColor
          ctx.beginPath()
          ctx.arc(xPos, yProjPos, 4, 0, Math.PI * 2)
          ctx.fill()

          ctx.font = '500 12px Inter, system-ui, sans-serif'
          ctx.fillStyle = 'rgba(5,9,20,.55)'
          const projLabel = fmtHoverPnl(projVal, displayMode)
          const projMetrics = ctx.measureText(projLabel)
          const projLabelX = Math.min(chartArea.right - projMetrics.width - 8, xPos + 14)
          const projLabelY = yProjPos > yExpiryPos ? yProjPos + 14 : yProjPos - 10
          ctx.fillText(projLabel, projLabelX, projLabelY)
        }
      }

      // Probability info
      if (probDistParams) {
        const below = Math.round(lognormalCdf(price, probDistParams.mu, probDistParams.sigma) * 100)
        const above = Math.max(0, Math.min(100, 100 - below))
        const probText = `◂${below}%  ${above}%▸`
        const probMetrics = ctx.measureText(probText)
        const probY = Math.min(chartArea.bottom - 22, Math.max(chartArea.top + 56, yExpiryPos + 40))
        const probX = Math.max(chartArea.left + 8, Math.min(chartArea.right - probMetrics.width - 8, xPos - probMetrics.width / 2))
        ctx.font = '500 13px Inter, system-ui, sans-serif'
        ctx.fillStyle = 'rgba(5,9,20,.5)'
        ctx.fillText(probText, probX, probY)
      }

      ctx.restore()
    },
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function PnlChart({
  prices,
  pnl,
  expiryPnl,
  ticker,
  stockPrice,
  displayMode,
  costBasis,
  maxLoss,
  breakevens = [],
  daysToExpiry,
  isAtExpiration = false,
  showProbDist = false,
  probDistParams,
}: PnlChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const hoverRef = useRef<number | null>(null)

  const showProjectedLine = !isAtExpiration && pnl.length > 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onMove = (e: MouseEvent) => {
      const chart = chartRef.current
      if (!chart?.scales?.x || !chart.chartArea) return
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const { left, right, top, bottom } = chart.chartArea

      if (mx < left || mx > right || my < top || my > bottom) {
        if (hoverRef.current !== null) {
          hoverRef.current = null
          chart.draw()
        }
        return
      }

      const val = chart.scales.x.getValueForPixel(mx)
      if (val == null) return
      const idx = Math.round(val)
      if (idx !== hoverRef.current) {
        hoverRef.current = idx
        chart.draw()
      }
    }

    const onLeave = () => {
      if (hoverRef.current !== null) {
        hoverRef.current = null
        chartRef.current?.draw()
      }
    }

    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseleave', onLeave)
    return () => {
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || prices.length === 0) return

    chartRef.current?.destroy()
    chartRef.current = null

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Transform data for display mode
    const expirationPnl = expiryPnl.map((value) => transformY(value, displayMode, costBasis, maxLoss))
    const projectedPnl = showProjectedLine
      ? pnl.map((value) => transformY(value, displayMode, costBasis, maxLoss))
      : null

    // Probability distribution data
    let probDistData: number[] | null = null
    if (showProbDist && probDistParams) {
      const rawDensity = prices.map((price) => lognormalPdf(price, probDistParams.mu, probDistParams.sigma))
      const maxDensity = Math.max(...rawDensity)
      if (maxDensity > 0) {
        const allPnl = [...expirationPnl, ...(projectedPnl ?? [])]
        const yMin = Math.min(...allPnl, 0)
        const yMax = Math.max(...allPnl, 0)
        const yRange = yMax - yMin || 100
        probDistData = rawDensity.map((density) => (density / maxDensity) * yRange * 0.48 + yMin)
      }
    }

    // Segment color callback for green/red/orange based on zero crossing
    const segmentColor = (ctx: { p0: { parsed: { y: number | null } }; p1: { parsed: { y: number | null } } }, colorPos: string, colorNeg: string, colorMix: string) => {
      const y0 = ctx.p0.parsed.y ?? 0
      const y1 = ctx.p1.parsed.y ?? 0
      if (y0 == null || y1 == null) return colorPos
      if (y0 >= 0 && y1 >= 0) return colorPos
      if (y0 < 0 && y1 < 0) return colorNeg
      return colorMix
    }

    const datasets: ChartConfiguration['data']['datasets'] = []

    // 1. Probability distribution (background)
    if (showProbDist && probDistData) {
      datasets.push({
        label: 'Probability',
        data: probDistData,
        borderColor: 'rgba(103,178,238,0)',
        backgroundColor: PROB_BLUE,
        borderWidth: 0,
        pointRadius: 0,
        fill: 'start' as const,
        tension: 0.42,
        order: 4,
      })
    }

    // 2. Projected P&L (dashed, lighter — behind expiry line)
    if (projectedPnl) {
      datasets.push({
        label: 'Projected P&L',
        data: projectedPnl,
        borderWidth: 2,
        borderColor: 'rgba(5,9,20,.35)',
        borderDash: [6, 4],
        pointRadius: 0,
        fill: false,
        tension: 0,
        order: 2,
        segment: {
          borderColor: (ctx) => segmentColor(ctx, GREEN_LIGHT, RED_LIGHT, ORANGE_LIGHT),
        },
      } as ChartConfiguration['data']['datasets'][number])
    }

    // 3. Expiry P&L (solid, bold — main line)
    datasets.push({
      label: 'Expiration',
      data: expirationPnl,
      borderWidth: 3,
      borderColor: AXIS,
      pointRadius: 0,
      fill: {
        target: { value: 0 },
        above: 'rgba(32,215,75,.30)',
        below: 'rgba(216,6,47,.25)',
      },
      tension: 0,
      order: 1,
      segment: {
        borderColor: (segment) => segmentColor(segment, GREEN, RED, ORANGE),
      },
    } as ChartConfiguration['data']['datasets'][number])

    // Compute symmetric Y-axis bounds for balanced chart proportions (matching optionstrat)
    const allYValues = [...expirationPnl, ...(projectedPnl ?? [])]
    const yDataMin = Math.min(...allYValues, 0)
    const yDataMax = Math.max(...allYValues, 0)
    const yAbsMax = Math.max(Math.abs(yDataMin), Math.abs(yDataMax)) || 100
    // Pick a nice step size that divides the range into 3-5 sections
    const rawStep = yAbsMax / 3
    const niceSteps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000]
    const yStep = niceSteps.find((s) => s >= rawStep) ?? Math.ceil(rawStep / 1000) * 1000
    // Round bounds to exact multiples of yStep for perfectly aligned ticks
    const yBound = Math.max(yStep, Math.ceil(yAbsMax / yStep) * yStep)
    const yAxisMin = -yBound
    const yAxisMax = yBound

    // Compute X-axis tick step: aim for price labels every ~$0.20 to ~$10 depending on range
    const priceRange = prices[prices.length - 1] - prices[0]
    const rawXStep = priceRange / 18
    const niceXSteps = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100]
    const xTickStep = niceXSteps.find((s) => s >= rawXStep) ?? Math.ceil(rawXStep)

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: prices.map((price) => `$${price.toFixed(2)}`),
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 8, right: 8, bottom: 4, left: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
        scales: {
          x: {
            grid: { color: GRID, lineWidth: 0.8 },
            border: { display: true, color: AXIS, width: 1 },
            ticks: {
              color: 'rgba(5,9,20,.6)',
              font: { family: 'var(--sans)', size: 11 },
              maxRotation: 0,
              autoSkip: false,
              padding: 6,
              callback: (_value, index) => {
                const price = prices[index]
                if (price === undefined) return null
                // Show label when price is near a multiple of xTickStep
                const remainder = price % xTickStep
                const threshold = (prices[1] - prices[0]) * 0.6
                if (remainder < threshold || (xTickStep - remainder) < threshold) {
                  return price >= 100 ? `$${price.toFixed(0)}` : `$${price.toFixed(2)}`
                }
                return null
              },
            },
          },
          y: {
            min: yAxisMin,
            max: yAxisMax,
            grid: { color: GRID, lineWidth: 0.8 },
            border: { display: true, color: AXIS, width: 1 },
            ticks: {
              color: AXIS,
              font: { family: 'var(--sans)', size: 11 },
              padding: 6,
              stepSize: yStep,
              callback: (value) => fmtAxisY(Number(value), displayMode),
            },
          },
        },
      },
      plugins: [
        makeZeroLinePlugin(),
        makePriceMarkersPlugin(prices, stockPrice, breakevens),
        makeLegendPlugin(daysToExpiry, showProjectedLine, showProbDist && !!probDistData),
        makeHoverPlugin(
          prices,
          expirationPnl,
          projectedPnl,
          stockPrice,
          displayMode,
          showProbDist ? probDistParams : undefined,
          hoverRef,
        ),
      ],
    }

    chartRef.current = new Chart(ctx, config)

    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [prices, pnl, expiryPnl, ticker, stockPrice, displayMode, costBasis, maxLoss, breakevens, daysToExpiry, isAtExpiration, showProbDist, probDistParams, showProjectedLine])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: PANEL_BG }}>
      <canvas ref={canvasRef} id="pnl-chart" style={{ width: '100%', height: '100%', cursor: 'crosshair' }} />
    </div>
  )
}
