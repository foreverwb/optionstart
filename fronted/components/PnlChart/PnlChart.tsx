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
const GRID = 'rgba(5,9,20,.12)'
const AXIS = '#050914'
const BLUE = '#159bed'
const PROB_BLUE = 'rgba(103,178,238,.34)'
const GREEN = '#0ec441'
const RED = '#d8062f'
const ORANGE = '#d36b12'

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

function fmtTooltipY(value: number, mode: DisplayMode): string {
  if (mode === 'pct') return `${value.toFixed(1)}%`
  if (mode === 'risk') return `${value.toFixed(0)}%`
  if (mode === 'contract') return `$${value.toFixed(2)}`
  return value >= 0
    ? `+$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `-$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function fmtHoverPnl(value: number, mode: DisplayMode): string {
  if (mode === 'pct') return `${value.toFixed(1)}%`
  if (mode === 'risk') return `${value.toFixed(0)}%`
  if (mode === 'contract') return value >= 0 ? `$${value.toFixed(2)}` : `-$${Math.abs(value).toFixed(2)}`
  return value >= 0
    ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
      ctx.strokeStyle = AXIS
      ctx.lineWidth = 1.25
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
      const currentX = x.getPixelForValue(nearestIndex(prices, stockPrice))
      ctx.strokeStyle = AXIS
      ctx.lineWidth = 1
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.moveTo(currentX, y.top)
      ctx.lineTo(currentX, y.bottom)
      ctx.stroke()

      ctx.setLineDash([])
      ctx.strokeStyle = BLUE
      ctx.fillStyle = BLUE
      ctx.lineWidth = 1
      ctx.font = '500 15px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      for (const breakeven of breakevens) {
        if (breakeven < prices[0] || breakeven > prices[prices.length - 1]) continue
        const beX = x.getPixelForValue(nearestIndex(prices, breakeven))
        ctx.beginPath()
        ctx.moveTo(beX, y.top + 38)
        ctx.lineTo(beX, y.bottom)
        ctx.stroke()
        ctx.fillText(`$${breakeven.toFixed(2)}`, beX, y.top + 33)
      }
      ctx.restore()
    },
  }
}

function makeLegendPlugin(daysToExpiry: number | undefined, showProbDist: boolean): Plugin {
  return {
    id: 'optionstratLegend',
    afterDraw(chart) {
      const { ctx, chartArea } = chart
      if (!chartArea) return
      const left = chartArea.left + 14
      const top = chartArea.top + 12

      ctx.save()
      ctx.strokeStyle = AXIS
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(left, top + 4)
      ctx.lineTo(left + 52, top + 4)
      ctx.stroke()

      ctx.fillStyle = AXIS
      ctx.font = '500 15px Inter, system-ui, sans-serif'
      ctx.textAlign = 'left'
      const dte = daysToExpiry === undefined ? '' : ` (${daysToExpiry}d)`
      ctx.fillText(`Expiration${dte}`, left + 66, top + 9)

      if (showProbDist) {
        const probTop = top + 32
        ctx.beginPath()
        ctx.moveTo(left + 8, probTop + 16)
        ctx.bezierCurveTo(left + 18, probTop - 4, left + 34, probTop - 4, left + 44, probTop + 16)
        ctx.closePath()
        ctx.fillStyle = 'rgba(103,178,238,.78)'
        ctx.fill()
        ctx.fillStyle = AXIS
        ctx.fillText('Probability', left + 66, probTop + 14)
      }
      ctx.restore()
    },
  }
}

