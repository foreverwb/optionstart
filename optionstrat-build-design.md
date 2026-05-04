# OptionStrat Build 模块 — 从 0-1 详细设计方案

> 版本：v1.0 | 日期：2026-05-04  
> 数据源：Futu OpenAPI (get_option_chain + get_market_snapshot)  
> 原型参考：optionstrat_build_prototype_v2.html

---

## 一、产品原型逆向分析

### 1.1 原型功能清单（从代码逆向提取）

基于对 prototype HTML 的逐行分析，Build 模块包含以下 **7 大功能区域**、**42 个独立功能点**：

| 区域 | 功能点 | 原型实现状态 |
|------|--------|-------------|
| **TopBar** | Ticker 搜索 + 下拉建议、实时价格显示、Live 状态指示灯、Strategy 模板入口、Edit Legs 入口、Save 按钮 | Mock 数据，5 个预设 ticker |
| **Expiration Timeline** | 到期日时间线（按月分组）、天数倒计时 badge、Earnings/Ex-Div 事件标记、已有 leg 的到期日标记 | Mock 数据，genExpiries() 硬编码 |
| **Strikes 可视化** | 行权价轴线、当前股价标记线、Call/Put 成交量柱状图（Canvas）、可拖拽的 Leg 标签（支持 Shift 全选移动） | BSM 模拟 volume，拖拽功能完整 |
| **Stats Bar** | Net Debit/Credit、Max Loss、Max Profit、Chance of Profit（Monte Carlo）、Breakevens、Unrealized P&L、Net Greeks 摘要 | BSM 计算引擎完整 |
| **Chart/Table 视图** | P&L 曲线图（Chart.js）、到期日 P&L 虚线、概率分布叠加、热力表（价格×日期矩阵）、4 种显示模式（$, %, %Risk, Contract） | 完整实现 |
| **Bottom Controls** | 日期滑块（Today→Expiry）、价格范围滑块（±3%~±20%）、IV 乘数滑块（0.5x~3x）、Graph/Table 切换、显示模式切换、Prob Dist 开关 | 完整实现 |
| **Leg Editor Panel** | 腿列表（带 Call/Put badge）、添加 4 种腿、数量调整（±按钮）、自定义 Cost Basis、Exclude/Include 开关、删除腿、Net Greeks 面板（Δ/Γ/V/Θ/ρ/IV）、Commission 设置、策略保存/加载列表 | 完整实现 |
| **Strategy Modal** | 4 层分级（Novice/Intermediate/Advanced/Custom）、24 个预设策略模板、每个带方向标记和描述 | 完整实现 |

### 1.2 原型中的 BSM 引擎分析

原型内嵌了一个完整的 Black-Scholes-Merton 定价引擎：

```
BSM.ncdf(x)     → 累积正态分布（Abramowitz & Stegun 近似）
BSM.npdf(x)     → 正态概率密度
BSM.price(...)   → 欧式期权定价（含股息率 q）
BSM.greeks(...)  → 五项 Greeks（delta, gamma, vega, theta, rho）
BSM.cop(...)     → Monte Carlo 模拟盈利概率（默认 N=5000~10000）
```

**关键参数**：r=0.053（无风险利率）, q（股息率/ticker 维度）, sig（baseIV × ivMult）

### 1.3 原型中的 P&L 计算管线

```
用户操作 → Legs 数据更新
  → calcPnL(prices, T_frac)  : 中间日期理论价 → 减去 costBasis → 累加多腿
  → calcExpiry(prices)        : 到期日内在价值 → 减去 costBasis → 累加多腿
  → transformY(v)             : 按 displayMode 转换单位
  → Chart.js / HeatTable      : 渲染
```

---

## 二、系统架构设计

### 2.1 整体分层

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + TypeScript)                              │
│  ┌──────────┬──────────┬──────────┬──────────┬────────────┐ │
│  │ TopBar   │ Expiry   │ Strikes  │ Chart/   │ Leg Editor │ │
│  │ Module   │ Timeline │ Visual   │ Table    │ Panel      │ │
│  └──────────┴──────────┴──────────┴──────────┴────────────┘ │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  State Manager (Zustand)                               │  │
│  │  ticker, stockPrice, legs[], expiries[], controls...   │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Compute Engine (Web Worker)                           │  │
│  │  BSM pricing, Greeks, Monte Carlo COP, P&L matrix     │  │
│  └────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Backend (Node.js / Python FastAPI)                         │
│  ┌──────────┬──────────┬──────────┬──────────────────────┐  │
│  │ API      │ Cache    │ Data     │ User/Strategy        │  │
│  │ Gateway  │ Layer    │ Transform│ Persistence          │  │
│  └──────────┴──────────┴──────────┴──────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Data Source Layer                                          │
│  ┌──────────────────────┬──────────────────────────────┐    │
│  │ Futu OpenAPI (OpenD) │ 补充数据源（Events/HV）       │    │
│  │ • get_option_chain   │ • Financial Modeling Prep     │    │
│  │ • get_market_snapshot│ • Alpha Vantage              │    │
│  │ • sub (WebSocket)    │                              │    │
│  └──────────────────────┴──────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 技术选型

| 层 | 技术 | 理由 |
|---|------|------|
| 前端框架 | React 18 + TypeScript | 组件化、类型安全、生态成熟 |
| 状态管理 | Zustand | 轻量级、无 boilerplate、性能好 |
| 图表 | Chart.js 4 + react-chartjs-2 | 原型已验证可行，Canvas 性能好 |
| 拖拽 | @dnd-kit/core | React 拖拽标准库 |
| 样式 | TailwindCSS + CSS Variables | 复用原型设计 token |
| 计算引擎 | Web Worker（独立线程） | Monte Carlo 不阻塞 UI |
| 后端 | Python FastAPI | 与 Futu SDK（moomoo）原生集成 |
| 缓存 | Redis | 期权链缓存（30s TTL 匹配限频） |
| 数据库 | PostgreSQL | 策略保存、用户数据 |
| WebSocket | FastAPI WebSocket / Socket.IO | 实时报价推送 |
| 部署 | Docker Compose | OpenD + Backend + Frontend 统一编排 |

### 2.3 Futu OpenAPI 数据流设计

#### 阶段一：加载期权链结构

```python
# 1. 获取到期日列表
ret, dates = quote_ctx.get_option_expiration_date(code='US.QQQ')

# 2. 按月分批获取期权链（每 30 天一批，间隔 3s 防限频）
for month_start, month_end in monthly_windows(dates):
    ret, chain = quote_ctx.get_option_chain(
        code='US.QQQ',
        start=month_start,
        end=month_end,
        option_type=OptionType.ALL
    )
    # 返回: code, strike_price, option_type, strike_time, lot_size
    cache.set(f"chain:{ticker}:{month_start}", chain, ttl=300)
```

