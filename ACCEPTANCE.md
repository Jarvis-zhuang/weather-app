# 验收报告 · 天气查询应用

对照需求文档《前端技術作業 – 天氣應用程式》逐条验收。**全部通过。**

| 项目 | 结果 |
| --- | --- |
| 生产构建 | `next build` 通过，TypeScript strict 零错误 |
| 接口冒烟（`smoke.js`） | **29 / 29 PASS**（真实请求 Open-Meteo） |
| 浏览器端到端（`uitest.js`） | **64 / 64 PASS**（真实 Edge，生产模式，含 hydration 后的交互、图表、切城市/首次选城 loading、搜索 loading、中文城市别名、国家/地区标签与三档视口） |
| 验收环境 | Windows · Node 22.22.2 · Next.js 16.3.5 · `next start -p 3100` |

---

## 1. 需求逐条验收

| # | 需求（原文） | 实现 | 验证证据 | 结果 |
| --- | --- | --- | --- | --- |
| 1 | 搜尋地點 | `components/location-search.tsx`：debounce 300ms → `/api/geocode` → 候选列表 → 选中写入 URL | `uitest` 搜「深圳」返回 3 条候选；`smoke` `/api/geocode` 返回 `{name:深圳, latitude:22.54554, longitude:114.0683}` | ✅ |
| 2 | 查看目前天氣狀況 | `components/current-weather-card.tsx`：温度、天气状况、体感温度、相对湿度、风速、观测时间 | `uitest` 断言温度 `27°C` 与体感/湿度/风速均渲染 | ✅ |
| 3 | 查看天氣預報資訊 | `components/forecast-list.tsx`：未来 7 天（日期、天气、最高/最低温、降水量） | `uitest` 断言「未来 7 天预报」且渲染 7 个日期卡片（`days=7`） | ✅ |
| 4 | 妥善處理載入中（Loading） | **四条**加载路径：①首屏/冷启动 → `WeatherSkeleton`；②**首次从空态选城市**（没有旧内容可留）→ 同样走骨架；③**切换城市**（有旧内容）→ `isSwitching` 过渡遮罩 + 输入框「切换中…」；④搜索中 → 输入框内**醒目状态胶囊 + 动画 spinner**（含 300ms debounce 窗口，第一次按键就出现） | `uitest` 限速 2.5s：①捕获骨架；②捕获首次选城骨架（`17-first-pick-loading.png`）且**不套遮罩**；③捕获 `switching-overlay` 并断言旧卡片仍在（`15-city-switch-loading.png`）；④断言搜索胶囊**位于输入框矩形内**、含 16px 动画 spinner、有可见底色、且结果到达后消失（`20-search-loading.png`） | ✅ |
| 5 | 妥善處理錯誤（Error） | 五类错误码 + 中文提示 + 重试按钮；`app/error.tsx` 兜底边界 | `uitest` 非法坐标 → 出现「无法获取天气 / 天气服务拒绝了本次请求」+ 重试按钮（`05-error.png`）；`smoke` 验证 400 `BAD_REQUEST` 契约 | ✅ |
| 6 | 使用任何公開的天氣 API | Open-Meteo（geocoding + forecast） | 服务端真实调用，无 Key | ✅ |
| 7 | Web：React、Next.js | Next.js 16 App Router + React 19.3 + TS strict | `next build` 路由表：`/`、`/api/geocode`、`/api/weather` | ✅ |
| 8 | 交付原始碼 | `weather-app/` 完整源码 | — | ✅ |
| 9 | 交付 README | `README.md`（含架构、状态管理、错误处理、取舍） | — | ✅ |
| 10 | 請控制實作範圍 | 明确列出未做项（单位切换、定位、收藏、键盘导航），见 README「取舍 #6」 | — | ✅ |

---

## 2. 技术考察点对照

需求文档点名 7 个维度，逐一给出落点：

| 考察点 | 落点 | 关键决策 |
| --- | --- | --- |
| 應用程式架構 | `app/` `components/` `hooks/` `lib/` | 三层单向依赖：UI → API Route → 数据源层；只有 `lib/weather-source.ts` 认识 Open-Meteo |
| 元件設計 | 6 个组件 | 展示型（`current-weather-card`、`forecast-list`）与容器型（`weather-dashboard`）分离；展示组件零副作用、可直接测试 |
| 狀態管理 | URL + TanStack Query | 选中地点存 URL（可分享/刷新/前进后退），服务端数据交 Query；**论证了为何不需要 Redux/Zustand** |
| API 整合 | `app/api/*/route.ts` | 用 BFF 代理收敛：统一错误信封、provider 可替换、密钥可隐藏、缓存有落点 |
| 程式碼組織 | 9 个 `lib/` 模块 | 类型、错误、数据源、query key、格式化、URL 编解码各自独立，同名关注点不跨文件散落 |
| 錯誤處理 | `lib/errors.ts` + 五类 code | 4xx 不重试、上游错误不外泄、首屏预取失败降级不 500 |
| 可維護性 | TS strict + 确定性格式化 | `queryKeys` 集中定义防两端漂移；`format.ts` 固定 `timeZone` 避免 hydration mismatch |

### 招聘 JD 对齐：数据可视化

需求文档没要求图表，但目标岗位 JD 里高频出现 ECharts / 可视化，所以在不破坏既有架构的前提下补上：

