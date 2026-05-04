/**
 * Black-Scholes-Merton 定价引擎
 *
 * 纯函数，无副作用。所有高开销调用（calcPnl / calcCop）必须在 Web Worker 中执行。
 */

import type { Greeks, Leg } from '../types/index.ts';

// ─── 内部常量 ────────────────────────────────────────────────────────────────

const SQRT2PI = Math.sqrt(2 * Math.PI);
const INV_365 = 1 / 365;
/** 年化 T 最小钳制值，避免除零 */
const T_MIN = 0.001;
/** 近到期判断阈值（≈1 天），T 低于此值返回退化 Greeks */
const T_NEAR_EXPIRY = 1 / 365;
/** US 股票期权每手股数（标准值，不可在业务数据模型中硬编码） */
const SHARES_PER_CONTRACT = 100;

// ─── 概率函数 ────────────────────────────────────────────────────────────────

/**
 * 累积标准正态分布函数（CDF）
 *
 * 使用 Abramowitz & Stegun 7.1.26 + 正态关系：
 *   ncdf(x) = 0.5 * (1 + erf(x / √2))
 * 最大误差 < 7.5e-8，满足精度要求 < 1e-7。
 *
 * @example
 * ncdf(0)    // ≈ 0.5
 * ncdf(1.96) // ≈ 0.975
 */
export function ncdf(x: number): number {
  // A&S 26.2.17 rational-polynomial approximation to normal CDF
  // max |ε| < 7.5e-8
  const p  = 0.2316419;
  const b1 =  0.319381530;
  const b2 = -0.356563782;
  const b3 =  1.781477937;
  const b4 = -1.821255978;
  const b5 =  1.330274429;

  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const poly = t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
  const approx = 1 - poly * Math.exp(-0.5 * x * x) / SQRT2PI;
  return x >= 0 ? approx : 1 - approx;
}

/**
 * 标准正态概率密度函数（PDF）
 *
 * @example
 * npdf(0) // ≈ 0.3989
 */
export function npdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT2PI;
}

// ─── BSM 定价 ────────────────────────────────────────────────────────────────

/**
 * 欧式期权 Black-Scholes-Merton 理论价格
 *
 * @param S     标的当前价格
 * @param K     行权价
 * @param T     到期年数（≤ 0 返回内在价值）
 * @param r     连续复利无风险利率（小数，如 0.053）
 * @param sigma 隐含波动率（小数，如 0.25）
 * @param q     连续股息率（小数）
 * @param type  'call' | 'put'
 *
 * @example
 * price(100, 100, 0.25, 0.05, 0.2, 0, 'call') // ≈ 5.867
 */
