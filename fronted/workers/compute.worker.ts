import {
  calcPnL,
  calcExpiryPnL,
  calcPortfolioGreeks,
  calcCop,
  calcHeatmap,
} from '@/engine/bsm'
import type { WorkerRequest, WorkerResponse } from '@/types/worker'

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data

  switch (req.type) {
    case 'CALC_PNL': {
      const { input, priceRange, steps } = req.payload
      const res: WorkerResponse = {
        type: 'CALC_PNL_RESULT',
        requestId: req.requestId,
        payload: {
          pnl: calcPnL(input, priceRange, steps),
          expiryPnl: calcExpiryPnL(input, priceRange, steps),
        },
      }
      self.postMessage(res)
      break
    }

    case 'CALC_GREEKS': {
      const { legs, S, r, q } = req.payload
      const res: WorkerResponse = {
        type: 'CALC_GREEKS_RESULT',
        requestId: req.requestId,
        payload: calcPortfolioGreeks(legs, S, r, q),
      }
      self.postMessage(res)
      break
    }

    case 'CALC_COP': {
      const { input, priceRange, steps } = req.payload
      const res: WorkerResponse = {
        type: 'CALC_COP_RESULT',
        requestId: req.requestId,
        payload: calcCop(input, priceRange, steps),
      }
      self.postMessage(res)
      break
    }

    case 'CALC_HEATMAP': {
      const { input, priceRange, dates, priceSteps } = req.payload
      const res: WorkerResponse = {
        type: 'CALC_HEATMAP_RESULT',
        requestId: req.requestId,
        payload: calcHeatmap(input, priceRange, dates, priceSteps),
      }
      self.postMessage(res)
      break
    }
  }
}