| 项 | 做法 | 可讲的工程点 |
| --- | --- | --- |
| 图表库 | ECharts 6，`echarts/core` 按需注册（Line/Bar + Grid/Tooltip/Legend + CanvasRenderer） | 不整包引入，控制客户端 chunk 体积 |
| 三个图 | 未来 24 小时（**气温 + 体感温度**双折线 + 降水概率柱，双 Y 轴）、7 天温度区间、7 天降水量 | 双轴、渐变面积、圆角柱、橙色虚线对比等配置集中在 `lib/charts.ts` |
| 封装 | 自写 `hooks/use-echarts.ts`（约 40 行）而非 `echarts-for-react` | 显式处理 SSR（`'use client'` + 只在 effect 里碰 DOM）、`ResizeObserver` 自适应、卸载 `dispose` 防泄漏 |
| 数据 | 新增 `hourly` 请求，**服务端切成未来 24 条**再下发 | 客户端只拿 24 个点而不是 168 个；裁剪放在数据源层 |
| 验证 | `uitest` 断言 canvas 渲染、尺寸非 0、三个 Tab 切换正常、切 Tab 复用同一实例、图例未被裁切；截图 `11~13-charts-*.png` | 图表类 UI 不能只看 SSR HTML，必须验证真实渲染 |

---

## 3. 自动化测试

### 3.1 接口层（`npm run smoke`，29 项）

```
PASS  GET / -> 200
PASS  GET / contains app shell
PASS  GET /api/geocode ok
PASS  geocode returns coordinates :: {"name":"深圳","admin1":"广东","featureCode":"PPLA2","population":17494398,...}
PASS  geocode 北京 returns all candidates :: n=3
PASS  capital ranks first :: {"admin1":"北京市","feature":"PPLC"}
PASS  population is exposed :: 18960744
PASS  population-less village sinks to the bottom :: {"admin1":"四川","feature":"PPL"}
PASS  geocode 东京 命中日本首都（zh 别名兜底） :: n=3
PASS  geocode hongkong 命中（无空格英文写法） :: n=5
PASS  hongkong 首条是香港 :: 香港
PASS  香港 去重为单条 :: n=1 ["PCLS"]
PASS  香港 保留政治实体记录（PCLS，比 PPLC 更能说明它是什么）
PASS  英国 返回独立政治实体记录（PCLI） :: n=1 ["PCLI"]
PASS  澳门 去重为单条（PCLS 胜出） :: n=1 ["PCLS"]
PASS  新加坡 去重为单条（国家记录胜出，机场保留） :: n=2 ["PCLI","AIRP"]
PASS  新加坡 保留独立政治实体记录（PCLI）
PASS  GET /api/weather ok
PASS  current.temperature is number :: 25.8
PASS  daily has 7 entries :: 7
PASS  hourly is sliced to 24 points server-side :: 24
PASS  hourly point carries temperature + precipitation probability
PASS  hourly point carries apparent (feels-like) temperature :: 31.2
PASS  units present :: °C
PASS  GET /?place -> 200
PASS  SSR html contains prefetched temperature :: 26
PASS  missing params -> 400 BAD_REQUEST
PASS  blank keyword -> 400
PASS  invalid coords -> 400 BAD_REQUEST
```

其中 `SSR html contains prefetched temperature` 是关键一项：证明首屏 HTML 里已经带着真实温度，而不是靠浏览器转圈后填充。

### 3.2 浏览器端到端（`node uitest.js`，64 项）

真实 headless Edge（CDP 驱动），**生产模式**下运行：

```
PASS  [需求] 空态有引导，不白屏
PASS  [需求] 搜索地点：出现候选列表          :: options=3
PASS  选中地点：写入 URL（可分享/可刷新）    :: ?lat=22.54554&lon=114.0683&name=深圳&...
PASS  [需求] 查看当前天气：渲染当前天气卡片
PASS  当前天气：显示温度                     :: 27°C
PASS  当前天气：显示体感/湿度/风速
PASS  当前天气：时区显示为友好格式（UTC+8，不泄露 IANA id） :: UTC+8
PASS  [需求] 查看预报：出现 7 天预报
PASS  预报：渲染 7 个日期卡片                :: days=7
PASS  [JD] ECharts 趋势图渲染出 canvas
PASS  趋势图：canvas 有实际尺寸（不是 0 高） :: h=256px
PASS  图表样式：图例不再被画布顶边裁切       :: topRowInk=0
PASS  图表样式：图例文字完整绘制（不是被隐藏） :: legendBandInk=532
PASS  24 小时图：新增「体感温度」橙色对比线     :: orangeInk=1137
PASS  趋势图：切换到 daily 标签正常渲染
PASS  趋势图：切换到 rain 标签正常渲染
PASS  图表动画：切换 Tab 复用同一实例（不重建 canvas）
PASS  图表动画：切换 Tab 有过渡层
PASS  图表动画：动画结束后图表仍正常
PASS  刷新/分享链接：直接打开仍能看到天气
PASS  [需求] 加载状态：显示加载骨架
PASS  [需求] 错误状态：有错误提示
PASS  [需求] 错误状态：提供重试按钮
PASS  搜索：无结果时给明确提示
PASS  移动端 390px：无横向溢出               :: overflow=0px
PASS  移动端 390px：趋势图正常渲染
PASS  移动端：图表 Tab 触摸区 >= 36px        :: 38/38/38
PASS  平板 768px：无横向溢出                 :: overflow=0px
PASS  切换城市：限速下仍能拿到新数据
PASS  [需求] 切换城市：出现 loading 状态
PASS  切换城市：loading 提示在输入框可见
PASS  切换城市：loading 期间旧内容保留（不丢卡片）
PASS  切换城市：loading 期间不闪骨架
PASS  同名地点：全部候选都返回               :: n=3
PASS  同名地点：首都排第一，且标注类型与人口 :: 北京 | 中国 · 北京市 · 首都 · 1896 万人
PASS  同名地点：小地名有明确标注便于区分     :: 北京 | 中国 · 四川 · 村镇级居民点 | 同名小地名
PASS  同名地点：歧义项打上「同名小地名」标记 :: flagged=2/2
PASS  中文城市：东京也能命中日本首都           :: n=3
PASS  中文城市：东京候选含日本首都（东京都/首都） :: 東京 | 日本 · 东京都 · 首都 · 973 万人 || 东京 | 中国 · 江苏 · 村镇级居民点 | 同名小地名 || 东京 | 中国 · 浙江 · 村镇级居民点 | 同名小地名
PASS  中文城市：首都排第一（不被村庄挤掉）     :: 東京 | 日本 · 东京都 · 首都 · 973 万人
PASS  [需求] 首次选城：出现 loading（骨架）
PASS  首次选城：无旧内容时不套遮罩（用骨架）
PASS  首次选城：限速下最终拿到数据
PASS  香港：能搜到                              :: n=1
PASS  香港：不被标成「首都」                    :: 香港 | 地区 · 740 万人
PASS  香港：同一地点去重为一条                  :: n=1
PASS  hongkong（无空格）也能搜到香港            :: 香港 | 地区 · 740 万人
PASS  英国：标注为「国家」而不是「城市」        :: 英国 | 国家 · 6649 万人
PASS  英国：同名条目合并为一条                  :: matched=1 of 1
PASS  英国：不同名的条目不会被打上「同名小地名」
PASS  澳门：标注为「地区」而不是「城市」        :: 澳门 | 地区 · 63 万人
PASS  澳门：同名条目合并为一条                  :: matched=1 of 1
PASS  澳门：不同名的条目不会被打上「同名小地名」
PASS  新加坡：标注为「国家」而不是「城市」      :: 新加坡 | 国家 · 564 万人 || 新加坡樟宜机场 | 新加坡
PASS  新加坡：同名条目合并为一条                :: matched=1 of 2
PASS  新加坡：不同名的条目不会被打上「同名小地名」
PASS  搜索 loading：第一次按键就出现（不等 300ms debounce）
PASS  搜索 loading：渲染在输入框内部            :: {"insideInput":true,"hasSpinner":true,"spinnerSize":16,...}
PASS  搜索 loading：是带动画的 spinner（不是灰字） :: size=16px
PASS  搜索 loading：有可见底色（足够显眼）
PASS  搜索 loading：文案为「搜索中」            :: 搜索中…
PASS  搜索 loading：拿到结果后自动消失
```