export function price(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  q: number,
  type: 'call' | 'put',
): number {
  if (T <= 0) {
    return type === 'call'
      ? Math.max(0, S - K)
      : Math.max(0, K - S);
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const Sq = S * Math.exp(-q * T); // forward-adjusted spot
  const Ke = K * Math.exp(-r * T); // discounted strike

  return type === 'call'
    ? Sq * ncdf(d1)  - Ke * ncdf(d2)
    : Ke * ncdf(-d2) - Sq * ncdf(-d1);
}

// ─── Greeks ──────────────────────────────────────────────────────────────────

/**
 * 欧式期权完整 Greeks
 *
 * T < 1/365 时返回退化值（避免数值爆炸）：
 *   call → delta=1, put → delta=0, gamma/vega/theta/rho=0
 *
 * - delta: ∂V/∂S
 * - gamma: ∂²V/∂S²
 * - vega:  ∂V/∂(σ×100)，单位：每 1% IV 变动
 * - theta: ∂V/∂t / 365，单位：每日衰减
 * - rho:   ∂V/∂(r×100)，单位：每 1% 利率变动
 *
 * @example
 * greeks(100, 100, 0.25, 0.05, 0.2, 0, 'call')
 * // { delta≈0.596, gamma≈0.0389, vega≈0.195, theta≈-0.0137, rho≈0.131 }
 */
export function greeks(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  q: number,
  type: 'call' | 'put',
): Greeks {
  if (T < T_NEAR_EXPIRY) {
    return { delta: type === 'call' ? 1 : 0, gamma: 0, vega: 0, theta: 0, rho: 0 };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const Sq  = S * Math.exp(-q * T);
  const Ke  = K * Math.exp(-r * T);
  const phi = npdf(d1);
  const nd1  = ncdf(d1);
  const nd1m = ncdf(-d1);

  const delta = type === 'call'
    ?  Math.exp(-q * T) * nd1
    : -Math.exp(-q * T) * nd1m;

  const gamma = Math.exp(-q * T) * phi / (S * sigma * sqrtT);

  // vega per 1% move in IV (÷100)
  const vega = Sq * phi * sqrtT / 100;

  // theta per calendar day (÷365)
  const theta = type === 'call'
    ? (-Sq * phi * sigma / (2 * sqrtT) - r * Ke * ncdf(d2)  + q * Sq * nd1)  * INV_365
    : (-Sq * phi * sigma / (2 * sqrtT) + r * Ke * ncdf(-d2) - q * Sq * nd1m) * INV_365;

  // rho per 1% move in r (÷100)
  const rho = type === 'call'
    ?  Ke * T * ncdf(d2)  / 100
    : -Ke * T * ncdf(-d2) / 100;

  return { delta, gamma, vega, theta, rho };
}

// ─── P&L 曲线 ────────────────────────────────────────────────────────────────

/** calcPnl 参数 */
export interface CalcPnlParams {
  /** 价格轴，单位 USD */
  prices: number[];
  legs: Leg[];
  /** 日期进度，0=今天，1=到期日 */
  T_frac: number;
  stockPrice: number;
  baseIV: number;
  ivMult: number;
  r: number;
  q: number;
  today: Date;
  /** 每份合约佣金，单位 USD */
  commission: number;
}

/**
 * 批量计算 P&L 曲线（理论值 + 到期内在值）
 *
 * pnl:       T_frac 对应日期的理论 P&L（USD）
 * expiryPnl: 到期日内在价值 P&L（USD）
 *
 * 排除 leg.excluded === true 的腿。
 *
 * @example
 * // 单腿多头 call，ATM，到期前
 * const r = calcPnl({ prices:[100,105,110], legs:[...], T_frac:0.5, ... })
 * r.pnl        // [负, 接近0, 正]
 * r.expiryPnl  // [负, 负, 正]
 */
export function calcPnl(params: CalcPnlParams): { pnl: number[]; expiryPnl: number[] } {
  const { prices, legs, T_frac, baseIV, ivMult, r, q, today, commission } = params;
  const sig    = baseIV * ivMult;
  const active = legs.filter(l => !l.excluded);
  const todayMs = today.getTime();

  const pnl = prices.map(px => {
    let sum = 0;
    for (const leg of active) {
      const expMs  = new Date(leg.expiryDate).getTime();
      const fullT  = Math.max((expMs - todayMs) / (365 * 24 * 3600 * 1000), T_MIN);
      const T      = fullT * (1 - T_frac);
      const theo   = T <= T_MIN
        ? Math.max(0, leg.type === 'call' ? px - leg.strikePrice : leg.strikePrice - px)
        : price(px, leg.strikePrice, T, r, sig, q, leg.type);
      const mult   = leg.direction === 'long' ? 1 : -1;
      sum += mult * (theo - leg.costBasis) * leg.quantity * SHARES_PER_CONTRACT
           - commission * leg.quantity;
    }
    return sum;
  });

  const expiryPnl = prices.map(px => {
    let sum = 0;
    for (const leg of active) {
      const iv   = Math.max(0, leg.type === 'call' ? px - leg.strikePrice : leg.strikePrice - px);
      const mult = leg.direction === 'long' ? 1 : -1;
      sum += mult * (iv - leg.costBasis) * leg.quantity * SHARES_PER_CONTRACT
           - commission * leg.quantity;
    }
    return sum;
  });

  return { pnl, expiryPnl };
}

// ─── 组合 Greeks ─────────────────────────────────────────────────────────────

/** calcNetGreeks 参数 */
export interface CalcNetGreeksParams {
  legs: Leg[];
  stockPrice: number;
  baseIV: number;
  ivMult: number;
  r: number;
  q: number;
  today: Date;
}

/**
 * 计算策略组合净 Greeks
 *
 * 公式：Σ(方向 × 单腿Greeks × 数量 × SHARES_PER_CONTRACT)
 * 排除 leg.excluded === true 的腿。
 *
 * @example
 * // 多头 call，delta ≈ +股数×单腿delta
 * calcNetGreeks({ legs: [longCall], stockPrice: 100, ... })
 */
export function calcNetGreeks(params: CalcNetGreeksParams): Greeks {
  const { legs, stockPrice, baseIV, ivMult, r, q, today } = params;
  const sig     = baseIV * ivMult;
  const active  = legs.filter(l => !l.excluded);
  const todayMs = today.getTime();

  let delta = 0, gamma = 0, vega = 0, theta = 0, rho = 0;

  for (const leg of active) {
    const expMs = new Date(leg.expiryDate).getTime();
    const T     = Math.max((expMs - todayMs) / (365 * 24 * 3600 * 1000), T_MIN);
    const gk    = greeks(stockPrice, leg.strikePrice, T, r, sig, q, leg.type);
    const sign  = leg.direction === 'long' ? 1 : -1;
    const scale = sign * leg.quantity * SHARES_PER_CONTRACT;
    delta += gk.delta * scale;
    gamma += gk.gamma * scale;
    vega  += gk.vega  * scale;
    theta += gk.theta * scale;
    rho   += gk.rho   * scale;
  }

  return { delta, gamma, vega, theta, rho };
}

// ─── Monte Carlo 盈利概率 ────────────────────────────────────────────────────

/** calcCop 参数 */
export interface CalcCopParams {
  legs: Leg[];
  stockPrice: number;
  r: number;
  q: number;
  baseIV: number;
  ivMult: number;
  today: Date;
  /** Monte Carlo 模拟次数，默认 10000 */
  N?: number;
}

/**
 * Monte Carlo 盈利概率（Chance of Profit）
 *
 * 使用 GBM + Box-Muller 变换模拟到期日股价，
 * 计算策略组合盈利概率（P&L > 0 的比例）。
 *
 * 参考到期日取第一条非排除腿的 expiryDate。
 * N 默认 10000，增大可提高精度但速度变慢。
 *
 * @returns 盈利概率，范围 [0, 100]
 *
 * @example
 * // ATM long call，约 50% 盈利概率
 * calcCop({ legs: [atmLongCall], stockPrice: 100, ... }) // ≈ 50
 */
export function calcCop(params: CalcCopParams): number {
  const { legs, stockPrice, r, q, baseIV, ivMult, today, N = 10000 } = params;
  const active = legs.filter(l => !l.excluded);
  if (active.length === 0) return 50;

  const refLeg = active[0];
  const todayMs = today.getTime();
  const expMs   = new Date(refLeg.expiryDate).getTime();
  const T       = Math.max((expMs - todayMs) / (365 * 24 * 3600 * 1000), T_MIN);
  const sig     = baseIV * ivMult;

  // GBM drift and diffusion
  const mu = (r - q - 0.5 * sig * sig) * T;
  const sv = sig * Math.sqrt(T);

  let wins = 0;

  // Box-Muller: generate pairs, use both z values
  for (let i = 0; i < N; i += 2) {
    const u = Math.random();
    const v = Math.random();
    const m = Math.sqrt(-2 * Math.log(u));
    const z0 = m * Math.cos(2 * Math.PI * v);
    const z1 = m * Math.sin(2 * Math.PI * v);

    for (const z of i + 1 < N ? [z0, z1] : [z0]) {
      const ST  = stockPrice * Math.exp(mu + sv * z);
      let pnl   = 0;
      for (const leg of active) {
        const iv   = Math.max(0, leg.type === 'call' ? ST - leg.strikePrice : leg.strikePrice - ST);
        const mult = leg.direction === 'long' ? 1 : -1;
        pnl += mult * (iv - leg.costBasis) * leg.quantity * SHARES_PER_CONTRACT;
      }
      if (pnl > 0) wins++;
    }
  }

  return (wins / N) * 100;
}

// ─── 盈亏平衡点 ──────────────────────────────────────────────────────────────

/**
 * 找出 P&L 曲线穿越零线的价格点（线性插值）
 *
 * 对 expiryPnl 数组进行扫描，寻找相邻点之间的符号变化，
 * 使用线性插值估算精确穿越价格。
 *
 * @param prices    与 expiryPnl 等长的价格轴
 * @param expiryPnl 到期 P&L 数组
 * @returns         盈亏平衡点价格数组（升序）
 *
 * @example
 * findBreakevens([90,95,100,105,110], [-500,-200,100,300,500]) // [≈97.5]
 */
export function findBreakevens(prices: number[], expiryPnl: number[]): number[] {
  const breakevens: number[] = [];

  for (let i = 0; i < expiryPnl.length - 1; i++) {
    const y0 = expiryPnl[i];
    const y1 = expiryPnl[i + 1];

    // sign change (excluding exact zero crossing handled below)
    if (y0 === 0) {
      breakevens.push(prices[i]);
      continue;
    }
    if (y0 * y1 < 0) {
      // linear interpolation: x = x0 - y0 * (x1 - x0) / (y1 - y0)
      const x = prices[i] - y0 * (prices[i + 1] - prices[i]) / (y1 - y0);
      breakevens.push(x);
    }
  }

  return breakevens;
}
