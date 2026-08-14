import type {
  HeatmapData,
  HistoricalStrategyBar,
  HistoricalStrategyLeg,
  HistoricalUnderlyingBar,
  PnLInput,
} from '@/engine/bsm'
import type { Greeks, PnLPoint } from './index'

// ──────── Requests ────────

export interface CalcPnLRequest {
  type: 'CALC_PNL'
  requestId: string
  payload: {
    input: PnLInput
    priceRange: [number, number]
    steps?: number
  }
}

export interface CalcGreeksRequest {
  type: 'CALC_GREEKS'
  requestId: string
  payload: {
    legs: PnLInput['legs']
    S: number
    r: number
    q: number
  }
}

export interface CalcCopRequest {
  type: 'CALC_COP'
  requestId: string
  payload: {
    input: PnLInput
    priceRange: [number, number]
    steps?: number
  }
}

export interface CalcHeatmapRequest {
  type: 'CALC_HEATMAP'
  requestId: string
  payload: {
    input: PnLInput
    priceRange: [number, number]
    dates: string[]
    priceSteps?: number
  }
}

export interface CalcHistoricalStrategyRequest {
  type: 'CALC_HISTORICAL_STRATEGY'
  requestId: string
  payload: {
    legs: HistoricalStrategyLeg[]
    bars: HistoricalUnderlyingBar[]
    r: number
    q: number
  }
}

export type WorkerRequest =
  | CalcPnLRequest
  | CalcGreeksRequest
  | CalcCopRequest
  | CalcHeatmapRequest
  | CalcHistoricalStrategyRequest

// ──────── Responses ────────

export interface PnLResponse {
  type: 'CALC_PNL_RESULT'
  requestId: string
  payload: { pnl: PnLPoint[]; expiryPnl: PnLPoint[] }
}

export interface GreeksResponse {
  type: 'CALC_GREEKS_RESULT'
  requestId: string
  payload: Greeks
}

export interface CopResponse {
  type: 'CALC_COP_RESULT'
  requestId: string
  payload: number
}

export interface HeatmapResponse {
  type: 'CALC_HEATMAP_RESULT'
  requestId: string
  payload: HeatmapData
}

export interface HistoricalStrategyResponse {
  type: 'CALC_HISTORICAL_STRATEGY_RESULT'
  requestId: string
  payload: HistoricalStrategyBar[]
}

export type WorkerResponse = PnLResponse | GreeksResponse | CopResponse | HeatmapResponse | HistoricalStrategyResponse