function makeHoverPlugin(
  prices: number[],
  pnl: number[],
  stockPrice: number,
  displayMode: DisplayMode,
  probDistParams: { mu: number; sigma: number } | undefined,
): Plugin {
  let activeIndex: number | null = null

  return {
    id: 'optionstratHover',
    afterEvent(chart, args) {
      const { event } = args
      const { chartArea, scales } = chart
      const x = scales.x
      if (!x || prices.length === 0) return

      const isOut = event.type === 'mouseout'
      const outsideArea = typeof event.x !== 'number' || typeof event.y !== 'number'
        || event.x < chartArea.left || event.x > chartArea.right
        || event.y < chartArea.top || event.y > chartArea.bottom

      let nextIndex: number | null = null
      if (!isOut && !outsideArea && typeof event.x === 'number') {
        nextIndex = Math.max(0, Math.min(prices.length - 1, Math.round(Number(x.getValueForPixel(event.x)))))
      }

      if (nextIndex !== activeIndex) {
        activeIndex = nextIndex
        args.changed = true
      }
    },
    afterDraw(chart) {
      if (activeIndex == null) return
      const { ctx, scales, chartArea } = chart
      const x = scales.x
      const y = scales.y
      if (!x || !y) return

      const price = prices[activeIndex]
      const pnlValue = pnl[activeIndex]
      if (price === undefined || pnlValue === undefined) return

      const xPos = x.getPixelForValue(activeIndex)
      const yPos = y.getPixelForValue(pnlValue)
      const changePct = stockPrice > 0 ? ((price - stockPrice) / stockPrice) * 100 : 0

      ctx.save()
      ctx.strokeStyle = AXIS
      ctx.fillStyle = AXIS
      ctx.lineWidth = 1.25
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(xPos, chartArea.top)
      ctx.lineTo(xPos, chartArea.bottom)
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(xPos, yPos, 5, 0, Math.PI * 2)
      ctx.fill()

      ctx.font = '600 18px Inter, system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      const pnlLabel = fmtHoverPnl(pnlValue, displayMode)
      const pnlMetrics = ctx.measureText(pnlLabel)
      const pnlX = Math.min(chartArea.right - pnlMetrics.width - 8, xPos + 14)
      ctx.fillText(pnlLabel, pnlX, yPos)

      const topLabel = `$${price.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%)`
      const topMetrics = ctx.measureText(topLabel)
      const topX = Math.max(chartArea.left + 8, Math.min(chartArea.right - topMetrics.width - 8, xPos - topMetrics.width / 2))
      ctx.fillText(topLabel, topX, chartArea.top + 13)

      if (probDistParams) {
        const below = Math.round(lognormalCdf(price, probDistParams.mu, probDistParams.sigma) * 100)
        const above = Math.max(0, Math.min(100, 100 - below))
        const probText = `◂${below}%  ${above}%▸`
        const probMetrics = ctx.measureText(probText)
        const probY = Math.min(chartArea.bottom - 22, Math.max(chartArea.top + 56, yPos + 96))
        const probX = Math.max(chartArea.left + 8, Math.min(chartArea.right - probMetrics.width - 8, xPos - probMetrics.width / 2))
        ctx.font = '500 16px Inter, system-ui, sans-serif'
        ctx.fillText(probText, probX, probY)
      }

      ctx.restore()
    },
  }
}

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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || prices.length === 0) return

    chartRef.current?.destroy()
    chartRef.current = null

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const activeSource = isAtExpiration ? expiryPnl : pnl
    const activePnl = activeSource.map((value) => transformY(value, displayMode, costBasis, maxLoss))
    const expirationPnl = expiryPnl.map((value) => transformY(value, displayMode, costBasis, maxLoss))

    let probDistData: number[] | null = null
    if (showProbDist && probDistParams) {
      const rawDensity = prices.map((price) => lognormalPdf(price, probDistParams.mu, probDistParams.sigma))
      const maxDensity = Math.max(...rawDensity)
      if (maxDensity > 0) {
        const yMin = Math.min(...expirationPnl, ...activePnl, 0)
        const yMax = Math.max(...expirationPnl, ...activePnl, 0)
        const yRange = yMax - yMin || 100
        probDistData = rawDensity.map((density) => (density / maxDensity) * yRange * 0.48 + yMin)
      }
    }

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: prices.map((price) => `$${price.toFixed(0)}`),
        datasets: [
          ...(showProbDist && probDistData
            ? [
                {
                  label: 'Probability',
                  data: probDistData,
                  borderColor: 'rgba(103,178,238,0)',
                  backgroundColor: PROB_BLUE,
                  borderWidth: 0,
                  pointRadius: 0,
                  fill: 'start' as const,
                  tension: 0.42,
                  order: 4,
                },
              ]
            : []),
          {
            label: isAtExpiration ? 'Expiration' : 'Projected P&L',
            data: activePnl,
            borderWidth: 3.25,
            borderColor: AXIS,
            pointRadius: 0,
            fill: {
              target: { value: 0 },
              above: 'rgba(32,215,75,.22)',
              below: 'rgba(216,6,47,.22)',
            },
            tension: 0,
            order: 1,
            segment: {
              borderColor: (segment) => {
                const y0 = segment.p0.parsed.y
                const y1 = segment.p1.parsed.y
                if (y0 == null || y1 == null) return AXIS
                if (y0 >= 0 && y1 >= 0) return GREEN
                if (y0 < 0 && y1 < 0) return RED
                return ORANGE
              },
            },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 160 },
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 12, right: 12, bottom: 0, left: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            backgroundColor: 'rgba(255,255,255,0.98)',
            borderColor: 'rgba(5,9,20,.16)',
            borderWidth: 1,
            titleColor: '#050914',
            bodyColor: '#050914',
            titleFont: { family: 'var(--mono)', size: 11, weight: 'bold' },
            bodyFont: { family: 'var(--sans)', size: 12 },
            padding: 10,
            callbacks: {
              title: (items) => `${ticker}: ${items[0]?.label ?? ''}`,
              label: (item) => {
                if (item.dataset.label === 'Probability') return undefined
                const y = item.parsed.y
                return y == null ? undefined : `${item.dataset.label}: ${fmtTooltipY(y, displayMode)}`
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: GRID, lineWidth: 1 },
            border: { display: true, color: AXIS, width: 1.5 },
            ticks: {
              color: 'rgba(5,9,20,.72)',
              font: { family: 'var(--sans)', size: 12 },
              maxTicksLimit: 9,
              padding: 8,
              callback: (_value, index) => {
                const stride = Math.max(1, Math.floor(prices.length / 9))
                return index % stride === 0 ? `$${(prices[index] ?? 0).toFixed(0)}` : null
              },
            },
          },
          y: {
            grid: { color: GRID, lineWidth: 1 },
            border: { display: true, color: AXIS, width: 1.5 },
            ticks: {
              color: AXIS,
              font: { family: 'var(--sans)', size: 12 },
              padding: 8,
              callback: (value) => fmtAxisY(Number(value), displayMode),
            },
          },
        },
      },
      plugins: [
        makeZeroLinePlugin(),
        makePriceMarkersPlugin(prices, stockPrice, breakevens),
        makeLegendPlugin(daysToExpiry, showProbDist && !!probDistData),
        makeHoverPlugin(prices, activePnl, stockPrice, displayMode, showProbDist ? probDistParams : undefined),
      ],
    }

    chartRef.current = new Chart(ctx, config)

    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [prices, pnl, expiryPnl, ticker, stockPrice, displayMode, costBasis, maxLoss, breakevens, daysToExpiry, isAtExpiration, showProbDist, probDistParams])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: PANEL_BG }}>
      <canvas ref={canvasRef} id="pnl-chart" style={{ width: '100%', height: '100%', cursor: 'crosshair' }} />
    </div>
  )
}
