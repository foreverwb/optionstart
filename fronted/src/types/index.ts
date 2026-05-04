// ── 期权类型 ──

export type OptionType = 'call' | 'put';
export type Direction = 'long' | 'short';
export type DisplayMode = 'dollar' | 'pct' | 'risk' | 'contract';
export type ViewMode = 'graph' | 'table';

// ── 期权合约 ──

export interface OptionContract {
  /** Futu 合约代码，e.g. "US.QQQ250502C473000" */
  code: string;
  type: OptionType;
  /** 行权价，单位：USD，精度：2 位小数 */
  strikePrice: number;
  /** 到期日，格式 "YYYY-MM-DD" */
  strikeTime: string;
  /** 每份合约对应股数（通常为 100，禁止硬编码） */
  lotSize: number;
  /** 最新成交价，单位：USD，精度：2 位小数 */
  lastPrice: number;
  /** 买一价，单位：USD，精度：2 位小数 */
  bidPrice: number;
  /** 卖一价，单位：USD，精度：2 位小数 */
  askPrice: number;
  /** 成交量，单位：手 */
  volume: number;
  /** 未平仓量，单位：手 */
  openInterest: number;
  /** 隐含波动率，小数表示（e.g. 0.25 = 25%），精度：4 位小数 */
  impliedVolatility: number;
  /** Delta，范围 [-1, 1]，精度：4 位小数 */
  delta: number;
  /** Gamma，单位：每 1 USD 标的价格变动，精度：4 位小数 */
  gamma: number;
  /** Vega，单位：每 1% IV 变动对应 USD 变化，精度：4 位小数 */
  vega: number;
  /** Theta，单位：每日 USD 时间价值衰减，精度：4 位小数 */
  theta: number;
  /** Rho，单位：每 1% 利率变动对应 USD 变化，精度：4 位小数 */
  rho: number;
}

// ── 策略腿 ──

export interface Leg {
  /** UUID */
  id: string;
  /** 关联 OptionContract.code */
  contractCode: string;
  type: OptionType;
  direction: Direction;
  /** 合约数量，整数，≥ 1 */
  quantity: number;
  /** 行权价，单位：USD，精度：2 位小数 */
  strikePrice: number;
  /** 到期日，格式 "YYYY-MM-DD" */
  expiryDate: string;
  /**
   * 建仓成本（用户自定义或市场价），单位：USD/股，精度：2 位小数。
   * P&L 计算基准：当前理论价 - costBasis。
   */
  costBasis: number;
  /** true 时此腿从 P&L / Greeks 计算中排除 */
  excluded: boolean;
}

// ── 到期日 ──

export interface ExpiryDate {
  /** JS Date 对象，代表到期日 */
  date: Date;
  /** 显示标签，e.g. "May 2" */
  label: string;
  /** 月份分组标签，e.g. "May 2025" */
  monthLabel: string;
}

// ── 策略 ──

export interface Strategy {
  /** UUID */
  id: string;
  name: string;
  ticker: string;
  /** 标的建仓时股价，单位：USD，精度：2 位小数 */
  stockPrice: number;
  legs: Leg[];
  /** Unix 毫秒时间戳 */
  createdAt: number;
  /** Unix 毫秒时间戳 */
  updatedAt: number;
}

// ── 策略模板 ──

export interface TemplateLeg {
  type: OptionType;
  direction: Direction;
  /**
   * 相对于当前股价的行权价偏移，单位：USD。
   * 正数 = OTM call / ITM put，负数 = ITM call / OTM put，0 = ATM。
   */
  strikeOffset: number;
  /** 数量乘数，相对基础 1 手的倍数，整数 */
  qtyMultiplier: number;
  /**
   * 相对于最近到期日的偏移索引。
   * 0 = 最近选中到期日，1 = 下一个到期日，以此类推。
   */
  expiryOffset: number;
}

export interface StrategyTemplate {
  /** 唯一标识键，e.g. "bull_call_spread" */
  key: string;
  name: string;
  /** 分组分类，e.g. "Spreads" | "Income" | "Volatility" */
  category: string;
  description: string;
  legs: TemplateLeg[];
}

// ── Greeks ──

export interface Greeks {
  /** 组合 Delta，正数 = 看涨偏，精度：4 位小数 */
  delta: number;
  /** 组合 Gamma，精度：4 位小数 */
  gamma: number;
  /** 组合 Vega，精度：4 位小数 */
  vega: number;
  /** 组合 Theta（日衰减），通常为负数，精度：4 位小数 */
  theta: number;
  /** 组合 Rho，精度：4 位小数 */
  rho: number;
}

// ── P&L 结果 ──

export interface PnlResult {
  /** 价格轴数组，单位：USD */
  prices: number[];
  /** 中间日期理论 P&L，单位：USD（每份合约），与 prices 等长 */
  pnl: number[];
  /** 到期日内在价值 P&L，单位：USD（每份合约），与 prices 等长 */
  expiryPnl: number[];
}

// ── Web Worker 消息类型（discriminated union）──