#### 阶段二：获取动态报价

```python
# 3. 用期权 code 批量获取快照（每次最多 400 个）
option_codes = [row['code'] for row in chain]
for batch in chunks(option_codes, 400):
    ret, snapshot = quote_ctx.get_market_snapshot(batch)
    # 返回: last_price, option_delta, option_gamma, option_vega,
    #        option_theta, option_rho, option_implied_volatility,
    #        option_open_interest, volume, option_strike_price
```

#### 阶段三：实时订阅（进阶）

```python
# 4. 对用户选中的到期日合约订阅实时报价
quote_ctx.subscribe(codes=selected_option_codes, sub_types=[SubType.QUOTE])
# WebSocket 推送价格变化到前端
```

#### 限频策略

| 接口 | 限制 | 策略 |
|------|------|------|
| get_option_chain | 10次/30秒，跨度≤30天 | 按月分批请求 + Redis 缓存 5min |
| get_market_snapshot | 每次≤400 code | 分批请求 + 增量更新 |
| subscribe | 需订阅后才有推送 | 只订阅当前选中到期日的合约 |

---

## 三、数据模型设计

### 3.1 核心数据结构（TypeScript）

```typescript
// ── 期权合约 ──
interface OptionContract {
  code: string;            // Futu 合约代码 e.g. "US.QQQ250502C473000"
  type: 'call' | 'put';
  strikePrice: number;
  strikeTime: string;      // "2025-05-02"
  lotSize: number;         // 每份合约股数 (通常100)
  // 动态数据（来自 get_market_snapshot）
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

// ── 策略腿 ──
interface Leg {
  id: string;              // uuid
  contractCode: string;    // 关联 OptionContract.code
  type: 'call' | 'put';
  direction: 'long' | 'short';
  quantity: number;
  strikePrice: number;
  expiryDate: string;
  costBasis: number;       // 用户自定义或市场价
  excluded: boolean;       // 排除计算标记
}

// ── 策略 ──
interface Strategy {
  id: string;
  name: string;
  ticker: string;
  stockPrice: number;
  legs: Leg[];
  createdAt: number;
  updatedAt: number;
}

// ── 全局状态 ──
interface AppState {
  // 标的
  ticker: string;
  stockPrice: number;
  dividendYield: number;   // q
  riskFreeRate: number;     // r

  // 期权数据
  expiryDates: ExpiryDate[];
  optionChain: Map<string, OptionContract[]>; // key: expiryDate

  // 策略构建
  selectedExpiry: string | null;
  legs: Leg[];
  selectedLegId: string | null;

  // 控件状态
  dateProgress: number;     // 0~1 (today → expiry)
  rangePercent: number;     // 3~20
  ivMultiplier: number;     // 0.5~3.0
  displayMode: 'dollar' | 'pct' | 'risk' | 'contract';
  viewMode: 'graph' | 'table';
  showProbDist: boolean;
  commissionPerContract: number;
}
```

### 3.2 后端 API 设计

| 端点 | 方法 | 描述 | 数据源 |
|------|------|------|--------|
| `/api/search?q=` | GET | 搜索标的股票 | Futu API / 本地缓存 |
| `/api/stock/{ticker}` | GET | 标的当前价格 + 基本信息 | get_market_snapshot |
| `/api/options/{ticker}/expiries` | GET | 到期日列表 | get_option_expiration_date |
| `/api/options/{ticker}/chain?expiry=` | GET | 特定到期日的期权链 + 报价 | get_option_chain + get_market_snapshot |
| `/api/options/snapshot` | POST | 批量获取合约快照 | get_market_snapshot |
| `/ws/quotes` | WebSocket | 实时报价推送 | Futu subscribe |
| `/api/strategies` | GET/POST | 策略 CRUD | PostgreSQL |
| `/api/strategies/{id}` | GET/PUT/DELETE | 单个策略操作 | PostgreSQL |

---

## 四、前端模块设计

### 4.1 组件树

```
<App>
├── <TopBar>
│   ├── <Logo />
│   ├── <NavPills />  (Build / Optimize / Flow / Watchlist)
│   ├── <TickerSearch>
│   │   ├── <TickerInput />
│   │   ├── <TickerDropdown />
│   │   └── <PriceDisplay />
│   ├── <StrategyButton />
│   ├── <EditLegsButton />
│   └── <SaveButton />
├── <ExpirationTimeline>
│   ├── <ExpiryBadge />
│   ├── <EventPills />
│   └── <ExpiryScroller>
│       └── <ExpiryMonth> × N
│           └── <ExpiryButton> × N
├── <StrikesVisualizer>
│   ├── <VolumeCanvas />        (Canvas 绘制)
│   ├── <CurrentPriceLine />
│   ├── <AxisLabels />
│   └── <DraggableLegTag> × N   (@dnd-kit)
├── <StatsBar>
│   ├── <StatCell label="Net Debit/Credit" />
│   ├── <StatCell label="Max Loss" />
│   ├── <StatCell label="Max Profit" />
│   ├── <CopPill />
│   ├── <StatCell label="Breakevens" />
│   ├── <StatCell label="Unrealized P&L" />
│   └── <StatCell label="Greeks" />
├── <ViewArea>
│   ├── <PnlChart />            (Chart.js canvas)
│   └── <HeatTable />           (虚拟化表格)
├── <BottomControls>
│   ├── <DateSlider />
│   ├── <RangeSlider />
│   ├── <IvSlider />
│   ├── <ViewToggle />
│   ├── <DisplayModeGroup />
│   └── <ProbDistToggle />
├── <LegEditorPanel>             (侧滑面板)
│   ├── <LegList>
│   │   └── <LegItem> × N
│   ├── <AddLegButtons />
│   ├── <LegDetailEditor>
│   │   ├── <QuantityControl />
│   │   ├── <CostBasisInput />
│   │   ├── <ExcludeToggle />
│   │   └── <DeleteButton />
│   ├── <NetGreeksPanel />
│   ├── <CommissionInput />
│   └── <SavedStrategiesList />
└── <StrategyModal>              (全屏模态)
    └── <StrategyTier> × 4
        └── <StrategyCard> × N
```

### 4.2 Web Worker 计算引擎

将 BSM 引擎放入 Web Worker 避免主线程阻塞：

```typescript
// worker/compute.worker.ts
self.onmessage = (e: MessageEvent<ComputeRequest>) => {
  switch (e.data.type) {
    case 'CALC_PNL':
      // 输入: prices[], legs[], T_frac, ivMult, r, q, commission
      // 输出: pnlCurve[], expiryPnl[]
      break;
    case 'CALC_GREEKS':
      // 输入: legs[], stockPrice, T, r, sig, q
      // 输出: { delta, gamma, vega, theta, rho }
      break;
    case 'CALC_COP':
      // 输入: legs[], stockPrice, r, q, baseIV, ivMult, expDate, N
      // 输出: copPercent
      break;
    case 'CALC_HEATMAP':
      // 输入: prices[], dateFracs[], legs[], ...
      // 输出: matrix[][]
      break;
  }
};
```