覆盖的状态：空态 → 搜索中 → 有结果 → 无结果 → 加载中 → **首次选城骨架** → **切换中** → 错误；视口覆盖 390 / 768 / 1280 三档；另含「分享链接直接打开」、三个图表 Tab、Tab 触摸区尺寸、切 Tab 实例复用、图例裁切回归、体感温度线像素校验、同名地点歧义标记、中文城市别名命中（东京 → 日本首都）、英文无空格写法命中、**国家/地区不会被标成「城市」**（英国 / 澳门 / 新加坡）与**搜索 loading 的位置与可见性**（输入框内、带 spinner、结果到达后消失）。

### 3.3 响应式与「手机上当 App 用」

| 项 | 实现 | 验证 |
| --- | --- | --- |
| 视口适配 | `app/viewport.ts`（`viewport-fit=cover`、`themeColor`，**不禁用缩放**） | `uitest` 三档视口断言无横向溢出 |
| 可安装为 App | `app/manifest.ts` → 构建产物含 `/manifest.webmanifest`；`appleWebApp` meta | `next build` 路由表确认 manifest 已生成 |
| 安全区 | `env(safe-area-inset-*)` 四边内边距 | 代码审查（headless 无法模拟刘海） |
| 手机布局 | 预报 3 列（手机）/ 4 列（平板）/ 7 列（桌面）；图表 `h-56 → h-64` | 截图 `07-mobile.png` / `14-tablet.png` |
| 触摸命中区 | 图表 Tab `min-h-[38px]` | `uitest` 实测 38/38/38 px |
| 图表自适应 | `ResizeObserver` → `chart.resize()` | 移动端图表 canvas 正常渲染且不溢出 |

> 手机实测方法：`npx next start -H 0.0.0.0 -p 3000`，手机浏览器访问 `http://<电脑局域网IP>:3000`，再「添加到主屏幕」。

---

## 4. UI 评审与优化

### 4.1 第一轮：架构与信息表达

首轮截图评审后做了 7 处改动（均已在最新截图中生效）：

| # | 问题 | 改动 | 理由 |
| --- | --- | --- | --- |
| 1 | 凌晨 20:15 仍显示太阳图标 | `describeWeather(code, isDay)`，晴/少云在夜间改用 🌙 | 数据源已返回 `is_day`，不用就是浪费；图标与实际时间不符会显得粗糙 |
| 2 | 7 天预报里「今天」无视觉区分 | 今天那格 `bg-sky-50 ring-1 ring-sky-200` + `aria-current="date"` | 用户第一眼需要定位到今天 |
| 3 | 桌面端 `max-w-3xl` 下 7 列偏挤 | 容器改 `max-w-4xl` | 7 天卡片每格更舒展，仍保持单列阅读宽度 |
| 4 | 错误面板对读屏器不友好 | 容器加 `role="alert"` | 错误出现应被主动播报 |
| 5 | 未标注数据来源 | 页脚加「数据来源 Open-Meteo」外链 | 使用公开 API 的基本署名礼貌，也让评审知道数据从哪来 |
| 6 | 关键元素无稳定选择器 | 加 `data-testid`（`location-option` / `current-weather` / `forecast-day`） | 让自动化验收不依赖文案 |
| 7 | dev 用 `127.0.0.1` 打开时页面"假死" | `next.config.ts` 加 `allowedDevOrigins` | 见下方问题排查 |

保留未改（属于范围控制）：搜索面板键盘导航、单位切换、定位、收藏。

### 4.2 第二轮：三个可用性/视觉缺陷