export interface CalcPnlRequest {
  type: 'CALC_PNL';
  requestId: string;
  payload: {
    prices: number[];
    legs: Leg[];
    /** 当前日期到到期日的进度，范围 [0, 1] */
    T_frac: number;
    /** 标的当前股价，单位：USD */
    stockPrice: number;
    /** 基础隐含波动率，小数表示 */
    baseIV: number;
    /** IV 乘数，范围 [0.5, 3.0] */
    ivMult: number;
    /** 无风险利率，小数表示（e.g. 0.053） */
    r: number;
    /** 股息率，小数表示 */
    q: number;
    today: string; // ISO 日期字符串
    /** 每份合约佣金，单位：USD */
    commission: number;
  };
}

export interface CalcGreeksRequest {
  type: 'CALC_GREEKS';
  requestId: string;
  payload: {
    legs: Leg[];
    /** 标的当前股价，单位：USD */
    stockPrice: number;
    /** 基础隐含波动率，小数表示 */
    baseIV: number;
    /** IV 乘数，范围 [0.5, 3.0] */
    ivMult: number;
    /** 无风险利率，小数表示 */
    r: number;
    /** 股息率，小数表示 */
    q: number;
    today: string; // ISO 日期字符串
  };
}

export interface CalcCopRequest {
  type: 'CALC_COP';
  requestId: string;
  payload: {
    legs: Leg[];
    /** 标的当前股价，单位：USD */
    stockPrice: number;
    /** 无风险利率，小数表示 */
    r: number;
    /** 股息率，小数表示 */
    q: number;
    /** 基础隐含波动率，小数表示 */
    baseIV: number;
    /** IV 乘数，范围 [0.5, 3.0] */
    ivMult: number;
    today: string; // ISO 日期字符串
    /** Monte Carlo 模拟次数，默认 10000 */
    N?: number;
  };
}

export interface CalcHeatmapRequest {
  type: 'CALC_HEATMAP';
  requestId: string;
  payload: {
    prices: number[];
    /** 各列对应的时间分数数组，每项范围 [0, 1] */
    dateFracs: number[];
    legs: Leg[];
    /** 标的当前股价，单位：USD */
    stockPrice: number;
    /** 基础隐含波动率，小数表示 */
    baseIV: number;
    /** IV 乘数，范围 [0.5, 3.0] */
    ivMult: number;
    /** 无风险利率，小数表示 */
    r: number;
    /** 股息率，小数表示 */
    q: number;
    today: string; // ISO 日期字符串
    /** 每份合约佣金，单位：USD */
    commission: number;
  };
}

export type ComputeRequest =
  | CalcPnlRequest
  | CalcGreeksRequest
  | CalcCopRequest
  | CalcHeatmapRequest;

export interface CalcPnlResponse {
  type: 'CALC_PNL';
  requestId: string;
  result: Pick<PnlResult, 'pnl' | 'expiryPnl'>;
}

export interface CalcGreeksResponse {
  type: 'CALC_GREEKS';
  requestId: string;
  result: Greeks;
}

export interface CalcCopResponse {
  type: 'CALC_COP';
  requestId: string;
  /** 盈利概率，范围 [0, 100]，精度：1 位小数 */
  result: number;
}

export interface CalcHeatmapResponse {
  type: 'CALC_HEATMAP';
  requestId: string;
  /** 热力矩阵，行 = 价格，列 = 日期，单位：USD */
  result: number[][];
}

export interface ComputeErrorResponse {
  type: 'ERROR';
  requestId: string;
  message: string;
}

export type ComputeResponse =
  | CalcPnlResponse
  | CalcGreeksResponse
  | CalcCopResponse
  | CalcHeatmapResponse
  | ComputeErrorResponse;

// ── 计算统计结果 ──

export interface ComputedStats {
  /** 净权利金（正 = 净收入，负 = 净支出），单位：USD */
  netDebit: number;
  /** 最大亏损，单位：USD（负无穷表示无限风险） */
  maxLoss: number;
  /** 最大盈利，单位：USD（正无穷表示无限收益） */
  maxProfit: number;
  /** 盈利概率，范围 [0, 100]，精度：1 位小数 */
  cop: number;
  /** 盈亏平衡点价格数组，单位：USD，精度：2 位小数 */
  breakevens: number[];
  /** 未实现盈亏，单位：USD */
  unrealizedPnl: number;
  netGreeks: Greeks;
}

// ── 全局应用状态 ──

export interface AppState {
  // 标的
  ticker: string;
  /** 标的当前股价，单位：USD，精度：2 位小数 */
  stockPrice: number;
  /** 股息率，小数表示（e.g. 0.015 = 1.5%） */
  dividendYield: number;
  /** 无风险利率，小数表示（e.g. 0.053 = 5.3%） */
  riskFreeRate: number;

  // 期权数据
  expiryDates: ExpiryDate[];
  /** key: 到期日字符串 "YYYY-MM-DD" */
  optionChain: Map<string, OptionContract[]>;

  // 策略构建
  selectedExpiry: string | null;
  legs: Leg[];
  selectedLegId: string | null;

  // 控件状态
  /** 日期滑块进度，范围 [0, 1]（0 = today，1 = expiry） */
  dateProgress: number;
  /** 价格范围百分比，范围 [3, 20] */
  rangePercent: number;
  /** IV 乘数，范围 [0.5, 3.0] */
  ivMultiplier: number;
  displayMode: DisplayMode;
  viewMode: ViewMode;
  showProbDist: boolean;
  /** 每份合约佣金，单位：USD */
  commissionPerContract: number;

  // 计算结果
  computedStats: ComputedStats | null;
}