**性能预算**：
- P&L 曲线更新：< 16ms（60fps 拖拽体验）
- Monte Carlo COP（N=10000）：< 50ms
- 热力表完整计算（16 prices × 9 dates）：< 30ms

### 4.3 关键交互状态机

```
[空白] ──选择Ticker──→ [加载期权链] ──加载完成──→ [待选策略]
                                                    │
                        ┌───────────────────────────┘
                        ▼
[待选策略] ──选模板/手动添加腿──→ [策略已构建]
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
        [拖拽行权价]          [调整滑块]            [编辑腿属性]
              │                     │                     │
              └─────────────────────┼─────────────────────┘
                                    ▼
                              [重新计算 P&L]
                                    │
                        ┌───────────┴───────────┐
                        ▼                       ▼
                  [更新图表]              [更新统计栏]
```

---

## 五、BSM 计算引擎详细规格

### 5.1 Black-Scholes-Merton 定价公式

采用含股息的欧式期权定价模型（与原型一致）：

```
C = S·e^(-qT)·N(d1) - K·e^(-rT)·N(d2)
P = K·e^(-rT)·N(-d2) - S·e^(-qT)·N(-d1)

d1 = [ln(S/K) + (r - q + σ²/2)T] / (σ√T)
d2 = d1 - σ√T
```

其中：
- S = 标的当前价格
- K = 行权价
- T = 距到期时间（年）
- r = 无风险利率
- q = 股息率
- σ = 隐含波动率 × IV乘数

### 5.2 Greeks 计算

| Greek | 公式 | 说明 |
|-------|------|------|
| Delta | Call: e^(-qT)·N(d1), Put: -e^(-qT)·N(-d1) | 价格敏感度 |
| Gamma | e^(-qT)·φ(d1) / (S·σ√T) | Delta 变化率 |
| Vega | S·e^(-qT)·φ(d1)·√T / 100 | IV 敏感度 |
| Theta | 复合公式 / 365 | 时间衰减（每日） |
| Rho | Call: K·T·e^(-rT)·N(d2)/100 | 利率敏感度 |

**组合 Greeks = Σ(方向系数 × 单腿Greek × 数量 × 合约乘数)**

### 5.3 Monte Carlo COP

```
步骤：
1. 生成 N 个(默认 10000)标准正态随机数 z
2. 模拟到期价格: ST = S · exp((r-q-σ²/2)T + σ√T · z)
3. 计算每次模拟的策略 P&L = Σ(方向 × (内在价值 - costBasis) × qty × 100)
4. COP = (P&L > 0 的次数) / N × 100%
```

### 5.4 盈亏平衡点计算

在到期日 P&L 曲线上，对价格序列做线性插值找 P&L 穿越零线的交点：

```
对相邻 (price[i], pnl[i]) 和 (price[i+1], pnl[i+1])：
如果 pnl[i] × pnl[i+1] < 0：
  breakeven = price[i] + (price[i+1]-price[i]) × |pnl[i]| / (|pnl[i]| + |pnl[i+1]|)
```

---

## 六、数据源缺口与补充方案

| 缺口 | 影响 | 补充方案 | 优先级 |
|------|------|---------|--------|
| 事件日历（Earnings/Ex-Div） | 原型已展示事件标记 | 接入 Financial Modeling Prep API `/v3/earning_calendar` | P1 |
| IV Rank / IV Percentile | 高级功能 | 自建：每日定时采集 IV → 计算 52 周排名 | P2 |
| 历史波动率（HV） | 对比 IV vs HV | 拉取历史 K 线 → 计算对数收益标准差 × √252 | P2 |
| 无风险利率 | 定价参数 | 接入 FRED API 获取 US Treasury 收益率 | P1 |
| 标的搜索 | Ticker 搜索功能 | 本地维护股票列表（富途 API 有 search 接口） | P1 |

---

## 七、开发阶段划分

### Phase 1: 基础框架 + 本地计算（MVP）

用 Mock 数据 + BSM 引擎实现完整 UI 交互。等价于将原型 HTML 重构为 React 应用。

- 项目脚手架（Vite + React + TS + Tailwind）
- 设计 Token 系统（从原型 CSS 提取）
- Zustand 状态管理
- BSM 计算引擎（Web Worker）
- TopBar + TickerSearch（Mock）
- ExpirationTimeline
- StrikesVisualizer（拖拽）
- StatsBar
- PnlChart（Chart.js）
- HeatTable
- BottomControls（全部滑块/开关）
- LegEditorPanel
- StrategyModal（24 个模板）
- 策略保存/加载（localStorage）

**产出**: 可独立运行的前端应用，与原型功能等价

### Phase 2: 后端 + Futu API 集成

- FastAPI 后端脚手架
- OpenD 连接管理
- 期权链数据服务（含缓存）
- 标的报价服务
- 批量快照服务
- WebSocket 实时推送
- 前端对接真实数据

**产出**: 连接真实数据的完整应用

### Phase 3: 增强功能

- 用户认证
- PostgreSQL 策略持久化
- 事件日历集成
- IV 历史数据采集
- Roll 操作
- 策略导出
- 移动端适配

---

## 八、设计方案自评

### 8.1 可行性评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 数据完备性 | ★★★★☆ | 两个 API 覆盖核心数据，事件日历需补充 |
| 计算准确性 | ★★★★★ | BSM 定价模型成熟，原型引擎可直接复用 |
| 交互还原度 | ★★★★☆ | 拖拽、滑块、图表均有成熟 React 方案 |
| 性能 | ★★★★☆ | Web Worker 隔离计算，Chart.js Canvas 渲染高效 |
| 实时性 | ★★★☆☆ | 富途限频是瓶颈，需依赖缓存 + 增量更新 |
| 开发周期 | ★★★☆☆ | Phase 1 约 3-4 周，Phase 2 约 2-3 周 |

### 8.2 风险点

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 富途限频导致首次加载慢 | 高 | 中 | 预加载常用到期日 + 进度指示 |
| Monte Carlo 在低端设备卡顿 | 中 | 低 | 降低 N + 防抖 + Worker |
| 期权链数据量大（深 OTM 合约多） | 中 | 低 | 只展示 ATM ± 一定范围 |
| OpenD 进程管理复杂 | 中 | 高 | Docker 化 + 健康检查 + 自动重启 |
| 美股期权链到期日跨度大于 30 天限制 | 高 | 中 | 按月分批请求 + 并行（间隔 3s） |