| # | 问题 | 根因 | 改动 |
| --- | --- | --- | --- |
| 8 | 图表图例文字被画布顶边**切掉上半截** | `legend.top: 0` 让图例文字盒以 10px 高的图标为中心对齐，字号 11px 的文本盒高出容器 2~3px，超出部分被 canvas 直接裁掉（canvas 没有 CSS 的溢出回流，切了就是切了） | `lib/charts.ts`：图例 `top` 提到 6，并给绘图区 `grid.top` 预留 46px（`LEGEND_TOP_OFFSET + LEGEND_ROW_HEIGHT + 18`）；字号 11 的图例文字改用更深的 `#64748b` |
| 9 | 切换城市时**没有任何加载反馈** | 服务端预取让切换"太快"，React 过渡期间界面保持旧城市不变 —— 数据是对的，但用户不确定点击是否生效 | 把导航放进 `useTransition`：`isSwitching` 为真时，结果区盖上毛玻璃遮罩 + 「正在加载「xx」的天气…」（`data-testid="switching-overlay"`），输入框内显示「切换中…」；**旧城市内容保留在遮罩下**，不退回骨架 |
| 10 | 切 ECharts Tab **没有动画** | `<Chart key={tab}>` 每次都换 key → 组件整体重挂载 → 图表重新 `init`，ECharts 的入场动画被丢掉，观感是"啪"地硬切 | 去掉 `key`，改由 `setOption(option, { notMerge: true })` 走同一实例（ECharts 自己会动画新系列）；`lib/charts.ts` 显式声明 `animationDuration: 700 / animationDurationUpdate: 450`；再用一个 keyed 的 `.chart-swap-veil` 做 200ms 轻微淡出，避免硬切 |

三处改动都没有新增依赖，也没有改动数据流。

**为什么切换城市用遮罩、而不是骨架 / 全屏 spinner**：过渡期间旧内容仍然有效可读，把它整个换成骨架是**信息倒退**（用户会失去"我在看哪"的上下文）。遮罩表达的是"旧内容还在、新内容在路上"，这是导航类加载的正确语义。

**为什么去掉 `key` 是"动画"的关键**：React 里 `key` 变化 = 卸载重挂载。图表组件重挂载会走一遍 `echarts.init` → 容器清空 → 重新绘制，ECharts 根本没有机会做过渡。让它复用实例，动画是免费的 —— 这也解释了为什么 `useEChart` 的清理函数只在真正卸载时才该跑。

**回归测试**：`uitest.js` 新增 8 项直接针对这三个缺陷（29 → 37 项）：

| 组 | 断言 | 为什么这样写 |
| --- | --- | --- |
| 图例裁切（2） | 读 canvas **顶部 4 个像素行**，断言无字形墨迹；再读图例所在条带，断言墨迹 > 50 | 第一条抓住"被裁切"（裁切时第一行必然有墨迹）；第二条防止用"隐藏图例"蒙混过关。比截图肉眼比对可靠 |
| Tab 动画（3） | 切 Tab 前后断言 canvas 还是**同一个 DOM 节点**；断言过渡层存在；动画结束后图表仍正常 | `key` 一旦写错就会重挂载 → canvas 节点换新 → 断言失败。直接测根因 |
| 切城市 loading（3 新 + 1 改） | 限速下断言遮罩出现、输入框提示可见、旧卡片仍在、且**未出现骨架** | 同时验证"有反馈"和"不丢内容"两个方向，防止改成一个却破坏另一个 |

> 其中"顶部像素行"这一条来自一个判断：**canvas 是位图，裁切不留任何 DOM 痕迹**，只能从像素层面验证。

### 4.3 第三轮：中文城市搜不到首都

| # | 问题 | 根因 | 改动 |
| --- | --- | --- | --- |
| 11 | 搜「东京」只出现江苏、浙江两个叫「东京」的村子，**真正的日本首都东京不出现**（纽约 / 大阪 / 首尔 / 伦敦 同样搜不到） | Open-Meteo 的 `language=zh` 是拿请求词去**前缀匹配数据集里的中文「本地名」**，而这份本地名并不统一用简体：日本首都在库里存的是繁体「東京」，大阪存「大阪市」，首尔存「首尔特别市」；「纽约」干脆 0 结果。用户敲简体词就永远命不中首都 | `lib/weather-source.ts`：`searchLocations()` 改为**多查询变体**——原始词 + 一张 curated 别名表（`东京→東京`、`纽约→紐約市`、`大阪→大阪市`、`首尔→首尔特别市`、`伦敦→倫敦`）并行请求，`Promise.allSettled` 容忍单条失败，合并后按 id 去重再 `byRelevance` 排序 |

**为什么是"别名表 + 合并"而不是"过滤掉村庄"或"直接换 provider"**：

- 用户名是简体、库里存的可能是繁体或带行政区后缀，这是**数据源自身的不一致**，不是我们的 bug —— 我们没法改别人的数据集。
- 但可以直接换一个 geocoder（试过 Nominatim，从本机请求返回空 body，不可用），代价是新增依赖 + 又要重新处理排序/标注。
- 别名表是**增量兜底**：命不中就补一次，命中就原样返回。它顺应了「北京」那一轮定下的原则 —— **排序 + 标注，不删数据**：东京的日本首都排第一（973 万人 / 首都），两个江苏、浙江的「东京」村仍然保留，并打上「同名小地名」。
- 请求用 `Promise.allSettled` 而不是 `Promise.all`：多打一次接口就多一次失败面，任一变体挂了不该让整次搜索挂掉。

**验证**：`smoke.js` 新增 1 项（`geocode 东京 命中日本首都`），`uitest.js` 新增 3 项（东京候选 ≥2 条、含日本首都、首都排第一），截图 `16-tokyo.png`。

> 顺带修掉一个被这次修复**暴露**出来的测试脆弱点：`uitest.js` 切城市用例原本硬编码断言卡片含简体「伦敦」，修复后排第一的是英国首都「倫敦」（繁体），断言就假失败了 —— 截图其实已显示 `倫敦 · 英国` 正常渲染。已改成匹配国家「英国」或两种写法，测的是"新城市数据到位"这个意图，而不是某一种字形。

### 4.4 第四轮：24 小时图加「体感温度」+ 首次选城的 loading 盲区

