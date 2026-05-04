import { describe, it, expect } from 'vitest';
import {
  ncdf,
  npdf,
  price,
  greeks,
  calcPnl,
  calcNetGreeks,
  calcCop,
  findBreakevens,
} from '../bsm.ts';
import type { Leg } from '../../types/index.ts';

// ─── Helpers ────────────────────────────────────────────────────────────────

const abs = Math.abs;

function makeLeg(overrides: Partial<Leg> & Pick<Leg, 'type' | 'direction' | 'strikePrice' | 'expiryDate' | 'costBasis'>): Leg {
  return {
    id: 'test',
    contractCode: '',
    quantity: 1,
    excluded: false,
    ...overrides,
  };
}

// ─── ncdf ────────────────────────────────────────────────────────────────────

describe('ncdf', () => {
  it('ncdf(0) = 0.5', () => {
    expect(abs(ncdf(0) - 0.5)).toBeLessThan(1e-7);
  });

  it('ncdf(1.96) ≈ 0.975 (standard z-table)', () => {
    expect(abs(ncdf(1.96) - 0.9750021)).toBeLessThan(1e-5);
  });

  it('ncdf(-1.96) = 1 - ncdf(1.96) (symmetry)', () => {
    expect(abs(ncdf(-1.96) - (1 - ncdf(1.96)))).toBeLessThan(1e-10);
  });

  it('ncdf(∞) → 1, ncdf(-∞) → 0', () => {
    expect(ncdf(8)).toBeCloseTo(1, 6);
    expect(ncdf(-8)).toBeCloseTo(0, 6);
  });

  it('error < 1e-7 at x = 1 (against high-precision value 0.8413447460685429)', () => {
    expect(abs(ncdf(1) - 0.8413447460685429)).toBeLessThan(1e-7);
  });
});

// ─── npdf ────────────────────────────────────────────────────────────────────

describe('npdf', () => {
  it('npdf(0) = 1/√(2π)', () => {
    expect(abs(npdf(0) - 1 / Math.sqrt(2 * Math.PI))).toBeLessThan(1e-10);
  });

  it('npdf is symmetric: npdf(x) = npdf(-x)', () => {
    expect(npdf(1.5)).toBeCloseTo(npdf(-1.5), 10);
  });
});

// ─── price ───────────────────────────────────────────────────────────────────

describe('price', () => {
  // d1=0.05, d2=-0.05, C = 100*(N(0.05) - N(-0.05)) = 100*(2*0.519939 - 1) = 3.9878
  it('ATM call: S=K=100, T=0.25, r=0, σ=0.2, q=0 → ≈ 3.9878', () => {
    expect(abs(price(100, 100, 0.25, 0, 0.2, 0, 'call') - 3.9878)).toBeLessThan(0.001);
  });

  it('ATM call: S=K=100, T=0.25, r=0.05, σ=0.2, q=0 → ≈ 4.61', () => {
    expect(abs(price(100, 100, 0.25, 0.05, 0.2, 0, 'call') - 4.61)).toBeLessThan(0.02);
  });

  it('ATM put via put-call parity: P = C - S*e^{-qT} + K*e^{-rT}', () => {
    const S = 100, K = 100, T = 0.25, r = 0.05, sigma = 0.2, q = 0;
    const c = price(S, K, T, r, sigma, q, 'call');
    const p = price(S, K, T, r, sigma, q, 'put');
    const parity = c - S * Math.exp(-q * T) + K * Math.exp(-r * T);
    expect(abs(p - parity)).toBeLessThan(1e-6);
  });

  it('T=0 call returns intrinsic value max(0, S-K)', () => {
    expect(price(110, 100, 0, 0.05, 0.2, 0, 'call')).toBe(10);
    expect(price(90,  100, 0, 0.05, 0.2, 0, 'call')).toBe(0);
  });

  it('T=0 put returns intrinsic value max(0, K-S)', () => {
    expect(price(90,  100, 0, 0.05, 0.2, 0, 'put')).toBe(10);
    expect(price(110, 100, 0, 0.05, 0.2, 0, 'put')).toBe(0);
  });

  it('deep ITM call price ≈ S·e^{-qT} - K·e^{-rT} (intrinsic discounted)', () => {
    // Very deep ITM: S=200, K=100
    const c = price(200, 100, 0.25, 0.05, 0.2, 0, 'call');
    const intrinsic = 200 * Math.exp(0) - 100 * Math.exp(-0.05 * 0.25);
    expect(abs(c - intrinsic)).toBeLessThan(0.01);
  });

  it('call price increases with σ (vega positive)', () => {
    expect(price(100, 100, 0.25, 0.05, 0.3, 0, 'call'))
      .toBeGreaterThan(price(100, 100, 0.25, 0.05, 0.2, 0, 'call'));
  });

  it('call price increases with T (time value positive for long options)', () => {
    expect(price(100, 100, 0.5, 0.05, 0.2, 0, 'call'))
      .toBeGreaterThan(price(100, 100, 0.25, 0.05, 0.2, 0, 'call'));
  });

  it('dividend reduces call price and increases put price', () => {
    const noDiv  = price(100, 100, 0.25, 0.05, 0.2, 0,    'call');
    const withDiv = price(100, 100, 0.25, 0.05, 0.2, 0.03, 'call');
    expect(withDiv).toBeLessThan(noDiv);

    const noDivP   = price(100, 100, 0.25, 0.05, 0.2, 0,    'put');
    const withDivP = price(100, 100, 0.25, 0.05, 0.2, 0.03, 'put');
    expect(withDivP).toBeGreaterThan(noDivP);
  });
});