### 8.3 不建议做的事

- **不建议自行计算 IV**：Futu API 已返回 implied_volatility，无需反向求解
- **不建议全量订阅**：只订阅用户当前选中到期日的合约，否则 quota 消耗极快
- **不建议服务端 BSM 计算**：P&L 曲线在拖拽时需要 60fps 刷新，必须在客户端计算
- **不建议用 D3.js 替代 Chart.js**：原型已验证 Chart.js 方案，D3 学习成本高且 Canvas 性能不如 Chart.js

---

## 九、Claude Code 任务指令集

以下为按执行顺序排列的 Claude Code 任务，每条包含完整指令、推荐模型和 effort 配置。

---

### Task 0: 项目初始化

```
指令: 使用 Vite 创建 React + TypeScript 项目。安装依赖：
react, react-dom, zustand, chart.js, react-chartjs-2, @dnd-kit/core,
@dnd-kit/sortable, tailwindcss, postcss, autoprefixer, uuid.
配置 Tailwind，设置 path alias @/ → src/。
创建目录结构：
  src/
    components/    (UI组件)
    engine/        (BSM计算引擎)
    store/         (Zustand状态)
    hooks/         (自定义hooks)
    types/         (TypeScript类型)
    mock/          (Mock数据)
    utils/         (工具函数)
    workers/       (Web Worker)
    styles/        (全局样式)

model: claude-sonnet-4-20250514
effort: low
```

### Task 1: 设计 Token 系统

```
指令: 从以下 CSS 变量中提取设计 token，创建 src/styles/tokens.css
和 tailwind.config.ts 的 extend 配置。

Token 列表（直接从原型提取）：
- 背景色: --bg:#f4f6fa, --surface:#ffffff, --surface2:#f8f9fc, --surface3:#eef1f8
- 边框色: --border:#e2e8f0, --border2:#c8d0e0
- 文字色: --t0:#0d1421, --t1:#3d4a66, --t2:#8594b8, --t3:#b8c3d9
- 语义色: green(#0ab87a), red(#e8364a), blue(#2563eb), amber(#c97a10), purple(#7c3aed)
  每个语义色有 bg/border/text 三个变体
- 阴影: sm/md/lg 三级
- 圆角: 4/6/8/10/12px
- 字体: sans='Inter', mono='IBM Plex Mono'

同时创建 src/styles/globals.css 包含 reset 样式和滚动条样式。

model: claude-sonnet-4-20250514
effort: low
```

### Task 2: TypeScript 类型定义

```
指令: 创建 src/types/index.ts，定义所有核心数据类型。包括：

1. OptionContract: 期权合约（code, type, strikePrice, strikeTime, lotSize,
   lastPrice, bidPrice, askPrice, volume, openInterest, impliedVolatility,
   delta, gamma, vega, theta, rho）
2. Leg: 策略腿（id, contractCode, type, direction, quantity, strikePrice,
   expiryDate, costBasis, excluded）
3. ExpiryDate: 到期日（date: Date, label: string, monthLabel: string）
4. Strategy: 策略（id, name, ticker, stockPrice, legs, createdAt, updatedAt）
5. StrategyTemplate: 策略模板定义（key, name, category, description,
   legs: TemplateLeg[]），TemplateLeg 包含 type, direction, strikeOffset, qtyMultiplier, expiryOffset
6. Greeks: { delta, gamma, vega, theta, rho }
7. PnlResult: { prices: number[], pnl: number[], expiryPnl: number[] }
8. ComputeRequest / ComputeResponse: Worker 消息类型（discriminated union）
9. DisplayMode: 'dollar' | 'pct' | 'risk' | 'contract'
10. ViewMode: 'graph' | 'table'
11. AppState: 完整应用状态（参考设计方案第三部分的定义）

所有 number 类型的金融数据字段加 JSDoc 注释说明单位和精度。

model: claude-sonnet-4-20250514
effort: low
```

### Task 3: BSM 计算引擎

```
指令: 创建 src/engine/bsm.ts，实现 Black-Scholes-Merton 定价引擎。
这是整个应用的计算核心，要求数值精度和性能。

实现以下函数（参考原型中的 BSM 对象，但用 TypeScript 重写）：

1. ncdf(x: number): number
   - 累积正态分布函数，使用 Abramowitz & Stegun 近似
   - 精度要求：误差 < 1e-7

2. npdf(x: number): number
   - 标准正态概率密度函数

3. price(S, K, T, r, sigma, q, type): number
   - 欧式期权 BSM 定价
   - T <= 0 时返回内在价值 max(0, S-K) 或 max(0, K-S)
   - 包含连续股息率 q 的修正

4. greeks(S, K, T, r, sigma, q, type): Greeks
   - 返回完整五项 Greeks
   - T < 1/365 时返回退化值（delta=1或0，其余为0）

5. calcPnl(params: {
     prices: number[], legs: Leg[], T_frac: number,
     stockPrice: number, baseIV: number, ivMult: number,
     r: number, q: number, today: Date, commission: number
   }): { pnl: number[], expiryPnl: number[] }
   - 批量计算 P&L 曲线
   - pnl: 中间日期的理论 P&L
   - expiryPnl: 到期日的内在价值 P&L

6. calcNetGreeks(params: {
     legs: Leg[], stockPrice: number, baseIV: number,
     ivMult: number, r: number, q: number, today: Date
   }): Greeks
   - 组合 Greeks = Σ(方向×单腿Greek×数量×100)

7. calcCop(params: {
     legs: Leg[], stockPrice: number, r: number, q: number,
     baseIV: number, ivMult: number, today: Date, N?: number
   }): number
   - Monte Carlo 盈利概率
   - 默认 N=10000
   - 使用 Box-Muller 变换生成正态随机数

8. findBreakevens(prices: number[], expiryPnl: number[]): number[]
   - 找到 P&L 穿越零线的价格点（线性插值）

每个函数都要有完整的 JSDoc 注释和单元测试用例注释。
编写 src/engine/__tests__/bsm.test.ts 包含至少 10 个测试用例，
验证定价精度（对比已知值）和边界情况。

model: claude-sonnet-4-20250514
effort: high
```

### Task 4: Web Worker 封装

```
指令: 创建 src/workers/compute.worker.ts 和 src/hooks/useComputeWorker.ts。

Worker 接收以下消息类型（用 discriminated union）：
- CALC_PNL: 计算 P&L 曲线 → 返回 { pnl, expiryPnl }
- CALC_GREEKS: 计算组合 Greeks → 返回 Greeks
- CALC_COP: 计算盈利概率 → 返回 number
- CALC_HEATMAP: 计算热力表矩阵 → 返回 number[][]

useComputeWorker hook:
- 初始化 Worker 实例（单例）
- 提供 postMessage 的类型安全封装
- 支持 requestId 匹配请求/响应
- 组件卸载时 terminate Worker
- 暴露 isComputing: boolean 状态
- 对高频调用（拖拽）做 16ms debounce

model: claude-sonnet-4-20250514
effort: medium
```