| # | 问题 | 根因 | 改动 |
| --- | --- | --- | --- |
| 12 | 24 小时图只有「气温」，看不出「体感」差多少 | 数据层压根没取体感值：`hourly` 请求里没有 `apparent_temperature`，`HourlyPoint` 也没有这个字段（只有当前天气有） | 三处小改：`lib/types.ts` 给 `HourlyPoint` 加 `apparentTemperature`；`lib/weather-source.ts` 的 hourly 请求加上 `apparent_temperature` 并在 `toHourly` 解析（缺失回退到气温）；`lib/charts.ts` 的 24h 图新增一条**橙色虚线**（不填面积，与蓝色实线「气温」区分），legend 变 3 项 |
| 13 | **从空态第一次选城市时完全没有 loading 反馈** | `isLoadingNewPlace = place !== null && …`：遮罩是为"保留旧内容"设计的，而第一次选城时 `place` 仍是 `null`、没有旧内容可留，遮罩条件不成立；同时 `renderWeather()` 在 `!place` 时返回 `EmptyState`，用户只能干等空态 | `components/weather-dashboard.tsx` 新增 `isFirstPickLoading = place === null && isSwitching`，命中即渲染 `WeatherSkeleton`。**语义是"没有旧内容 → 骨架；有旧内容 → 遮罩"**，两条路径各司其职 |

**为什么不是"把遮罩条件的 `place !== null` 去掉"就完事**：那样第一次选城会在**空态**上盖一层"正在加载…"的毛玻璃 —— 空态本身没什么可保留的，毛玻璃没有意义，反而显得多余。真正该表达的是"内容即将出现"，那正是骨架的职责。这也解释了为什么加载态不能只有一个通用 spinner：**要按"有没有旧内容"分叉**。

**回归测试**：`uitest.js` 新增 4 项（40 → 44）——一条从 canvas 像素计数**橙色**墨迹（证明体感线真的画了；`90<g<145` 的窄带把日线图的琥珀色 `#f59e0b` 排除在外），三条限速下断言首次选城**出现骨架、不套遮罩、最终拿到数据**。`smoke.js` 新增 1 项（20 → 21）断言 hourly 点带 `apparentTemperature`。截图 `17-first-pick-loading.png`。

### 4.5 第五轮：两个"把内部标识直接当文案渲染"的低级缺陷

| # | 问题 | 根因 | 改动 |
| --- | --- | --- | --- |
| 14 | 天气卡片在城市名下直接显示 **`Asia/Shanghai`** | `current-weather-card.tsx` 把 `place.timezone`（IANA 时区 id，本来就是给 `fetch` 用的参数）当文案渲染了 —— 典型的"变量值就是文案" | 改成显示友好偏移：`lib/weather-source.ts` 从上游响应读 `utc_offset_seconds`（一直在返回，只是之前没取）→ 放进 `WeatherPayload.utcOffsetSeconds`；`lib/format.ts` 加 `formatUtcOffset()`（`28800 → "UTC+8"`、`19800 → "UTC+5:30"`）；卡片改为渲染它。用整数换算而非 `Intl` 现算，**SSR 与 hydration 必然一致** |
| 15 | 24 小时图右上角 **`%` 与图例「降水概率」叠在一起** | 右侧 Y 轴写了 `name: "%"`，而轴名默认画在轴的顶端 —— 恰好是右对齐图例所在的位置，两段 canvas 文字重叠 | `lib/charts.ts` 去掉右轴的浮动 `name`，单位改随刻度走：`axisLabel.formatter: "{value}%"`。刻度标签位于图例**下方**，结构上不可能再重叠 |

**共同点**：两个都是"把面向机器的标识直接当面向人的文案"。第一处是 `place.timezone`；第二处是 ECharts 轴名的默认位置 —— 它和上一轮"图例被裁切"是同一类问题：**canvas 里的东西不会自己排版**。规律：**provider 给的 id / code 一律要过一层翻译**（`feature_code → 首都/城市`、`timezone id → UTC+8`），不能直接渲染。

**回归测试**：`uitest.js` 新增 1 项（44 → 45），断言卡片文本匹配 `UTC[+-]\d` 且**不含** `Asia/`。第 15 项没有加像素断言 —— 重叠是"文字盖文字"，用像素判定不稳妥，改由截图核验（`03-weather-result.png` / `11-charts-hourly.png`）。

### 4.6 第六轮：`hongkong` 搜不到 + 香港被叫「首都」

| # | 问题 | 根因 | 改动 |
| --- | --- | --- | --- |
| 16 | 输入 **`hongkong`（无空格）搜不出任何结果** | Open-Meteo geocoding 的 `name` 参数是**整词前缀匹配**：多词地名必须以空格分词（`Hong Kong` 才能命中），`hongkong` 作为一个词匹配 0 条。实测 `newyork` / `losangeles` / `sanfrancisco` 同样 0 条 —— 是数据源的匹配规则，不是我们的 bug。但用户（尤其手机输入）默认就会这么打 | 上一轮的 `ZH_GEOCODING_ALIASES` 只处理中文简繁，这轮扩成 `GEOCODING_ALIASES` 并补上常见多词城市的**无空格英文写法**；查找改为 `keyword.toLowerCase()` 大小写不敏感，于是 `HongKong` / `HONGKONG` 一并命中 |
| 17 | 搜「香港」出现 **两条一模一样的结果，且都标着「首都」** | ①`describePlaceType()` 把 `feature_code === "PPLC"` **无条件**翻成「首都」，但 GeoNames 把**非主权实体**（香港、澳门）也登记为 `PPLC`，其 `country` 字段为空 —— 「首都」在语义上必须依附于一个国家，没有国家就谈不上首都。② GeoNames 用两种实体类型登记了同一个香港：`PPLC`（id 1819729，22.278/114.175）与 `PCLS`（id 1819730，22.25/114.167），人口同为 7,396,076；原去重只认 `id`，抓不住这种"同地两种登记" | ① `PPLC → 首都` 增加前置条件 `&& location.country`，为空时落回常规分支（人口 ≥ 城市阈值 → 「城市」）。② 去重改为**多身份键**：`id` ∪ `name+国家+坐标(2 位小数)` ∪ `name+国家+人口`，任一命中即判重复 |

