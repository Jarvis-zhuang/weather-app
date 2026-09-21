# 天气查询应用 · Weather Application

一个用 **Next.js 16 (App Router) + TypeScript** 实现的天气查询应用：搜索地点 → 查看当前天气 → 查看未来 7 天预报，并完整覆盖加载 / 空 / 错误三种状态。

> 对应作业：`Frontend Take-Home – Weather Application`

## 作业要求对照（快速索引）

| 作业要求 | 实现位置 | 一句话说明 |
| --- | --- | --- |
| **搜尋地點** | `components/location-search.tsx` + `app/api/geocode/route.ts` | debounce 300ms → 服务端代理 geocoding → 候选按人口/行政等级排序并标注类型 |
| **查看目前天氣狀況** | `components/current-weather-card.tsx` | 温度、天气状况、体感、湿度、风速、观测时间 |
| **查看天氣預報資訊** | `components/forecast-list.tsx` + `components/weather-charts.tsx` | 未来 7 天卡片 + ECharts 三视图（24 小时 / 7 天趋势 / 降水量） |
| **妥善處理 Loading / Error** | `components/states.tsx` + `components/weather-dashboard.tsx` | 加载态按"有没有旧内容"分叉（骨架 / 遮罩）；五类错误码统一中文提示 + 重试 |
| — 應用程式架構 | 「架构：三层单向依赖」 | `lib` → `components` → `app`，单向依赖，换 provider 只改一个文件 |
| — 元件設計 | 「目录结构」 | 纯展示组件不取数，取数集中在 hook；组件只通过 props + 回调通信 |
| — 狀態管理 | 「状态管理：只分两类」 | 服务端数据交给 TanStack Query，UI 局部状态用 `useState`/`useTransition`，不引入全局 store |
| — API 整合 | 「架构」+ `lib/weather-source.ts` | 全站唯一接触外部 API 的地方；超时、4xx/429/5xx 归一成中文错误 |
| — 程式碼組織 | 「目录结构」 | 按职责分层；类型集中，`lib/` 纯函数可单测 |
| — 錯誤處理 | 「错误处理」 | 边界 → 契约 → 呈现三层；`app/error.tsx` 兜底；不重试 4xx |
| — 可維護性 | 「取舍（Trade-offs）」16 条 | 每条都写明"做了什么 / 为什么不那么做" |

> **范围控制**：单位切换、地理定位、收藏、搜索键盘导航均**主动未做**，理由见「取舍 #6」与文末「可能的下一步」。作业备注要求"控制实现范围在合理程度"，因此重点是**把已做部分的判断讲清楚**，而不是继续堆功能。

---

## 快速开始

```bash
npm install
npm run dev        # http://localhost:3000
```

