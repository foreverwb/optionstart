# OptionStrat Build — Claude Code 项目规范

## 项目概述
期权策略构建器，数据源为 Futu OpenAPI。
前端：React 18 + TypeScript + Vite + Zustand + Chart.js
后端：Python FastAPI + moomoo SDK

## 目录结构（不得随意新增顶层目录）
src/
  components/   # UI 组件，每个组件独立目录
  engine/       # BSM 定价引擎，纯函数，无副作用
  store/        # Zustand store，唯一状态来源
  hooks/        # 自定义 hooks
  types/        # 所有 TypeScript 类型，集中管理
  mock/         # Mock 数据，仅开发环境使用
  workers/      # Web Worker 文件
  styles/       # 全局样式和设计 token

## 文件规模约束
- 组件文件 > 250 行：拆分子组件
- 单个函数 > 50 行：提取为命名函数
- bsm.ts 是唯一允许超过 300 行的文件（数学公式密集）

## 技术栈决策（不得替换）
- 状态：Zustand（store/useAppStore.ts 单文件）
- 图表：Chart.js 4 + react-chartjs-2
- 拖拽：@dnd-kit/core
- 样式：Tailwind + src/styles/tokens.css 变量

## 计算规则
- BSM 计算全部在 Web Worker 执行（workers/compute.worker.ts）
- 主线程禁止直接调用 bsm.ts 的 calcPnL / calcCop
- T（到期年数）最小值钳制为 0.001
- 价格显示：2 位小数；Greeks：4 位小数；百分比：1 位小数

## Futu API 使用规则
- get_option_chain 必须经过 cache_service，禁止直接调用
- 每次请求到期日跨度不超过 30 天
- get_market_snapshot 单次 code 数量不超过 400

## 设计参考
- 原型文件位于 prototype/optionstrat_build_prototype_v2.html
- 实现任何 UI 组件前，先阅读原型中对应区域的 HTML 和 CSS
- CSS 变量名必须与原型保持一致，不得重新命名

## 禁止事项
- 禁止在组件内写 BSM 计算逻辑
- 禁止硬编码 lotSize = 100
- 禁止修改 tokens.css 中的变量名
- 禁止在 store 以外的地方管理全局状态
- 禁止使用 any 类型（用 unknown + type guard）
- 禁止凭空设计 UI，所有组件必须有原型对应区域作为参照