**取证**（直接打接口）：

| 输入 | 修复前 | 修复后 |
| --- | --- | --- |
| `hongkong` | `[]`（0 条） | 5 条，首条 `香港`（其后是 Hong Kong Island / 香港島 / 墨西哥的同名小村落 / 新加坡的 Hong Kong Park） |
| `香港` | 2 条，均 `country:""`、`featureCode:"PPLC"` → 都渲染成「首都」 | **1 条**（当时标「城市」；下一轮引入政治实体标签后改为「地区」，见 §4.7） |

**共同点**：两条都是"**上游给的机器码，不能照着字面翻译**"。`PPLC` 的字面含义是"首府级居民点"，它在 GeoNames 里同时覆盖主权国家首都与非主权实体驻地 —— 直接映射成「首都」就是过度翻译。规律：**凡是枚举值翻译，都要先问一句"这个值在什么前提下才成立"**，然后把前提写进判断条件（这里是"必须有一个国家"）。去重同理：**键要覆盖"同一实体的多种登记方式"**，只用一个 `id` 会在上游重复登记时漏网；但键又不能太松（把墨西哥那个同名小村落也合并掉），所以用"名字 + 国家 + 坐标"这种能唯一定位一个地点、又对 id 差异免疫的组合。

**取舍**：别名表仍是**硬编码的常用词表**（中文简繁 + 常见多词城市无空格写法），不是通用的分词方案 —— 见「已知限制」第 6 条。原则不变：别名只是**"拿另一种写法再问一次数据源"**，查回来的仍然是上游真实数据，不是本地伪造条目。

**回归测试**：`smoke.js` 新增 3 项（21 → 24）—— `hongkong` 命中、首条是香港、香港去重为单条；`uitest.js` 新增 4 项（45 → 49）—— 香港能搜到 / 不被标成「首都」/ 同一地点去重为一条 / `hongkong` 无空格也能命中。截图 `18-hongkong.png`（候选只有一条）。

---

### 4.7 第七轮：国家被标成「城市」+ 搜索 loading 不够显眼

| # | 问题 | 根因 | 改动 |
| --- | --- | --- | --- |
| 18 | 搜「英国」得到的候选被标成 **「城市」** | `describePlaceType()` 的判断顺序有问题：**人口启发式（≥ 50 万 → 城市）排在 `feature_code` 之前**。 GeoNames 把英国登记为 `PCLI`（independent political entity，独立政治实体）而人口 6,648 万 —— 一个国家的记录就这样被"城市"这条兜底规则吃掉了。**同一实体的**其他登记同理：澳门是 `PCLS`（semi-independent，半独立政治实体），新加坡是 `PCLI` | ① 新增 `ENTITY_LABELS`（`PCLI→国家`、`PCLS→地区`、`PCLD`/`TERR→属地`、`PCLF→自由联合邦`、`PCL→政治实体`、`LTER→租借地`），并**放到人口判断之前** —— 一个地方"是什么"永远优先于"住了多少人"。② 副标题里若 `国家 === 名称` 就不再重复（否则「英国」这一行会读成 `英国 / 英国 · 国家 · 6649 万人`） |
| 19 | 澳门、新加坡 **各出现两条** | 与上一轮香港同一类问题，但更难抓：GeoNames 把同一块地方同时登记为**政治实体**（`PCLS`/`PCLI`）和它的**驻地**（`PPLC`），而这两条不仅 id 不同，**坐标和人口也都略有差异**（澳门 22.20/113.55 vs 22.16/113.56，人口 649,335 vs 631,636）—— 上一轮那套 `id` / `name+坐标(2位小数)` / `name+人口` 的键全都匹配不上 | 新增一道 **entity twin 合并**：两条记录**都**属于政治实体类码、名称与国家相同、且相距 ≤ 0.5°（约 55 km）时判为同一实体，保留**更能说明它是什么**的那一条（`PCLI` > `PCLS` > … > `PPLC`），于是 香港/澳门 得到「地区」、新加坡 得到「国家」。普通居民点完全不受影响 —— 两个真·同名村庄依然各自保留 |
| 20 | 搜索时的 **「搜索中…」是一行浅灰小字，不够显眼** | ① 视觉上只是一段 `text-slate-400` 文本，和占位符一个色阶，扫一眼看不见；② 时机上它绑的是 `isFetching`，要等 300ms debounce 走完、请求真正发出去之后才出现 —— **用户打字后的头 300ms 界面毫无反馈** | `components/location-search.tsx`：换成 **输入框内部的胶囊状态条**（`bg-sky-50` + `border-sky-200` + 动画 spinner + `text-sky-700`），与「切换中…」共用同一个 `StatusChip`；并新增 `isDebouncing` —— 只要输入框里的词和 debounce 后的词不一致，就算"正在搜索"，**第一次按键就有反馈**。下拉列表里的「搜索中…」行同样补上 spinner |

**顺带修掉一个被这轮测试暴露的缺陷**：`isMinorNamesake()` 原来只做一件事 —— `人口 < 最高人口` 就打上「同名小地名」标签。但标签写的是"**同名**"，它却从不检查名字：搜「新加坡」时，「新加坡**樟宜机场**」因为完全没有人口数据也被打了这个标签。改成同时要求**条目名等于用户输入的词**（用查询词比对，而不是比对榜首条目 —— 后者对北京成立、对东京就会失效，因为榜首存的是繁体「東京」）。

**取证**（直接打接口）：