### Task 5: Zustand 状态管理

```
指令: 创建 src/store/useAppStore.ts，使用 Zustand 管理全局状态。

State 包含：
- ticker, stockPrice, dividendYield, riskFreeRate
- expiryDates: ExpiryDate[]
- optionChain: Map<string, OptionContract[]>
- selectedExpiry: string | null
- legs: Leg[]
- selectedLegId: string | null
- dateProgress: number (0~1)
- rangePercent: number (3~20)
- ivMultiplier: number (0.5~3.0)
- displayMode, viewMode, showProbDist
- commissionPerContract: number
- computedStats: { netDebit, maxLoss, maxProfit, cop, breakevens, unrealizedPnl, netGreeks } | null

Actions:
- setTicker(ticker, price, q, iv)
- setSelectedExpiry(date)
- addLeg(type, direction) — 自动计算 strike 和 costBasis
- updateLeg(id, partial) — 更新腿属性
- removeLeg(id)
- toggleLegExcluded(id)
- loadStrategy(templateKey) — 从模板加载
- setDateProgress / setRangePercent / setIvMultiplier
- setDisplayMode / setViewMode / toggleProbDist
- setCommission
- updateComputedStats(stats) — 由 Worker 回调更新

使用 zustand/middleware 的 persist 中间件将 legs 和 savedStrategies 持久化到 localStorage。
使用 zustand subscribeWithSelector 优化重渲染。

model: claude-sonnet-4-20250514
effort: medium
```

### Task 6: Mock 数据层

```
指令: 创建 src/mock/data.ts，提供开发阶段的 Mock 数据。

1. MOCK_TICKERS: 5 个标的的基础数据
   { QQQ: {price:473.50, q:0.006, iv:0.211, events:{earnings:'May 15', exdiv:'Jun 20'}},
     SPY, AAPL, TSLA, NVDA }

2. generateExpiries(): ExpiryDate[]
   - 生成 2025 年 5 月到 12 月的到期日列表
   - 与原型 genExpiries() 完全一致

3. STRATEGY_TEMPLATES: Record<string, StrategyTemplate>
   - 包含原型中全部 24 个策略模板
   - 每个模板有 name, category('novice'|'intermediate'|'advanced'|'custom'),
     description, legs[]
   - legs 中的 strikeOffset 表示相对 ATM 的百分比偏移

4. generateMockOptionChain(ticker, expiryDate, stockPrice, iv): OptionContract[]
   - 根据标的价格和 IV，生成模拟期权链数据
   - 行权价范围：stockPrice ± 20%
   - 步长：price > 500 → $5, price > 200 → $2, else → $1
   - 使用 BSM 引擎计算理论价格和 Greeks
   - Volume 和 OI 随机生成，ATM 附近更大

5. roundStrike(price: number): number
   - 四舍五入到最近有效行权价

model: claude-sonnet-4-20250514
effort: medium
```

### Task 7: TopBar 组件

```
指令: 创建 src/components/TopBar/TopBar.tsx 及其子组件。

实现原型中的顶部导航栏，包含：

1. Logo — "option" + 蓝色 "strat" 文本
2. NavPills — Build/Optimize/Flow/Watchlist 四个导航按钮，Build 默认激活
3. LiveDot — 7px 圆形闪烁指示灯（CSS animation）
4. TickerSearch：
   - 输入框（mono 字体，14px，粗体）
   - 右侧显示价格（绿色）
   - Focus 时展开下拉建议列表（从 MOCK_TICKERS 筛选）
   - 点击建议项：更新 store.setTicker()，触发加载策略
   - 失焦 160ms 延迟关闭下拉
5. StrategyButton — "⊞ Strategy" 按钮，点击打开 StrategyModal
6. EditLegsButton — "✏ Edit Legs" 按钮，点击打开 LegEditorPanel
7. SaveButton — "💾 Save" 按钮，点击保存当前策略

样式完全还原原型的 #topbar 设计：50px 高，白色背景，底部边框 + 轻阴影。

model: claude-sonnet-4-20250514
effort: medium
```

### Task 8: ExpirationTimeline 组件

```
指令: 创建 src/components/ExpirationTimeline/ExpirationTimeline.tsx。

实现原型中的到期日时间线：

1. 顶部元信息行：
   - ExpiryBadge: 蓝色圆角 badge 显示距到期天数 (e.g. "6d")
   - EventPills: 如果有 earnings/exdiv 事件显示对应 badge

2. 到期日滚动区域：
   - 按月分组（May, Jun, Jul...）
   - 每月有标签 + 日期按钮行
   - 按钮状态：
     - 默认：浅灰文字
     - hover：浅灰背景
     - 选中(sel)：蓝色背景白字 + 阴影
     - 有腿标记(has-leg)：底部绿色小圆点
     - earnings(earn-evt)：右上角 📊
     - ex-div(div-evt)：右上角 💲
   - 点击按钮：store.setSelectedExpiry()
   - 水平可滚动

model: claude-sonnet-4-20250514
effort: medium
```

### Task 9: StrikesVisualizer 组件

```
指令: 创建 src/components/StrikesVisualizer/StrikesVisualizer.tsx。

实现原型中的行权价可视化区域（110px 高）：

1. VolumeCanvas（底层 Canvas）：
   - 在行权价轴上绘制 Call（绿色）和 Put（红色）的成交量柱状图
   - 使用 Canvas 2D API 直接绘制
   - 柱宽根据行权价间距自适应
   - 透明度 0.4，opacity 0.5
   - 在 Phase 1 用 BSM 模拟生成 volume 数据

2. CurrentPriceLine（中间层）：
   - 垂直虚线标记当前股价位置
   - 顶部有蓝色 badge 显示 "TICKER $价格"

3. AxisLabels（底层）：
   - 在底部显示价格刻度
   - 只显示 10 的整数倍刻度

4. DraggableLegTags（顶层）：
   - 每个 leg 渲染为可拖拽标签
   - Call = 绿色背景/边框, Put = 红色背景/边框
   - 显示: 方向箭头 + 行权价 + C/P + 数量
   - 拖拽时实时更新 leg.strikePrice = roundStrike(计算值)
   - 支持 Shift+拖拽 同步移动所有腿
   - 右侧 ✎ 按钮打开 LegEditor 并选中此腿
   - excluded 状态时透明度降低
   - hover 显示 tooltip: "long 1× 473 CALL @ $2.10"

坐标映射：
- sMin = stockPrice × (1 - rangePercent/100 × 1.5)
- sMax = stockPrice × (1 + rangePercent/100 × 1.5)
- toX(strike) = (strike - sMin) / (sMax - sMin) × containerWidth

使用 @dnd-kit/core 实现拖拽，或直接用原型中的 mousedown/mousemove/mouseup 方案。
窗口 resize 时重新绘制。

model: claude-sonnet-4-20250514
effort: high
```

