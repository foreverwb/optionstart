import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import type { HistoricalPriceBar, HistoryChartStyle, HistoryTimeframe } from '@/types'
import { formatHistoryTick } from './historicalPriceData'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Filler)

interface HistoricalPriceChartProps {
  bars: HistoricalPriceBar[]
  label: string
  timeframe: HistoryTimeframe
  chartStyle: HistoryChartStyle
  showXAxis: boolean
}

const GREEN = '#5ac94f'
const RED = '#d83c4a'
const GRID = 'rgba(71,85,105,.12)'
const TEXT = '#172033'

function priceDomain(bars: HistoricalPriceBar[]): { min: number; max: number } {
  const minValue = Math.min(...bars.map((bar) => bar.low))
  const maxValue = Math.max(...bars.map((bar) => bar.high))
  const padding = Math.max((maxValue - minValue) * 0.08, Math.abs(maxValue) * 0.015, 0.05)
  return { min: minValue - padding, max: maxValue + padding }
}

function axisOptions(
  labels: string[],
  domain: { min: number; max: number },
  showXAxis: boolean,
): Pick<ChartOptions<'line'>, 'scales'> {
  return {
    scales: {
      x: {
        display: showXAxis,
        grid: { color: GRID, tickLength: 0 },
        border: { color: '#94a3b8' },
        ticks: {
          color: TEXT,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 6,
          font: { size: 11 },
          callback: (_value, index) => labels[index] ?? '',
        },
      },
      y: {
        position: 'right',
        min: domain.min,
        max: domain.max,
        grid: { color: GRID, tickLength: 4 },
        border: { color: '#94a3b8' },
        ticks: {
          color: TEXT,
          font: { size: 11 },
          callback: (value) => `$${Number(value).toFixed(0)}`,
        },
      },
    },
  }
}

function LinePriceChart({
  bars, labels, domain, showXAxis,
}: {
  bars: HistoricalPriceBar[]
  labels: string[]
  domain: { min: number; max: number }
  showXAxis: boolean
}) {
  const data: ChartData<'line', number[], string> = {
    labels,
    datasets: [{
      label: 'Price',
      data: bars.map((bar) => bar.close),
      borderColor: GREEN,
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.28,
      fill: false,
    }],
  }
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        displayColors: false,
        callbacks: { label: (context) => `$${Number(context.parsed.y).toFixed(2)}` },
      },
    },
    ...axisOptions(labels, domain, showXAxis),
  }
  return <Line data={data} options={options} />
}

function CandlePriceChart({
  bars, labels, domain, showXAxis,
}: {
  bars: HistoricalPriceBar[]
  labels: string[]
  domain: { min: number; max: number }
  showXAxis: boolean
}) {
  const colors = bars.map((bar) => bar.close >= bar.open ? GREEN : RED)
  const data: ChartData<'bar', [number, number][], string> = {
    labels,
    datasets: [
      {
        label: 'Range',
        data: bars.map((bar) => [bar.low, bar.high]),
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 0,
        barPercentage: 0.13,
        categoryPercentage: 1,
        grouped: false,
      },
      {
        label: 'Price',
        data: bars.map((bar) => [bar.open, bar.close]),
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 1,
        barPercentage: 0.62,
        categoryPercentage: 1,
        grouped: false,
      },
    ],
  }
  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        displayColors: false,
        filter: (context) => context.datasetIndex === 1,
        callbacks: {
          label: (context) => {
            const bar = bars[context.dataIndex]
            return `O $${bar.open.toFixed(2)}  H $${bar.high.toFixed(2)}  L $${bar.low.toFixed(2)}  C $${bar.close.toFixed(2)}`
          },
        },
      },
    },
    scales: axisOptions(labels, domain, showXAxis).scales,
  }
  return <Bar data={data} options={options} />
}

export function HistoricalPriceChart({
  bars, label, timeframe, chartStyle, showXAxis,
}: HistoricalPriceChartProps) {
  if (!bars.length) {
    return <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#64748b' }}>No price history</div>
  }
  const labels = bars.map((bar) => formatHistoryTick(bar.timestamp, timeframe))
  const domain = priceDomain(bars)
  const last = bars.at(-1)!
  const rising = last.close >= last.open
  const top = 7 + (1 - (last.close - domain.min) / (domain.max - domain.min)) * 78

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0 }}>
      <div style={{ position: 'absolute', zIndex: 2, top: 7, left: 8, color: TEXT, fontSize: 13, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ position: 'absolute', zIndex: 3, right: 2, top: `${top}%`, transform: 'translateY(-50%)', padding: '2px 7px', borderRadius: 3, background: rising ? GREEN : RED, color: '#fff', fontSize: 12, fontWeight: 700 }}>
        ${last.close.toFixed(2)}
      </div>
      {chartStyle === 'line'
        ? <LinePriceChart bars={bars} labels={labels} domain={domain} showXAxis={showXAxis} />
        : <CandlePriceChart bars={bars} labels={labels} domain={domain} showXAxis={showXAxis} />}
    </div>
  )
}