| 输入 | 修复前 | 修复后 |
| --- | --- | --- |
| `英国` | 1 条 `PCLI`，渲染成 `英国 · 城市 · 6649 万人` | 1 条 → `英国 · 国家 · 6649 万人` |
| `澳门` | **2 条**（`PPLC` + `PCLS`），`country` 均为空 → 都落进「城市」兜底 | 1 条 `PCLS` → `澳门 · 地区 · 63 万人` |
| `新加坡` | **2 条同名**（`PPLC` + `PCLI`，人口差 24 人） | 1 条 `PCLI` → `新加坡 · 国家 · 564 万人`（机场条目保留） |
| `香港` | 1 条，当时标「城市」 | 1 条 `PCLS` → `香港 · 地区 · 740 万人` |

**规律**：这一轮的两条又是同一个母题 —— **"枚举码 → 人话"的映射必须带上分类层级**。上一轮学到的是"`PPLC` 不等于首都，因为前提（有一个国家）不成立"；这一轮进一步：**同一批码里还混着"政治实体"和"居民点"两个层级**，人口启发式只对后者成立，所以翻译规则必须先分层、再判断。而 19 号问题说明**"同一实体"这件事上游自己都没统一**（id、坐标、人口全不一致），只能靠"名称 + 国家 + 距离量级 + 类别"这一组弱信号拼出一个可靠的判据。

**取舍**：`PCLS → 「地区」` 是一个**刻意的简化翻译**。GeoNames 的 `PCLS` 字面是"半独立政治实体"，真正的准确说法是「特别行政区」之类 —— 但「地区」对 香港 / 澳门 / 其他同类条目都成立，且不会误导读成主权国家。宁可给一个广覆盖、不冒犯的中性词，也不做只服务一两个条目的窄标签（见「已知限制」第 7 条）。

**回归测试**：`smoke.js` 新增 5 项（24 → 29）—— 香港保留 PCLS、英国返回 PCLI、澳门去重为单条、新加坡去重为单条且保留 PCLI；`uitest.js` 新增 15 项（49 → 64）—— 英国/澳门/新加坡 各 3 项（标注正确、同名合并、不同名不打「同名小地名」），加 6 项专门针对搜索 loading（**第一次按键就出现**、**渲染在输入框矩形内部**、含 ≥12px 动画 spinner、有可见底色、文案为「搜索中」、结果到达后自动消失）。截图 `19-uk-country.png`（英国 → 国家）、`20-search-loading.png`（输入框内的 loading 胶囊）。

---

## 5. 排查记录：一个会骗过验收的 hydration 问题

**现象**：页面 HTML 正常、数据也在，但输入框打字、点候选都没反应。

**诊断**（CDP 直接查运行时）：`document.querySelector('#location-search')._valueTracker` 为 `false` —— React 从未接管页面，说明客户端 JS 没执行。

**根因**：Next.js 16 的 dev server 默认阻止非 `localhost` 来源访问 dev 专属资源。验收脚本用的是 `http://127.0.0.1:3100`，于是 `/_next/hmr` 与客户端 chunk 被拦截，SSR 出来了、hydration 没发生。dev 日志原文：

```
⚠ Blocked cross-origin request to Next.js dev resource /_next/hmr from "127.0.0.1".
```

**修复**：`next.config.ts` 增加 `allowedDevOrigins: ["127.0.0.1", "localhost"]`。

**验证**：生产模式（`next start`，同样用 `127.0.0.1` 访问）18/18 全过 —— 证明这是 dev 专属限制，与生产行为无关；同时说明**只验证 SSR HTML 的冒烟测试会漏掉这类问题**，必须跑真实浏览器交互。这也是本次补上 `uitest.js` 的直接原因。

---

## 6. 案例：搜索「北京」为什么出现四川、重庆

**现象**：搜「北京」出现三条 —— 北京（北京市）、北京（重庆市）、北京（四川），后两条看不出是什么。

**取证**（直接请求数据源，`count=6` 也只返回这 3 条）：

| # | name | admin1 | feature_code | population |
| --- | --- | --- | --- | --- |
| 1 | 北京 | 北京市 | `PPLC`（首都） | 18,960,744 |
| 2 | 北京 | 重庆市 | `PPL`（普通居民点） | 无 |
| 3 | 北京 | 四川 | `PPL`（普通居民点） | 无 |

**结论**：不是代码 bug。GeoNames 里重庆、四川确实有叫「北京」的村级居民点，Open-Meteo 原样返回，且顺序本身已经把首都排在第一。

**真正的问题**：我们的解析层只取了 `name / admin1 / lat / lon / timezone`，**把 API 已经给出的判别依据（`feature_code`、`population`）丢掉了**，导致 UI 三条都显示「北京 / 中国」，用户无从分辨。

**修复**（三处，都很小）：

1. `lib/weather-source.ts`：解析并保留 `feature_code` → `featureCode`、`population`。
2. `lib/geo.ts`（新增）：`byRelevance()` 按人口降序、同人口按 feature 等级排序；`describePlaceType()` 先按**政治实体类码**（`PCLI→国家`、`PCLS→地区`…）判断，再把 `PPLC` 译为「首都」、大 `PPL` 译为「城市」、小 `PPL`/`PPLL` 译为「居民点 / 村落」；`formatPopulation()` 输出「1896 万人」。（实体标签与搜索 loading 是后面几轮补上的，见 §4.7。）
3. `components/location-search.tsx`：候选副标题从「中国」升级为「中国 · 北京市 · 首都 · 1896 万人」；小地名显示为「中国 · 重庆市 · **村镇级居民点**」，并在列表里存在更有名的同名项时，额外打上琥珀色 **「同名小地名」** 标记（`isMinorNamesake()`）。

   标记只在**确实存在歧义**时才出现：如果搜的就是那个村子（列表里没有更大的同名项），不会显示任何警告 —— 否则用户会以为自己搜错了。

**验证**：`smoke.js` 新增 4 项（首都排第一、`PPLC`、人口字段存在、无人口小地名沉底），`uitest.js` 新增 3 项（候选齐全、首条含「首都」与人口、其余条目有类型标注），截图 `10-beijing-candidates.png`。