// ─── greeks ──────────────────────────────────────────────────────────────────

describe('greeks', () => {
  it('ATM call delta ≈ 0.5 (approximately)', () => {
    const g = greeks(100, 100, 0.25, 0.05, 0.2, 0, 'call');
    expect(g.delta).toBeGreaterThan(0.4);
    expect(g.delta).toBeLessThan(0.7);
  });

  it('ATM put delta ≈ -0.5', () => {
    const g = greeks(100, 100, 0.25, 0.05, 0.2, 0, 'put');
    expect(g.delta).toBeLessThan(-0.3);
    expect(g.delta).toBeGreaterThan(-0.7);
  });

  it('call delta - put delta = e^{-qT} (put-call parity on delta)', () => {
    // Identity: Δ_call - Δ_put = e^{-qT}
    const S = 100, K = 100, T = 0.25, r = 0.05, sigma = 0.2, q = 0.01;
    const call = greeks(S, K, T, r, sigma, q, 'call');
    const put  = greeks(S, K, T, r, sigma, q, 'put');
    expect(abs(call.delta - put.delta - Math.exp(-q * T))).toBeLessThan(1e-6);
  });

  it('gamma is positive for both calls and puts', () => {
    const call = greeks(100, 100, 0.25, 0.05, 0.2, 0, 'call');
    const put  = greeks(100, 100, 0.25, 0.05, 0.2, 0, 'put');
    expect(call.gamma).toBeGreaterThan(0);
    expect(put.gamma).toBeGreaterThan(0);
  });

  it('call gamma = put gamma (model identity)', () => {
    const call = greeks(100, 100, 0.25, 0.05, 0.2, 0, 'call');
    const put  = greeks(100, 100, 0.25, 0.05, 0.2, 0, 'put');
    expect(abs(call.gamma - put.gamma)).toBeLessThan(1e-8);
  });

  it('vega is positive and equal for call and put (model identity)', () => {
    const call = greeks(100, 100, 0.25, 0.05, 0.2, 0, 'call');
    const put  = greeks(100, 100, 0.25, 0.05, 0.2, 0, 'put');
    expect(call.vega).toBeGreaterThan(0);
    expect(abs(call.vega - put.vega)).toBeLessThan(1e-8);
  });

  it('theta is negative for long call (time decay)', () => {
    const g = greeks(100, 100, 0.25, 0.05, 0.2, 0, 'call');
    expect(g.theta).toBeLessThan(0);
  });

  it('near-expiry T < 1/365 returns degenerate Greeks', () => {
    const g = greeks(100, 100, 1 / 366, 0.05, 0.2, 0, 'call');
    expect(g.delta).toBe(1);
    expect(g.gamma).toBe(0);
    expect(g.vega).toBe(0);
  });
});

// ─── calcPnl ─────────────────────────────────────────────────────────────────

describe('calcPnl', () => {
  const today = new Date('2025-01-01');
  const expiryDate = '2025-07-01'; // ~6 months

  it('long call at expiry: pnl > 0 above strike, negative below', () => {
    const leg = makeLeg({ type: 'call', direction: 'long', strikePrice: 100, expiryDate, costBasis: 5 });
    const { expiryPnl } = calcPnl({
      prices: [90, 100, 110, 120],
      legs: [leg],
      T_frac: 1,
      stockPrice: 100,
      baseIV: 0.2,
      ivMult: 1,
      r: 0.05,
      q: 0,
      today,
      commission: 0,
    });
    // At 90: max(0,90-100)=0, pnl = (0-5)*100 = -500
    expect(expiryPnl[0]).toBeCloseTo(-500, 0);
    // At 110: (10-5)*100 = 500
    expect(expiryPnl[2]).toBeCloseTo(500, 0);
  });

  it('excluded legs are not counted', () => {
    const leg = makeLeg({ type: 'call', direction: 'long', strikePrice: 100, expiryDate, costBasis: 5, excluded: true });
    const { expiryPnl } = calcPnl({
      prices: [110],
      legs: [leg],
      T_frac: 1,
      stockPrice: 100,
      baseIV: 0.2,
      ivMult: 1,
      r: 0.05,
      q: 0,
      today,
      commission: 0,
    });
    expect(expiryPnl[0]).toBe(0);
  });

  it('commission reduces pnl by commission * quantity per leg', () => {
    const leg = makeLeg({ type: 'call', direction: 'long', strikePrice: 100, expiryDate, costBasis: 5 });
    const base = calcPnl({ prices: [110], legs: [leg], T_frac: 1, stockPrice: 100, baseIV: 0.2, ivMult: 1, r: 0.05, q: 0, today, commission: 0 });
    const withComm = calcPnl({ prices: [110], legs: [leg], T_frac: 1, stockPrice: 100, baseIV: 0.2, ivMult: 1, r: 0.05, q: 0, today, commission: 1.5 });
    expect(withComm.expiryPnl[0]).toBeCloseTo(base.expiryPnl[0] - 1.5, 5);
  });
});

