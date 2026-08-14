import type {
  HistoricalPriceBar,
  HistoricalPriceSeries,
  HistoryTimeframe,
  Leg,
  OptionContract,
} from '@/types'

export interface ResolvedHistoryLeg {
  leg: Leg
  code: string
}

function compactNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace(/0+$/, '').replace(/\.$/, '')
}

export function fallbackOptionCode(ticker: string, leg: Leg): string {
  const expiry = leg.expiry.slice(2).replaceAll('-', '')
  const optionType = leg.optionType === 'call' ? 'C' : 'P'
  const strike = Math.round(leg.strike * 1000)
  return `US.${ticker.toUpperCase()}${expiry}${optionType}${strike}`
}

export function resolveHistoryLegs(
  ticker: string,
  legs: Leg[],
  optionChain: Map<string, OptionContract[]>,
): ResolvedHistoryLeg[] {
  return legs.filter((leg) => !leg.excluded).map((leg) => {
    const contract = optionChain.get(leg.expiry)?.find((candidate) =>
      candidate.optionType === leg.optionType && Math.abs(candidate.strike - leg.strike) < 0.0001,
    )
    return { leg, code: contract?.symbol ?? fallbackOptionCode(ticker, leg) }
  })
}

export function strategyHistoryLabel(legs: ResolvedHistoryLeg[]): string {
  if (!legs.length) return 'Strategy'
  const summary = legs.map(({ leg, code }) => {
    const quantity = `${leg.direction === 'short' ? '-' : ''}${leg.quantity > 1 ? `${leg.quantity}×` : ''}`
    const expiry = leg.expiry.slice(2).replaceAll('-', '')
    const symbol = code.includes('.') ? code.slice(code.indexOf('.') + 1) : code
    const ticker = symbol.match(/^[A-Z.]+/)?.[0] ?? ''
    const optionType = leg.optionType === 'call' ? 'C' : 'P'
    return `${quantity}${ticker}${expiry} ${compactNumber(leg.strike)}${optionType}`
  }).join(' / ')
  return `Strategy (${summary})`
}

function aggregateAtTimestamp(
  timestamp: string,
  legs: ResolvedHistoryLeg[],
  barMaps: Map<string, Map<string, HistoricalPriceBar>>,
): HistoricalPriceBar | null {
  let open = 0, close = 0, high = 0, low = 0, volume = 0
  for (const { code, leg } of legs) {
    const bar = barMaps.get(code)?.get(timestamp)
    if (!bar) return null
    const scale = (leg.direction === 'long' ? 1 : -1) * leg.quantity
    open += scale * bar.open
    close += scale * bar.close
    high += scale > 0 ? scale * bar.high : scale * bar.low
    low += scale > 0 ? scale * bar.low : scale * bar.high
    volume += bar.volume
  }
  return { timestamp, open, close, high: Math.max(high, open, close), low: Math.min(low, open, close), volume }
}

export function aggregateActualStrategyBars(
  legs: ResolvedHistoryLeg[],
  series: HistoricalPriceSeries[],
): HistoricalPriceBar[] {
  if (!legs.length) return []
  const seriesByCode = new Map(series.map((item) => [item.code, item]))
  const barMaps = new Map<string, Map<string, HistoricalPriceBar>>()
  for (const { code } of legs) {
    const item = seriesByCode.get(code)
    if (!item?.bars.length) return []
    barMaps.set(code, new Map(item.bars.map((bar) => [bar.timestamp, bar])))
  }
  const firstBars = seriesByCode.get(legs[0].code)?.bars ?? []
  return firstBars
    .map((bar) => aggregateAtTimestamp(bar.timestamp, legs, barMaps))
    .filter((bar): bar is HistoricalPriceBar => bar !== null)
}

export function shouldUseActualOptionHistory(
  timeframe: HistoryTimeframe,
  legs: ResolvedHistoryLeg[],
  series: HistoricalPriceSeries[],
): boolean {
  if (timeframe !== '3m' && timeframe !== 'all') return false
  const byCode = new Map(series.map((item) => [item.code, item]))
  return legs.length > 0 && legs.every(({ code }) => (byCode.get(code)?.bars.length ?? 0) > 1)
}

export function formatHistoryTick(timestamp: string, timeframe: HistoryTimeframe): string {
  const date = new Date(timestamp)
  if (timeframe === '1d') {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
  }
  if (timeframe === 'all') {
    return new Intl.DateTimeFormat('en-US', { month: 'numeric', year: '2-digit' }).format(date)
  }
  return new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }).format(date)
}