**为什么保留小地名而不是过滤掉**：用户可能确实要查那个村；过滤会丢数据，正确做法是**排序 + 标注**，把判断权交给用户。

---

## 7. 案例：搜索「东京」为什么没有东京

**现象**：搜「东京」只列出江苏、浙江两个同名村庄，真正的日本东京不在候选里。（纽约 / 大阪 / 首尔 / 伦敦 同样搜不到首都。）

**取证**（直接请求数据源，`language=zh`，`count=6`）：

| 输入 | 结果 |
| --- | --- |
| `东京`（简体） | 东京 / 中国江苏 / `PPL`；东京 / 中国浙江 / `PPL` —— **没有日本** |
| `東京`（繁体） | 東京 / 日本 / 东京都 / `PPLC` / 973 万 ✅ |
| `纽约` → `紐約市` | 简体 **0 条**；繁体 → 美国纽约州 ✅ |
| `大阪` → `大阪市` | 简体 **0 条**；带后缀 → 日本大阪府 ✅ |
| `首尔` → `首尔特别市` | 简体 **0 条**；带后缀 → 韩国 ✅ |
| `伦敦` → `倫敦` | 简体 → 加拿大、美国两个村子；繁体 → 英国 ✅ |

**结论**：不是我们的解析 bug —— 是数据源的中文「本地名」不统一（简繁混用 + 行政区后缀），而它的搜索是拿请求词去**前缀匹配这个本地名**。修复思路与验证见 §4.3。

**顺带否掉的方案**：用 Nominatim 兜底 —— 本机直连返回空 body，不可用；且会引入新依赖，并重新面对排序/标注问题。

---

## 8. 已知限制

1. **骨架（`WeatherSkeleton`）只在冷启动/预取失败时出现** —— 正常首屏与切换城市都走服务端预取，所以看到的是「旧内容 + 加载遮罩」而不是骨架。这是设计目的（不闪骨架），验收时通过 CDP 限速复现骨架路径。
2. **搜索面板无键盘导航**（↑↓ / Enter / Esc），当前仅鼠标点击；完整 combobox 需要 `aria-activedescendant` 与焦点管理。
3. **无单元测试**：`lib/` 下纯函数（URL 编解码、上游响应解析、错误归一）最值得补 Vitest，已写入 README 的下一步。
4. **`uitest.js` 依赖本机 Edge + CDP 9222 端口**，属于本机验收脚本，不是可移植的 CI 测试（CI 应改用 Playwright）。
5. 无单位切换 / 定位 / 收藏 —— 见 README「取舍 #6」，属主动砍掉的范围。
6. **多词地名的别名表是硬编码的**（`lib/weather-source.ts` 的 `GEOCODING_ALIASES`），只覆盖中文简繁差异与常见多词城市的无空格英文写法（`hongkong` / `newyork` / `losangeles` / `sanfrancisco` 等）。**没进表的**多词英文城市仍会因上游"整词前缀匹配"而搜不到。彻底解决要么换支持模糊匹配的数据源，要么在客户端做通用分词试探 —— 都超出本次作业范围，故以显式限制记录在案。
7. **`PCLS → 「地区」` 是简化翻译**：GeoNames 的 `PCLS` 字面是 "semi-independent political entity"，只对少数条目成立的精确说法是「特别行政区」；这里选了覆盖面更广的中性词。同理 `PCLI`（独立政治实体）统一译作「国家」，不区分政体差异 —— 对天气应用够用，但不是政治地理学意义上的精确。
8. **"同一实体"的判据是弱信号拼出来的**：`collapseEntityTwins()` 靠"名称 + 国家 + 相距 ≤ 0.5°"识别上游的重复登记。若某个实体的两条记录相距超过约 55 km、或名称/国家字段不一致，合并就会失效（用户会再看到两条）；反向的误合并风险同理存在，只是实测更罕见。

---

## 9. 截图清单（`../shots/`）

| 文件 | 内容 |
| --- | --- |
| `01-empty.png` | 空态：引导用户开始搜索 |
| `02-search-panel.png` | 搜索「深圳」候选列表 |
| `03-weather-result.png` | 当前天气 + 7 天预报（夜间图标、今天高亮；时区显示为 `UTC+8`） |
| `04-shanghai.png` | 直接打开带参数的分享链接 |
| `05-error.png` | 错误态 + 重试按钮 |
| `06-search-empty.png` | 搜索无结果提示 |
| `07-mobile.png` | 390px 移动端（无横向溢出） |
| `08-loading.png` | 加载骨架态 |
| `09-city-switch.png` | 限速下客户端切换城市（新数据已到位） |
| `15-city-switch-loading.png` | 切换城市中的 loading 遮罩（旧城市仍在遮罩下） |
| `10-beijing-candidates.png` | 搜「北京」：同名地点按人口排序并标注类型/人口 |
| `16-tokyo.png` | 搜「东京」：日本首都（東京 · 东京都 · 首都）排第一，中文同名村庄标注保留 |
| `18-hongkong.png` | 搜「香港」：**只有一条**候选，标注为「香港 · 地区 · 740 万人」—— 既去掉了重复条目，也不再误标「首都」 |
| `19-uk-country.png` | 搜「英国」：标注为「英国 · 国家 · 6649 万人」—— 一个国家不再被说成城市 |
| `20-search-loading.png` | 搜索 loading：输入框**内部**右端的胶囊状态条（动画 spinner + 「搜索中…」），与清除按钮互不遮挡 |
| `17-first-pick-loading.png` | 空态首次选城市：骨架屏出现（无旧内容可留，故用骨架而非遮罩） |
| `11-charts-hourly.png` | ECharts：未来 24 小时 —— 气温（蓝实线）+ 体感温度（橙虚线）+ 降水概率（双 Y 轴） |
| `12-charts-daily.png` | ECharts：7 天最高/最低温趋势 |
| `13-charts-rain.png` | ECharts：7 天降水量柱状图 |
| `14-tablet.png` | 平板 768px 视口 |