### Task 10: StatsBar 组件

```
指令: 创建 src/components/StatsBar/StatsBar.tsx。

实现原型中的统计信息栏，横向排列 7 个 StatCell：

1. Net Debit / Credit
   - 正值(debit): 琥珀色 "🪙 $XXX Debit"
   - 负值(credit): 绿色 "💰 $XXX Credit"

2. Max Loss
   - 红色 "↘ $XXX" 或 "↘ Infinite"（< -50000 时）

3. Max Profit
   - 绿色 "↗ $XXX" 或 "↗ Unlimited"（> 50000 时）

4. Chance of Profit
   - 圆角 pill badge
   - ≥50%: 绿色底, <50%: 红色底
   - 显示如 "62.3%"

5. Breakevens
   - 蓝色
   - 1 个: "$473.50"
   - 2 个: "$465.00 — $481.00"

6. Unrealized P&L
   - 正: 绿色 "+$XXX"，负: 红色 "-$XXX"
   - 下方小字显示百分比 "+2.3% of cost"

7. Delta / Theta / Vega
   - 灰色文字显示 "+12.3 / -4.5 / +8.2"
   - 点击打开 LegEditorPanel

所有数值从 store.computedStats 读取。
水平可滚动。

model: claude-sonnet-4-20250514
effort: medium
```

### Task 11: PnlChart 组件

```
指令: 创建 src/components/PnlChart/PnlChart.tsx。

使用 Chart.js 4 + react-chartjs-2 实现 P&L 曲线图。

数据集（datasets）：
1. "At Expiration" — 灰色虚线（borderDash:[5,4]），到期日内在价值P&L
2. "P&L" — 主曲线，动态颜色分段：
   - y≥0 段: 绿色(#0ab87a)
   - y<0 段: 红色(#e8364a)
   - fill: 正区域浅绿(0.12透明度)，负区域浅红(0.10透明度)
   - 使用 Chart.js segment 回调实现分段着色
3. "Prob Dist"（可选）— 紫色虚线，对数正态密度曲线
   - 仅 showProbDist=true 时显示
   - 缩放到 P&L 图的 35% 高度范围

Chart.js 插件：
1. zeroLine — 在 y=0 画一条 1.5px 灰色实线
2. curPriceLine — 在当前股价 x 位置画蓝色虚线 + 标注文字

Chart.js 配置：
- responsive:true, maintainAspectRatio:false
- animation: {duration: 180}
- interaction: {mode: 'index', intersect: false}
- 自定义 tooltip（白色背景，mono字体，显示ticker+价格+P&L）
- x 轴: 浅灰网格，mono字体，最多10个刻度
- y 轴: 浅灰网格，mono字体，使用 fmtY 格式化

fmtY 格式化函数（根据 displayMode）:
- dollar: "+$123" / "-$456"
- pct: "12.3%"
- risk: "45%"
- contract: "$1.23"

transformY 转换函数（根据 displayMode）:
- dollar: 原始值
- pct: value / costBasis × 100
- risk: value / |maxLoss| × 100
- contract: value / 100

图表需要在以下场景重绘：
- legs 变化、dateProgress 变化、rangePercent 变化
- ivMultiplier 变化、displayMode 变化、showProbDist 变化
使用 useEffect 监听这些依赖。
销毁旧实例再创建新实例（chartInst.destroy()）。

model: claude-sonnet-4-20250514
effort: high
```

### Task 12: HeatTable 组件

```
指令: 创建 src/components/HeatTable/HeatTable.tsx。

实现原型中的热力表视图：

结构：
- 行：16 个价格点（从 stockPrice×(1+range%) 到 stockPrice×(1-range%)，等间距）
- 列：9 个时间点（Today → Expiry 等分）
- 单元格值：该价格+日期下的策略P&L

样式：
- mono 字体 11px
- 正值: rgba(10,184,122, 强度) 绿色背景，强度=|val|/maxAbsVal×0.7
- 负值: rgba(232,54,74, 强度) 红色背景
- 第一列（价格列）：sticky left，白色背景，2px 右边框
- 第一行（日期行）：sticky top，白色背景
- 当前价格行：蓝色高亮第一列
- Earnings 日期列：标题变琥珀色
- 点击列标题：切换到 Graph 视图并设置 dateProgress 到该时间点

使用 CSS table-layout:fixed，支持水平/垂直滚动。

model: claude-sonnet-4-20250514
effort: medium
```

### Task 13: BottomControls 组件

```
指令: 创建 src/components/BottomControls/BottomControls.tsx。

实现原型底部控制栏，两行布局：

第一行：
- DATE 标签 + 日期显示（"Wed May 7"）
- range 滑块（0~100，映射到 Today→Expiry）
- 右侧显示 "At expiration" 或 "Xd remaining"

第二行：
- RANGE 标签 + 显示值（"±8%"）+ 滑块（min:3, max:20）
- 竖线分隔符
- IMPLIED VOL 标签 + 显示值（"21.1%"）+ 滑块（min:50, max:300, 映射 0.5x~3x）
- 右侧标尺标记: ×1 · ×2 · ×3
- 竖线分隔符
- Graph/Table 切换（SegmentedControl）
- P&L 显示模式（4 按钮: P&L $, P&L %, % Risk, Contract）
- Prob Dist 切换按钮（激活时紫色高亮）

所有滑块的 onChange 更新对应 store 属性。
日期滑块拖动时要实时更新日期标签和图表。

model: claude-sonnet-4-20250514
effort: medium
```

### Task 14: LegEditorPanel 组件