无需任何 API Key、无需 `.env` 配置 —— 数据源使用 [Open-Meteo](https://open-meteo.com/)（免费、开放、免注册的公开天气 API）。这样评审者 `clone` 后可以直接跑起来，不需要注册账号或等配额。

其他命令：

```bash
npm run typecheck  # tsc --noEmit
npm run build      # 生产构建
npm start          # 启动生产服务
npm run smoke      # 对已启动的服务做一次端到端冒烟验证（默认 http://127.0.0.1:3100）
```

`smoke.js` 会真实请求 Open-Meteo（29 项断言全通过），验证：页面 200、geocoding 返回坐标、天气返回 7 天预报、SSR HTML 里已包含首屏温度、中文城市别名命中（东京 → 日本首都）、无空格英文写法命中（`hongkong` → 香港）、国家/地区类条目不会被混为一谈（英国 `PCLI`、澳门 `PCLS` 去重）、以及三类错误（缺参数 / 空关键词 / 非法坐标）都返回约定的 `{ ok:false, error }`。

### 在手机上打开（当 App 用）

```bash
npm run build
npx next start -H 0.0.0.0 -p 3000
# 然后手机浏览器访问 http://<电脑的局域网 IP>:3000
# 电脑 IP：Windows 用 ipconfig，macOS/Linux 用 ifconfig | grep inet
```

手机上「添加到主屏幕」后，会以 `standalone` 模式全屏打开（无浏览器地址栏），和原生 App 的入口一致。

移动端相关处理：

| 项 | 做法 | 为什么 |
| --- | --- | --- |
| 视口 | `app/viewport.ts`：`viewport-fit=cover` + `themeColor` | 内容延伸到刘海/圆角区域，状态栏颜色与主题一致 |
| 安全区 | `env(safe-area-inset-*)` 内边距 | 避免内容被灵动岛 / 底部手势条遮住 |
| 7 天预报 | 手机 3 列 → 平板 4 列 → 桌面 7 列 | 手机 2 列会把 7 天拉成 4 行很长；3 列时每格宽度与桌面接近 |
| 图表高度 | `h-56`（手机）/ `h-64`（≥640px） | 让图表和预报尽量在一屏内看完 |
| Tab 触摸区 | `min-h-[38px]` | 手指点击比鼠标需要更大的命中区域 |
| 自适应 | `ResizeObserver` → `chart.resize()` | 旋转屏幕、切 Tab 后图表仍然贴合容器 |

> 保留 `initial-scale=1` 且**不禁用缩放** —— 禁用缩放会伤害需要放大阅读的用户。

### 浏览器端到端验收

```bash
# 1) 以调试端口启动本机 Edge（Windows 自带，无需下载 Chromium）
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" \
  --headless=new --remote-debugging-port=9222 \
  --user-data-dir=<临时目录> --window-size=1280,900 http://localhost:3100/

# 2) 跑验收（默认 http://127.0.0.1:3100）
node uitest.js
```

`uitest.js` 通过 CDP 驱动真实浏览器（64 项断言全通过），覆盖 7 种页面状态（空态 / 搜索中 / 有结果 / 无结果 / 加载中 / 首次选城骨架 / 切换城市中 / 错误）+ 移动端视口 + 图表 Tab 与动画 + 同名地点歧义标注与**国家/地区标签**（北京、东京、香港、英国、澳门、新加坡）+ **搜索 loading 的位置与可见性**，并把截图写到 `../shots/`。

> 注意：dev 模式下请用 `http://localhost:3000` 访问。Next.js 16 默认拦截非 `localhost` 来源的 dev 资源，用 `127.0.0.1` 会看到"页面有内容但点不动"（SSR 出了、hydration 没发生）。本项目已在 `next.config.ts` 里通过 `allowedDevOrigins` 放开 `127.0.0.1`。

验收结果与逐条对照表见 **[ACCEPTANCE.md](./ACCEPTANCE.md)**。

---

## 技术选型与理由

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| 框架 | Next.js App Router | 作业允许 React/Next.js；App Router 的 Server Component 可以在服务端完成首屏数据获取，避免"白屏 → 转圈 → 数据"的三段式体验 |
| 语言 | TypeScript（strict） | 天气数据是纯外部输入，`unknown → 领域类型` 的收敛必须靠类型系统兜住 |
| 数据源 | Open-Meteo | 免费、无 Key、无配额申请流程；同时提供 geocoding + forecast，两个接口风格一致 |
| 服务端状态 | TanStack Query | 天气是典型的 **server state**：需要缓存、去重、重试、失效。手写 `useEffect + useState` 会重新实现一遍这些能力 |
| UI 状态 | URL query string | 选中的地点存在 `?lat=&lon=&name=`，而非组件 state |
| 样式 | Tailwind CSS v4 | 范围控制：不引入组件库，把时间留给架构与状态设计 |
| 可视化 | ECharts（按需引入） | 招聘 JD 里的高频要求，且天气数据天生适合趋势图。用 `echarts/core` 只注册用到的图表与组件，避免整包进客户端 chunk |
| 移动端 | 响应式 + PWA（manifest / safe-area） | 「在手机上直接当 App 用」是这类工具的默认预期，而不是附加需求 |
| 校验 | 手写解析 + 类型收敛 | 只有 2 个接口、结构稳定，引入 zod 收益不明显（见取舍 #5） |

---

## 架构：三层单向依赖

```
┌──────────────────────────────────────────────────────────┐
│ UI 层        components/ + hooks/                          │
│ 只认识领域类型（Place / WeatherPayload），不知道 Open-Meteo │
└───────────────▲──────────────────────┬─────────────────────┘
                │ /api/* (同源)         │ 领域类型
┌───────────────┴──────────────────────▼─────────────────────┐
│ API 层        app/api/*/route.ts                            │
│ 参数校验 → 调用 source → 统一 ApiResult 信封 + HTTP 状态码  │
└───────────────▲──────────────────────┬─────────────────────┘
                │ 领域类型              │ 领域类型
┌───────────────┴──────────────────────▼─────────────────────┐
│ 数据层        lib/weather-source.ts                         │
│ 唯一知道 Open-Meteo URL / 字段 / WMO code 的地方            │
└────────────────────────────────────────────────────────────┘
```

**为什么把第三方 API 包在 Route Handler 后面，而不是浏览器直连？**

1. **统一错误契约**：上游返回什么错误都不重要，前端永远只收到 `{ ok:false, error:{code,message} }`，UI 不必为每个 provider 写一套兜底文案。
2. **可替换**：换 provider（比如和风、AccuWeather、付费套餐）只改 `lib/weather-source.ts`，UI 与 API 契约不动。
3. **服务端缓存 / 限流的落点**：现在没有做持久化缓存，但接入点已经在服务端，加 `revalidate` 或 Redis 不需要动前端。
4. **密钥不外泄**：本例 Open-Meteo 不需要 Key；若换成需要 Key 的 provider，Key 只存在于服务端环境变量，浏览器无感。
5. **便于在服务端预取**：服务端渲染首屏时可以直接调用 source 层，不需要"服务端 fetch 自己的 HTTP 接口"这种绕路写法。

---

## 数据流

```
用户输入 "深圳"
   │  debounce 300ms
   ▼
useQuery(['locations','深圳']) ──► GET /api/geocode?name=深圳
                                        │
                              Route → searchLocations() → Open-Meteo geocoding
                                        │
                                   GeoLocation[]
   ▼
点击结果 → router.push('/?lat=22.54&lon=114.06&name=深圳&country=中国&tz=Asia/Shanghai')
   │
   ├── 服务端：page.tsx 读 searchParams → prefetchQuery（直连 source 层）→ dehydrate
   │            → HydrationBoundary 把数据带到客户端，首屏无 loading
   │
   └── 客户端：useQuery(['weather', lat, lon]) ──► GET /api/weather?lat=&lon=&tz=
                                        │
                              Route → getWeather() → Open-Meteo forecast
                                        │
                                   WeatherPayload → CurrentWeatherCard + ForecastList
```

关键点：**服务端预取用的是同一个 queryKey**（`lib/query-keys.ts` 集中定义），所以客户端 hydration 时能直接命中缓存，不会立刻再发一次请求。

---

## 状态管理：只分两类，不引入全局 store

| 状态 | 归属 | 为什么 |
| --- | --- | --- |
| 选中的地点 | **URL** (`?lat=&lon=&name=&country=&tz=`) | 可分享链接、可刷新、可用浏览器前进/后退；服务端也能读到、从而直出首屏 |
| 搜索框输入 | 组件内 `useState` + debounce | 纯瞬态 UI 状态，离开了就没意义，不该进全局 |
| 天气 / 地点数据 | **TanStack Query** 缓存 | 属于服务端数据的"客户端副本"，不是应用状态 |

因此**没有引入 Redux / Zustand / Context**。理由写在这里而不是省略：一个只有"选中地点"这一项跨组件状态的页面，全局 store 带来的模板代码成本大于收益；URL 本身就是最好的 store，而且天然持久化。

---

## 交互反馈：几种"等待"，按"有没有旧内容"分叉

页面里的等待场景不止一种，表达方式也不同 —— **分叉的判断依据是"此刻屏幕上有没有旧内容"**：没有 → 骨架；有 → 遮罩。

| 场景 | 触发 | 表现 | 为什么不是别的做法 |
| --- | --- | --- | --- |
| **冷启动**（首次打开带地点的链接、预取失败） | `useQuery` 无缓存 → `isPending` | 骨架屏 `WeatherSkeleton`（`aria-busy`，形状与真实卡片一致） | 此时**没有任何内容可显示**，骨架能预告即将出现的布局，比转圈更少"跳一下" |
| **首次选城**（从空态选第一个城市） | `isSwitching && place === null` | 同样走骨架屏 | 没有旧内容可保留，遮罩的毛玻璃没有意义；这里要表达的是"内容即将出现" |
| **切换城市**（屏幕上已有城市） | 点击候选 → `useTransition` 的 `isSwitching`（或缓存过期时的 `isFetching`） | 半透明毛玻璃遮罩 + 「正在加载「深圳」的天气…」；**旧城市保留在遮罩下**；输入框显示「切换中…」 | 旧内容仍然有效可读，换成骨架是信息倒退；遮罩表达的是"旧的在，新的在路上" |
| **搜索建议在途** | `useLocationSearch` 的 `isFetching`，**以及还没轮到发请求的 300ms debounce 窗口**（`isDebouncing`） | 输入框**内部**右端的胶囊状态条：动画 spinner + 「搜索中…」（浅蓝底、深蓝字） | 反馈放在离操作最近的地方（输入框本身），不打断已有内容。绑上 debounce 是因为对用户来说"我在搜索"从**第一个按键**就成立了 —— 早先只接 `isFetching`，打字后的头 300ms 界面毫无反应 |
| **图表切换 Tab** | 本地 state | ECharts 自带动画（新系列入场）+ 200ms 轻淡出过渡层 | 纯本地操作，不应出现任何"加载"语义 |

实现要点：

- **"没有旧内容 → 骨架，有旧内容 → 遮罩"是一条硬规则**：`weather-dashboard.tsx` 里 `isFirstPickLoading`（空态首次选城）与 `isLoadingNewPlace`（已有城市再切）就是照它分的。第一次选城若沿用遮罩，会在空态上盖一层无意义的毛玻璃 —— 这也说明加载态不能只有一个通用 spinner。
- **切换城市本质是一次导航**，所以用 `useTransition` 而不是 `useState(true)`。React 会保留当前已提交的 UI，`isPending` 一直为真直到新城市的服务端负载提交完成 —— 这个状态天然准确，不需要定时器或猜测。
- **过渡遮罩 + 旧内容保留**：这也是"服务端预取让切换变得无缝"之后的必要补充 —— 越快的界面越需要**立刻**的点击反馈，否则用户会怀疑自己没点中。
- **两个信号都要接**：路由过渡（`isSwitching`）和后台重新取数（`isFetching && data`）都会让遮罩出现，前者是常规路径，后者覆盖缓存过期/重试。
- **`prefers-reduced-motion`** 下关闭图表过渡动画。

---

## 图表动画：为什么"复用实例"才等于"有动画"

```tsx
// ✗ 每切一次 Tab 都换 key → 整棵图表子树卸载重挂载 → echarts.init 重跑
<Chart key={tab} option={options[tab]} />

// ✓ 实例常驻，换的是 option
<Chart option={options[tab]} />
```

React 里 `key` 变化等于卸载重挂载。图表组件一旦重挂载，容器被清空、`echarts.init` 重跑，ECharts **没有机会**做过渡，观感就是硬切。

改成实例常驻后：

| 层 | 由谁负责 | 参数 |
| --- | --- | --- |
| 系列入场/更新动画 | ECharts（`setOption(option, { notMerge: true })`） | `animationDuration: 700`（新系列）/ `animationDurationUpdate: 450`（数据更新，例如切城市） |
| 视觉上的"软切换" | CSS（keyed 的 `.chart-swap-veil`，200ms 淡出） | 只做轻微柔化，不遮挡 ECharts 的绘制过程 |
| Tab 按钮 | Tailwind | `transition-all duration-200` |

这也解释了 `hooks/use-echarts.ts` 的清理函数为什么只在**真正卸载**时才该执行 —— 如果动画需要实例复用，那么"重挂载"就不是免费的。

---

## 错误处理

统一一个错误类型 `AppError(code, message, status)`（`lib/errors.ts`），逐层收敛：

| 场景 | code | HTTP | UI 表现 |
| --- | --- | --- | --- |
| 关键词为空 / 坐标非法 | `BAD_REQUEST` | 400 | 输入框下方提示，不发请求 |
| 地点查不到 | `NOT_FOUND` | 404 | 搜索面板内"找不到该地点" |
| 上游 5xx / 响应超时（8s） | `UPSTREAM` | 502 | 错误卡片 + 重试按钮 |
| 上游限流 | `RATE_LIMITED` | 429 | 错误卡片，提示稍后再试 |
| 断网 / DNS 失败 | `NETWORK` | 503 | 错误卡片 + 重试按钮 |

三条原则：

1. **4xx 不重试**（retry 策略在 `lib/query-client.ts`），5xx/网络错误最多重试 2 次 —— 重试一个必然失败的请求只会拖慢反馈。
2. **上游错误不外泄**：`message` 是写给用户的中文提示，原始错误只在服务端日志里，不返回给浏览器。
3. **首屏预取失败不炸页面**：`page.tsx` 里 prefetch 用 `.catch()` 兜住，降级为客户端正常加载流程，而不是 500。另有 `app/error.tsx` 作为最后一道边界。

---

## 目录结构

```
app/
  layout.tsx              根布局 + Providers
  page.tsx                Server Component：读 URL → 预取 → Hydration
  error.tsx               全局错误边界
  providers.tsx           TanStack Query Provider
  globals.css
  api/
    geocode/route.ts      GET /api/geocode?name=
    weather/route.ts      GET /api/weather?lat=&lon=&tz=
components/
  weather-dashboard.tsx   容器组件：按状态分支渲染 + 导航过渡遮罩（isSwitching）
  location-search.tsx     搜索框 + 结果面板（含搜索中/切换中的状态提示）
  current-weather-card.tsx 纯展示
  forecast-list.tsx       纯展示
  weather-charts.tsx      ECharts 趋势图（Tab 切换：24h / 7 天温度 / 降水量）
  states.tsx              EmptyState / WeatherSkeleton / ErrorPanel
  spinner.tsx             内联 loading 图标（纯展示）
hooks/
  use-location-search.ts  地点搜索 query（debounce 后启用）
  use-weather.ts          天气 query
  use-debounced-value.ts
  use-echarts.ts          图表实例生命周期（init / resize / dispose）
lib/
  types.ts                领域类型 + API 信封类型
  errors.ts               AppError 与归一化
  weather-source.ts       唯一接触 Open-Meteo 的地方（含中文城市名 / 无空格英文别名兜底与多键去重）
  weather-code.ts         WMO code → 文案/图标
  place.ts                Place ⇄ URL query
  query-keys.ts           queryKey 集中定义（服务端/客户端共用）
  query-client.ts         QueryClient 工厂与默认策略
  api-client.ts           浏览器端 fetch 封装（解信封 + 抛 AppError）
  format.ts               温度/日期格式化（确定性输出，避免 hydration 不一致）
  geo.ts                  GeoNames feature code → 文案 + 同名地点排序
  charts.ts               ECharts option 构造（纯数据，无 DOM，可单测）
```

### 图表数据流

```
Open-Meteo hourly（7×24 = 168 条）
   │  服务端只切未来 24 条（toHourly）
   ▼
WeatherPayload.hourly ──► lib/charts.ts 生成 option（纯数据）
                              │
                     hooks/use-echarts.ts：init / ResizeObserver / dispose
                              │
                        <WeatherCharts> Tab 切换三个图
```

---

## 取舍（Trade-offs）

**1. URL 存状态 vs. 组件 state**
选 URL。代价是要处理 `useSearchParams` 的 Suspense 边界、以及参数解析/序列化的一点点代码；收益是链接可分享、刷新不丢、浏览器前进后退可用、服务端能直出。对"查天气"这种以"地点"为核心的应用，几乎没理由不这么做。

**2. TanStack Query vs. 手写 useEffect + useState**
手写版本大概 60 行，但要自己处理：竞态（快速连点两个城市）、缓存、重试、组件卸载后的 setState、重复请求去重。这些正是 Query 的默认能力。代价是引入一个依赖和一点心智负担。

**3. Route Handler 代理 vs. 浏览器直连上游**
多一跳（服务端多一次 HTTP）。换来统一的错误契约、provider 可替换、密钥可隐藏、缓存有落点。对真实项目，这一跳几乎总是值得的。

**4. 服务端预取 + Hydration vs. 纯客户端请求**
首屏更快、无 loading 闪烁、链接可被爬虫读到内容。代价是代码复杂一点（同一个 queryKey 必须两端一致、预取要兜错）。这也是选 App Router 的主要原因。

**5. 手写解析 vs. zod**
接口只有 2 个、字段固定，手写 `asFiniteNumber/asRecord` 足够，且能顺便做"缺字段就跳过这条结果"的柔性降级。真实团队项目我倾向直接上 zod 并用 schema 同时约束请求与响应。

**6. 不做的事（明确不在范围内）**
- 单位切换（°C / °F）：单位已随 payload 返回，UI 层加起来很快，但属于额外的交互与状态，优先砍掉。
- 地理定位（Geolocation）：需要 HTTPS + 用户授权，且会引入另一套错误处理分支。
- 搜索历史 / 收藏：需要本地存储层，属于"功能堆料"，对展示架构思考没有帮助。
- 图表交互（缩放、时间轴拖拽）：当下数据量只有 24 个点，`dataZoom` 属于为用而用。
- 单元测试：若时间允许，下一批会补 `lib/` 下纯函数的测试（解析、URL 序列化、chart option），它们的投入产出比最高。

**7. 自己写 `useEChart` vs. 用 `echarts-for-react`**
后者能省 20 行代码，但封装层会遮蔽三件必须处理的事：SSR（服务端不能碰 DOM）、容器尺寸变化（Tab 切换、窗口缩放都要 `resize`）、以及卸载时 `dispose`（否则实例泄漏）。自己写一遍才能说清这些细节，代码量也不过一个 40 行的 hook。

**8. 图表用什么数据**
只画现成的 7 天数组会很单薄，所以额外请求了 `hourly`，并且**在服务端切好未来 24 条再返回** —— 客户端拿到 24 个点而不是 168 个。数据裁剪放在服务端是这个架构的直接收益。

24 小时图后来补了一条**「体感温度」对比线**，为此数据层多取了 `apparent_temperature`（同样由服务端解析下发）。两条温度线靠**颜色 + 虚实**区分：气温是蓝色实线带渐变面积，体感是橙色虚线、**不填面积** —— 两条填充带叠在一起会互相打架，虚线也更符合"这是个派生对比量"的语义。

**9. 同名地点：排序 + 标注，而不是过滤**
搜「北京」会出现北京市、重庆市的某个居民点、四川的某个居民点（GeoNames 真实数据）。处理方式是：按人口排序，并把 `feature_code` 翻译成「首都 / 城市 / 村镇级居民点」，当列表里存在更有名的同名项时，给其余项打上「同名小地名」标记。
**没有做过滤**：用户可能真的要查那个村，过滤等于丢数据；标注则把判断权交回用户。这个取舍在 `lib/geo.ts`（排序与文案）和 `components/location-search.tsx`（标记）里，逻辑与渲染分开。

**10. 图表图例用数值坐标，而不是 CSS 布局**
ECharts 图例的 `top` 是画布内的绝对坐标，**没有"内容撑开容器"这回事** —— `top: 0` 时 11px 的图例文字会比容器顶边高出 2~3px，然后被 canvas 直接切掉上半截（截图里的原始 bug）。所以图例与绘图区的关系必须在 `lib/charts.ts` 里用常量显式算清楚：

```ts
const LEGEND_TOP_OFFSET = 6;                                    // 图例外边距
const GRID_WITH_LEGEND = { ...BASE_GRID, top: LEGEND_TOP_OFFSET + LEGEND_ROW_HEIGHT + 18 };
```

代价是配置里多几个魔数；收益是**布局是确定的**，不会因为字体度量或字号微调而重新裁切。回归测试直接读 canvas 顶部像素断言"无字形墨迹"，比肉眼看截图可靠。

**11. 中文城市名匹配：别名兜底，而不是过滤或换 provider**
Open-Meteo 的 `language=zh` 是拿请求词去**前缀匹配数据集里的中文「本地名」**，而这份本地名不统一用简体 —— 日本首都存的是「東京」、大阪存「大阪市」、首尔存「首尔特别市」，于是用户敲简体的「东京 / 大阪 / 首尔」命不中首都（「纽约」甚至直接 0 结果）。这是数据源自身的不一致，不是我们的解析 bug。

处理：`searchLocations()` 对**原始词 + 一张 curated 别名表**（`东京→東京`、`纽约→紐約市`、`大阪→大阪市`、`首尔→首尔特别市`、`伦敦→倫敦`）并行请求，用 `Promise.allSettled` 容忍单条失败，合并后去重、再按相关性排序。**命不中就补一次，命中就原样返回，不删任何结果** —— 东京的日本首都排第一，江苏/浙江两个同名村庄照样保留并标「同名小地名」（和取舍 #9 同一套原则）。

同类问题还有一种形态：**上游是"整词前缀匹配"，多词地名必须带空格**。`Hong Kong` 能搜到香港，`hongkong` 是 0 条（`newyork` / `losangeles` / `sanfrancisco` 同样 0 条）。但用户在手机上很少会去打那个空格，所以别名表同时收录了**常见多词城市的无空格英文写法**，查找时统一转小写（`HongKong` / `HONGKONG` 一并命中）。别名仍只是"**换一种写法再问一次数据源**"，查回来的还是上游真实条目。

不考虑换 geocoder（试过 Nominatim，本机直连返回空 body，不可用）—— 会引入新依赖，还得重新面对排序/标注问题。别名表是需要维护的成本（局限见验收报告「已知限制」第 6 条），但确定、可测、零依赖，且新增城市只需加一行。

**12. provider 的标识不直接渲染**
第三方返回的 id / code 是给机器用的，不是文案。项目里凡是"外部标识"都先翻译再上屏：

- `feature_code` → 「首都 / 城市 / 村镇级居民点」（`lib/geo.ts`）。这里要**分层**：`PCLI` / `PCLS` / `PCLD` 这类 class P 的码描述的是**政治实体本身**，必须排在"人口 ≥ 50 万 → 城市"这条启发式**之前** —— 否则人口 6649 万的英国会被说成一座城市（详见取舍 #14）
- 时区 id（`Asia/Shanghai`）→ 「UTC+8」（`lib/format.ts` 的 `formatUtcOffset`，取自上游的 `utc_offset_seconds`）

反面例子是最初那版卡片：直接把 `place.timezone` 打到界面上，于是城市名下面出现一行 `Asia/Shanghai`。**时区偏移用上游给的整数秒换算，而不是用 `Intl` 现算** —— 整数在服务端和客户端必然一致，不会有 hydration 漂移；`Intl` 依赖运行时 ICU 数据，属于自找麻烦。

**13. 枚举值翻译要带"语义前提"**

`describePlaceType()` 里 `PPLC → 首都` 一开始是无条件的，于是搜「香港」被标成「首都」。原因不是查错了数据 —— GeoNames 确实把香港登记为 `PPLC`，但 `PPLC` 的字面含义是"**首府级居民点**"，它在数据源里同时覆盖主权国家首都和**非主权实体驻地**（香港、澳门），后者的 `country` 字段是空的。

「首都」必须依附于一个国家才成立，所以判断条件改成 `featureCode === "PPLC" && location.country`，没有国家就落回常规分支（人口够大 → 「城市」）。**规律：凡是把枚举码翻成人话，先问"这个值在什么前提下才成立"，再把前提写进判断里** —— 否则就是过度翻译，而且这种错会以"看起来挺合理"的方式出现，评审时很容易漏掉。

顺带暴露了第二个问题：香港在上游被**登记了两次**（`PPLC` id 1819729 与 `PCLS` id 1819730，人口都是 7,396,076），候选列表里出现两条一模一样的「香港」。原来的去重只认 `id`，抓不住这种"同地两种实体类型"。改成**多身份键**去重：`id` ∪ `name+国家+坐标(2 位小数)` ∪ `name+国家+人口`，任一命中即合并。键不能太松 —— 墨西哥真的有一个 5 人的小村落也叫 `Hong Kong`，靠"名字 + 国家 + 坐标"就能和香港本体区分开。

**14. 人口启发式只对居民点成立，必须先分层再判断**

接着 #13 往下挖一层：`PPLC` 那条规则修好之后，搜「英国」仍然被标成**「城市」**。原因是判断顺序 ——

```ts
if (code === "PPLC" && country) return "首都";
if (population >= 500_000) return "城市";     // ✗ 英国 PCLI / 6649 万人 掉进这里
```

GeoNames 把英国登记为 `PCLI`（independent political entity，人口 6649 万）。**"人口多 → 城市"这条启发式只对居民点成立**，而 class P 的码（`PCLI` / `PCLS` / `PCLD` / `TERR`…）描述的是政治实体本身。所以正确顺序是：**先问"它是什么"（实体类别），再问"住了多少人"（规模）**。

```ts
const entity = ENTITY_LABELS[code];           // PCLI→国家 PCLS→地区 PCLD/TERR→属地
if (entity) return entity;                    // ✓ 实体类别优先
if (code === "PPLC" && country) return "首都";
if (population >= 500_000) return "城市";
```

同一个母题第三次出现，这次补上的是"**分类的层级**"：枚举码不只要带语义前提（#13），还得先确认它属于哪一层，再套用该层才成立的规则。

**15. "同一实体"是弱信号拼出来的，而且上游自己都不一致**

`香港`（靠人口相同）能被 #13 的多身份键抓到，但**澳门和新加坡抓不到** —— 上游给它们的两条记录连坐标和人口都不一样：

| 地点 | 记录 A | 记录 B |
| --- | --- | --- |
| 澳门 | `PPLC` 22.20/113.55 · 649,335 人 | `PCLS` 22.16/113.56 · 631,636 人 |
| 新加坡 | `PPLC` 1.290/103.850 · 5,638,700 人 | `PCLI` 1.367/103.800 · 5,638,676 人 |

任何"精确相等"的键都会漏。于是加了一道**语义合并**：两条记录**都**属于政治实体类码、名称与国家相同、且相距 ≤ 0.5°（约 55 km）时判为同一实体，保留更能说明它是什么的那一条（`PCLI` > `PCLS` > … > `PPLC`）。定这个 0.5° 也有讲究：它远大于同实体双登记的距离差（3~5 km），又远小于到真·同名异地的距离（墨西哥那个 `Hong Kong` 在 29° 之外），中间留了三个数量级的余量。**普通居民点不参与这道合并**，所以两个真·同名村庄依然各自保留。

**16. 加载反馈要长在用户正在看的地方**

原来的搜索 loading 是一行 `text-slate-400` 的小字，摆在输入框右侧。两个问题叠加：**看不见**（和占位符同一色阶），以及**来得太晚**（绑的是 `isFetching`，要等 300ms debounce 走完、请求真发出去才出现 —— 用户打字后的头 300ms 界面完全没反应）。

改成输入框**内部**的胶囊状态条（浅蓝底 + 描边 + 动画 spinner + 深蓝字），并补一个 `isDebouncing`：

```ts
const isDebouncing = keyword.length >= 2 && keyword !== debouncedKeyword;
const isSearching  = keyword.length >= 2 && (isFetching || isDebouncing);
```

对用户来说"我在搜索"从**敲下第一个字符**就成立了，不必等 debounce 和网络这两级延迟。这个判断也能被测试直接验证 —— `uitest` 用一个**短于 debounce 的 250ms 窗口**去抓这个元素，抓到才算数。

---

## 可能的下一步

1. `lib/` 纯函数的单元测试（Vitest）：解析、URL 序列化、错误归一化。
2. 服务端缓存：按坐标 + 小时粒度缓存上游响应，降低限额压力（`revalidate` 或 Redis）。
3. 无 JS 降级：当前选中地点后是客户端请求；可以让首屏完全由服务端渲染（已预取，差的是后续切换也可走 Server Action / RSC 导航）。
4. 可访问性增强：搜索框目前是简化版 combobox，完整实现需要键盘上下键选择与 `aria-activedescendant`。
