import type { HistoryChartStyle, HistoryTimeframe } from '@/types'

const TIMEFRAMES: Array<{ value: HistoryTimeframe; number: string; unit: string }> = [
  { value: '1d', number: '1', unit: 'Day' },
  { value: '1w', number: '1', unit: 'Week' },
  { value: '2w', number: '2', unit: 'Weeks' },
  { value: '1m', number: '1', unit: 'Month' },
  { value: '3m', number: '3', unit: 'Months' },
  { value: 'all', number: 'All', unit: 'Time' },
]

interface HistoricalPriceControlsProps {
  timeframe: HistoryTimeframe
  chartStyle: HistoryChartStyle
  onTimeframeChange: (value: HistoryTimeframe) => void
  onChartStyleChange: (value: HistoryChartStyle) => void
}

function segmentStyle(selected: boolean): React.CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    height: 29,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    color: selected ? '#fff' : '#334155',
    background: selected ? '#249fda' : '#fff',
    border: 0,
    borderRight: '1px solid #9dc8df',
    cursor: 'pointer',
    fontSize: 13,
  }
}

export function HistoricalPriceControls({
  timeframe, chartStyle, onTimeframeChange, onChartStyleChange,
}: HistoricalPriceControlsProps) {
  return (
    <div style={{ height: 48, display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 16, padding: '8px 16px 11px', borderTop: '1px solid #d8e0ec', background: '#eef2f8' }}>
      <div role="group" aria-label="Timeframe" style={{ display: 'flex', overflow: 'hidden', border: '1px solid #76b9dc', borderRadius: 5 }}>
        {TIMEFRAMES.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-label={`${item.number} ${item.unit}`}
            aria-pressed={timeframe === item.value}
            onClick={() => onTimeframeChange(item.value)}
            style={segmentStyle(timeframe === item.value)}
          >
            <span>{item.number}</span><span style={{ opacity: 0.9 }}>{item.unit}</span>
          </button>
        ))}
      </div>
      <div role="group" aria-label="Chart style" style={{ display: 'flex', overflow: 'hidden', border: '1px solid #76b9dc', borderRadius: 5 }}>
        <button type="button" aria-pressed={chartStyle === 'line'} onClick={() => onChartStyleChange('line')} style={segmentStyle(chartStyle === 'line')}>
          ⌁ Line
        </button>
        <button type="button" aria-pressed={chartStyle === 'candlestick'} onClick={() => onChartStyleChange('candlestick')} style={{ ...segmentStyle(chartStyle === 'candlestick'), borderRight: 0 }}>
          <span aria-hidden style={{ fontFamily: 'monospace', letterSpacing: -2 }}>│╽│</span> Candlestick
        </button>
      </div>
    </div>
  )
}