```
指令: 创建 src/components/LegEditorPanel/LegEditorPanel.tsx。

实现原型中的右侧滑出面板（260px 宽），包含以下区域：

1. Header: 标题 "Edit Legs" + 关闭按钮(×)
   - 面板打开时从右侧滑入（translateX transition 0.22s）

2. Leg List: 列表展示所有腿
   - 每项: badge（L/S + strike + C/P，Call绿色Put红色）+ info（qty + cost）+ excluded 标记
   - 点击选中该腿，高亮显示（蓝色边框）

3. Add Leg Buttons: 4 个虚线边框按钮
   - "+ Long Call"（绿色虚线）
   - "+ Long Put"（红色虚线）
   - "+ Short Call"（绿色虚线）
   - "+ Short Put"（红色虚线）
   - 点击 → store.addLeg(type, direction)

4. Leg Detail Editor（选中腿后显示）:
   - Quantity: ﹣ 按钮 + 数字输入 + ﹢ 按钮
   - Cost Basis: $ + 数字输入（step=0.01）
   - Exclude from P&L: Toggle 开关
   - Delete This Leg: 红色按钮
   - 所有改动实时更新 store

5. Net Greeks Panel:
   - 标题 "⚗️ Net Greeks"
   - 2×3 grid 卡片: Delta Δ, Gamma Γ, Vega V, Theta Θ, Rho ρ, IV
   - 正值绿色，负值红色

6. Commission:
   - "Per contract: $ [input] / leg"
   - 改动更新 store.commissionPerContract

7. Saved Strategies:
   - 列表显示保存的策略（name + 删除×按钮）
   - 点击加载策略
   - 最多显示 20 个

model: claude-sonnet-4-20250514
effort: high
```

### Task 15: StrategyModal 组件

```
指令: 创建 src/components/StrategyModal/StrategyModal.tsx。

实现原型中的策略选择全屏模态框。

结构：
- 背景遮罩: rgba(13,20,33,.45) + backdrop-filter:blur(4px)
- 模态框: 700px 宽，白色卡片，12px 圆角，大阴影
- 弹入动画: fadeUp (opacity 0→1, translateY 10→0, 0.18s)
- 点击遮罩或 × 关闭

内容分 4 层：
1. 🌱 Novice (5个策略):
   Long Call, Long Put, Covered Call, Cash-Secured Put, Protective Put
2. 📈 Intermediate (9个策略):
   Bull/Bear Call/Put Spread, Iron Condor, Iron Butterfly,
   Long Straddle, Long Strangle, Collar
3. 🔬 Advanced (10个策略):
   Call/Put Butterfly, Calendar Call/Put, Diagonal Call,
   Jade Lizard, Short Straddle/Strangle, Call/Put Ratio
4. ⚙️ Custom (1个):
   Custom — 空白策略

每个策略卡片：
- 牛市(bull): 名称绿色
- 熊市(bear): 名称红色
- 中性(neut): 名称蓝色
- hover: 边框加深 + 轻阴影
- 点击: store.loadStrategy(templateKey) + 关闭模态

使用 STRATEGY_TEMPLATES 数据。

model: claude-sonnet-4-20250514
effort: medium
```

### Task 16: 组件集成与布局

```
指令: 创建 src/App.tsx，将所有组件按原型布局组装。

布局结构（flexbox 垂直排列，100vh）：
1. TopBar (flex-shrink:0, 50px)
2. ExpirationTimeline (flex-shrink:0, auto height)
3. StrikesVisualizer (flex-shrink:0, 110px)
4. StatsBar (flex-shrink:0, auto height, 水平滚动)
5. ViewArea (flex:1, overflow:hidden)
   - PnlChart (显示在 graph 模式)
   - HeatTable (显示在 table 模式)
6. BottomControls (flex-shrink:0, auto height)
7. LegEditorPanel (fixed 定位, 右侧滑出)
8. StrategyModal (fixed 定位, 全屏遮罩)
9. Toast (fixed 定位, 底部居中)

初始化逻辑（useEffect on mount）：
1. 加载 expiries (mock)
2. 设置默认 ticker (QQQ)
3. 加载默认策略（原型的 3 腿策略或 bull_call_spread）
4. 触发首次计算
5. 设置 resize listener

确保所有组件的数据流通过 Zustand store 连接，
计算通过 useComputeWorker hook 异步执行。

model: claude-sonnet-4-20250514
effort: medium
```

### Task 17: 端到端测试与调优

```
指令: 对完整应用进行以下验证和修复：

1. 功能验证 checklist:
   - [ ] 切换 ticker 后期权链、价格、IV 更新
   - [ ] 选择策略模板后腿正确创建、图表正确渲染
   - [ ] 拖拽 leg tag 实时更新行权价和图表
   - [ ] 日期滑块拖动 → P&L 曲线平滑变化
   - [ ] IV 乘数调整 → 图表和 Greeks 更新
   - [ ] Graph/Table 切换正常
   - [ ] 4 种 displayMode 切换正常
   - [ ] Prob Dist 曲线可开关
   - [ ] Leg Editor: 增/删/改腿、数量、cost basis、exclude
   - [ ] Stats Bar 全部 7 个指标计算正确
   - [ ] 策略保存/加载（localStorage）
   - [ ] Commission 影响 P&L 计算

2. 性能验证:
   - 拖拽 leg 时图表 FPS ≥ 30
   - Monte Carlo COP 计算 < 100ms
   - 初始渲染 < 500ms

3. 样式验证:
   - 与原型 HTML 的视觉一致性对比
   - 响应式（最小 1280px 宽度正常）
   - 滚动条样式

4. 修复发现的所有问题

model: claude-sonnet-4-20250514
effort: high
```

### Task 18: FastAPI 后端脚手架（Phase 2 开始）

```
指令: 创建 backend/ 目录，搭建 Python FastAPI 后端。

结构:
  backend/
    main.py              (FastAPI app 入口)
    config.py            (配置: Futu host/port, Redis, DB)
    routers/
      stock.py           (标的搜索和报价路由)
      options.py         (期权链和快照路由)
      strategy.py        (策略 CRUD 路由)
    services/
      futu_client.py     (Futu OpenD 连接管理器，单例)
      option_service.py  (期权数据服务)
      cache_service.py   (Redis 缓存层)
    models/
      schemas.py         (Pydantic 请求/响应模型)
      db_models.py       (SQLAlchemy 模型)
    workers/
      data_collector.py  (后台数据采集任务)
    requirements.txt
    Dockerfile
    docker-compose.yml   (OpenD + Backend + Redis + PostgreSQL)

实现:
1. main.py: CORS 配置、路由注册、启动/关闭事件（连接 Futu OpenD）
2. futu_client.py: 封装 moomoo SDK，管理 OpenQuoteContext 连接池
3. routers/stock.py: GET /api/search?q= 和 GET /api/stock/{ticker}
4. routers/options.py:
   - GET /api/options/{ticker}/expiries
   - GET /api/options/{ticker}/chain?expiry=
   - POST /api/options/snapshot (批量 code)
5. cache_service.py: Redis 缓存装饰器，期权链 TTL=300s，快照 TTL=30s
6. requirements.txt: fastapi, uvicorn, moomoo, redis, sqlalchemy, asyncpg, pydantic

model: claude-sonnet-4-20250514
effort: high
```

### Task 19: WebSocket 实时推送