// ─── calcNetGreeks ────────────────────────────────────────────────────────────

describe('calcNetGreeks', () => {
  const today = new Date('2025-01-01');
  const expiryDate = '2025-07-01';

  it('straddle (long call + long put ATM, r=q=0) delta ≈ 0 (near-neutral)', () => {
    // With r=q=0: d1 = σ√T/2, both deltas nearly equal and opposite → net ≈ 0
    const call = makeLeg({ type: 'call', direction: 'long', strikePrice: 100, expiryDate, costBasis: 5 });
    const put  = makeLeg({ type: 'put',  direction: 'long', strikePrice: 100, expiryDate, costBasis: 5 });
    const g = calcNetGreeks({ legs: [call, put], stockPrice: 100, baseIV: 0.2, ivMult: 1, r: 0, q: 0, today });
    expect(abs(g.delta)).toBeLessThan(8); // residual from d1 = σ√T/2 ≠ 0
  });

  it('short call has negative delta contribution', () => {
    const leg = makeLeg({ type: 'call', direction: 'short', strikePrice: 100, expiryDate, costBasis: 5 });
    const g = calcNetGreeks({ legs: [leg], stockPrice: 100, baseIV: 0.2, ivMult: 1, r: 0.05, q: 0, today });
    expect(g.delta).toBeLessThan(0);
  });
});

// ─── calcCop ─────────────────────────────────────────────────────────────────

describe('calcCop', () => {
  const today = new Date('2025-01-01');
  const expiryDate = '2025-07-01';

  it('returns 50 for empty active legs', () => {
    const leg = makeLeg({ type: 'call', direction: 'long', strikePrice: 100, expiryDate, costBasis: 5, excluded: true });
    expect(calcCop({ legs: [leg], stockPrice: 100, r: 0.05, q: 0, baseIV: 0.2, ivMult: 1, today })).toBe(50);
  });

  it('returns value in [0, 100]', () => {
    const leg = makeLeg({ type: 'call', direction: 'long', strikePrice: 100, expiryDate, costBasis: 5 });
    const cop = calcCop({ legs: [leg], stockPrice: 100, r: 0.05, q: 0, baseIV: 0.2, ivMult: 1, today, N: 2000 });
    expect(cop).toBeGreaterThanOrEqual(0);
    expect(cop).toBeLessThanOrEqual(100);
  });

  it('deep ITM call has high probability of profit (>70%)', () => {
    // costBasis is low, stock well above strike
    const leg = makeLeg({ type: 'call', direction: 'long', strikePrice: 80, expiryDate, costBasis: 1 });
    const cop = calcCop({ legs: [leg], stockPrice: 100, r: 0.05, q: 0, baseIV: 0.2, ivMult: 1, today, N: 5000 });
    expect(cop).toBeGreaterThan(70);
  });
});

// ─── findBreakevens ───────────────────────────────────────────────────────────

describe('findBreakevens', () => {
  it('single zero crossing via linear interpolation', () => {
    const prices    = [90, 95, 100, 105, 110];
    const expiryPnl = [-500, -250, 0, 250, 500];
    const be = findBreakevens(prices, expiryPnl);
    // exact zero at index 2 (price=100)
    expect(be).toContain(100);
  });

  it('interpolates crossing between two points', () => {
    const prices    = [90, 100, 110];
    const expiryPnl = [-300, 200, 700];
    const be = findBreakevens(prices, expiryPnl);
    // crossing between 90 and 100: x = 90 - (-300)*(10)/500 = 90+6 = 96
    expect(abs(be[0] - 96)).toBeLessThan(0.1);
  });

  it('no crossing returns empty array', () => {
    expect(findBreakevens([90, 100, 110], [100, 200, 300])).toHaveLength(0);
    expect(findBreakevens([90, 100, 110], [-100, -200, -300])).toHaveLength(0);
  });

  it('two breakevens for a strangle-like P&L curve', () => {
    const prices    = [80, 90, 100, 110, 120];
    const expiryPnl = [500, -200, -500, -200, 500];
    const be = findBreakevens(prices, expiryPnl);
    expect(be).toHaveLength(2);
  });
});