```
指令: 在后端添加 WebSocket 端点 /ws/quotes，实现实时报价推送。

实现:
1. 前端连接 WebSocket，发送订阅消息: { action: "subscribe", codes: [...] }
2. 后端收到后调用 quote_ctx.subscribe(codes, SubType.QUOTE)
3. 注册回调 on_recv_rsp，将价格变化推送到前端
4. 前端收到推送后更新 store 中对应合约的 lastPrice 和 Greeks
5. 支持动态切换订阅（用户切换到期日时，取消旧订阅，添加新订阅）
6. 心跳检测（30s ping/pong）
7. 断线自动重连（指数退避 1s/2s/4s/8s，最大 30s）

前端 hook: useRealtimeQuotes(codes: string[])
- 管理 WebSocket 连接生命周期
- 返回 { connected: boolean, latency: number }

model: claude-sonnet-4-20250514
effort: medium
```

### Task 20: Docker 编排

```
指令: 创建 docker-compose.yml，编排完整开发环境。

服务:
1. opend:
   - 使用富途官方 OpenD Docker 镜像
   - 暴露端口 11111 (TCP)
   - 挂载配置文件
   - 健康检查

2. backend:
   - 基于 python:3.11-slim
   - 依赖 opend, redis, postgres
   - 暴露端口 8000
   - 环境变量: FUTU_HOST, REDIS_URL, DATABASE_URL

3. redis:
   - redis:7-alpine
   - 持久化配置

4. postgres:
   - postgres:16-alpine
   - 初始化 SQL 脚本（创建策略表）

5. frontend:
   - node:20-alpine
   - npm run dev
   - 暴露端口 5173
   - 代理 /api → backend:8000

创建 .env.example 文件列出所有环境变量。
创建 Makefile 包含 up/down/logs/rebuild 命令。

model: claude-sonnet-4-20250514
effort: medium
```

---

## 十、指令执行汇总

| # | Task | model | effort | 预估 Token | 依赖 |
|---|------|-------|--------|-----------|------|
| 0 | 项目初始化 | sonnet | low | ~2K | — |
| 1 | 设计 Token 系统 | sonnet | low | ~3K | T0 |
| 2 | TypeScript 类型定义 | sonnet | low | ~4K | T0 |
| 3 | BSM 计算引擎 | sonnet | high | ~12K | T2 |
| 4 | Web Worker 封装 | sonnet | medium | ~5K | T2, T3 |
| 5 | Zustand 状态管理 | sonnet | medium | ~6K | T2 |
| 6 | Mock 数据层 | sonnet | medium | ~5K | T2, T3 |
| 7 | TopBar 组件 | sonnet | medium | ~6K | T1, T5 |
| 8 | ExpirationTimeline | sonnet | medium | ~5K | T1, T5 |
| 9 | StrikesVisualizer | sonnet | high | ~10K | T1, T5, T6 |
| 10 | StatsBar | sonnet | medium | ~5K | T1, T5, T4 |
| 11 | PnlChart | sonnet | high | ~10K | T1, T5, T4 |
| 12 | HeatTable | sonnet | medium | ~6K | T1, T5, T4 |
| 13 | BottomControls | sonnet | medium | ~5K | T1, T5 |
| 14 | LegEditorPanel | sonnet | high | ~10K | T1, T5 |
| 15 | StrategyModal | sonnet | medium | ~5K | T1, T5, T6 |
| 16 | 组件集成与布局 | sonnet | medium | ~6K | T7~T15 |
| 17 | 端到端测试与调优 | sonnet | high | ~8K | T16 |
| 18 | FastAPI 后端 | sonnet | high | ~12K | T2 |
| 19 | WebSocket 推送 | sonnet | medium | ~5K | T18 |
| 20 | Docker 编排 | sonnet | medium | ~4K | T18 |

**Phase 1 总计**：Task 0~17（前端 MVP）  
**Phase 2 总计**：Task 18~20（后端 + 数据源接入）

---

## 附录 A：原型中的策略模板完整映射

| Key | 名称 | 腿数 | 方向 | 组成 |
|-----|------|------|------|------|
| long_call | Long Call | 1 | 看多 | +1 Call(ATM+3%) |
| long_put | Long Put | 1 | 看空 | +1 Put(ATM-3%) |
| covered_call | Covered Call | 1 | 中性偏多 | -1 Call(ATM+5%) |
| cash_put | Cash-Secured Put | 1 | 看多 | -1 Put(ATM-3%) |
| protective_put | Protective Put | 1 | 对冲 | +1 Put(ATM-5%) |
| bull_call | Bull Call Spread | 2 | 看多 | +1 Call(ATM-2%), -1 Call(ATM+3%) |
| bear_put | Bear Put Spread | 2 | 看空 | +1 Put(ATM+2%), -1 Put(ATM-3%) |
| bull_put | Bull Put Spread | 2 | 看多 | +1 Put(ATM-8%), -1 Put(ATM-3%) |
| bear_call | Bear Call Spread | 2 | 看空 | -1 Call(ATM+3%), +1 Call(ATM+8%) |
| iron_condor | Iron Condor | 4 | 中性 | +P(ATM-8%), -P(ATM-3%), -C(ATM+3%), +C(ATM+8%) |
| iron_butterfly | Iron Butterfly | 4 | 中性 | +P(ATM-5%), -P(ATM), -C(ATM), +C(ATM+5%) |
| straddle | Long Straddle | 2 | 高波动 | +1 Call(ATM), +1 Put(ATM) |
| strangle | Long Strangle | 2 | 高波动 | +1 Call(ATM+3%), +1 Put(ATM-3%) |
| collar | Collar | 2 | 对冲 | +1 Put(ATM-5%), -1 Call(ATM+5%) |
| call_butterfly | Call Butterfly | 3 | 中性 | +1C(ATM-5%), -2C(ATM), +1C(ATM+5%) |
| put_butterfly | Put Butterfly | 3 | 中性 | +1P(ATM-5%), -2P(ATM), +1P(ATM+5%) |
| calendar_call | Calendar Call | 2 | Theta | -1C(ATM,近月), +1C(ATM,远月) |
| calendar_put | Calendar Put | 2 | Theta | -1P(ATM,近月), +1P(ATM,远月) |
| diagonal_call | Diagonal Call | 2 | 方向+时间 | -1C(ATM,近月), +1C(ATM+5%,远月) |
| jade_lizard | Jade Lizard | 3 | 中性 | -1P(ATM-3%), -1C(ATM+3%), +1C(ATM+6%) |
| short_straddle | Short Straddle | 2 | 低波动 | -1C(ATM), -1P(ATM) |
| short_strangle | Short Strangle | 2 | 低波动 | -1C(ATM+4%), -1P(ATM-4%) |
| call_ratio | Call Ratio | 2 | 看多 | +1C(ATM-3%), -2C(ATM+2%) |
| put_ratio | Put Ratio | 2 | 看空 | +1P(ATM+3%), -2P(ATM-2%) |
