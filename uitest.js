/**
 * Browser acceptance test driven over CDP (Chrome DevTools Protocol).
 * Runs against a real headless Edge: navigate, type, click, screenshot.
 *
 * Prereq: Edge started with --remote-debugging-port=9222
 * Usage:  node uitest.js
 */
const fs = require("node:fs");
const path = require("node:path");

const PORT = 9222;
const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const OUT = path.join(__dirname, "..", "shots");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpJson(url, method = "GET") {
  const res = await fetch(url, { method });
  return res.json();
}

class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => reject(new Error("timeout: " + method)), 20000);
    });
  }

  async evaluate(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " :: " + expression);
    return r.result.value;
  }

  async text() {
    return this.evaluate("document.body.innerText");
  }

  async waitFor(expression, { timeout = 20000, interval = 300 } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const ok = await this.evaluate(`(()=>{try{return !!(${expression})}catch(e){return false}})()`);
      if (ok) return true;
      await sleep(interval);
    }
    return false;
  }

  async shot(name) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(data, "base64"));
    console.log("       shot: " + name + ".png");
  }

  /** Type into a React-controlled input the way React expects. */
  async typeInto(selector, value) {
    return this.evaluate(`(()=>{
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return "NO_ELEMENT";
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return el.value;
    })()`);
  }
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const session = new Session(ws);
  await session.send("Page.enable");
  await session.send("Runtime.enable");
  return session;
}

async function openTab(url) {
  const target = await httpJson(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, "PUT");
  const session = await connect(target.webSocketDebuggerUrl);
  return { target, session };
}

const results = [];
function check(label, ok, detail = "") {
  results.push({ label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  :: " + detail : ""}`);
}

const HYD =
  "!!document.querySelector('#location-search') && !!document.querySelector('#location-search')._valueTracker";

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // ================= A. empty state =================
  const { target, session } = await openTab(BASE + "/");
  await session.waitFor(HYD);
  const emptyText = await session.text();
  check("[需求] 空态有引导，不白屏", /搜索一个城市开始/.test(emptyText));
  await session.shot("01-empty");

  // ================= B. search =================
  await session.evaluate("document.querySelector('#location-search').focus()");
  const typed = await session.typeInto("#location-search", "深圳");
  check("搜索：输入成功", typed === "深圳", String(typed));

  const listShown = await session.waitFor(
    "document.querySelectorAll('[data-testid=\"location-option\"]').length > 0",
  );
  const optionCount = await session.evaluate(
    "document.querySelectorAll('[data-testid=\"location-option\"]').length",
  );
  check("[需求] 搜索地点：出现候选列表", listShown && optionCount > 0, `options=${optionCount}`);
  check("搜索：候选包含匹配项", /深圳/.test(await session.text()));
  await session.shot("02-search-panel");

  // ================= C. select -> current + forecast =================
  await session.evaluate(
    "document.querySelectorAll('[data-testid=\"location-option\"]')[0].dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))",
  );
  const gotWeather = await session.waitFor(
    "!!document.querySelector('[data-testid=\"current-weather\"]')",
  );
  const url = await session.evaluate("location.search");
  check("选中地点：写入 URL（可分享/可刷新）", /lat=/.test(url) && /lon=/.test(url) && /name=/.test(url), url);
  check("[需求] 查看当前天气：渲染当前天气卡片", gotWeather);
  const detailText = await session.text();
  check("当前天气：显示温度", /\d+(\.\d+)?\s*°C/.test(detailText), (detailText.match(/\d+(\.\d+)?\s*°C/) || [""])[0]);
  check("当前天气：显示体感/湿度/风速", /体感/.test(detailText) && /湿度/.test(detailText) && /风速/.test(detailText));
  // The card used to print the raw IANA zone id ("Asia/Shanghai"); it must now
  // show a friendly UTC offset and never leak the id.
  const cardText = await session.evaluate(
    "(()=>{const el=document.querySelector('[data-testid=\"current-weather\"]'); return el ? el.innerText : ''})()",
  );
  check(
    "当前天气：时区显示为友好格式（UTC+8，不泄露 IANA id）",
    /UTC[+-]\d/.test(cardText) && !/Asia\//.test(cardText),
    (cardText.match(/UTC[+-][\d:]+/) || ["<none>"])[0],
  );
  check("[需求] 查看预报：出现 7 天预报", /未来 7 天预报/.test(detailText));
  const dayCount = await session.evaluate(
    "document.querySelectorAll('[data-testid=\"forecast-day\"]').length",
  );
  check("预报：渲染 7 个日期卡片", dayCount === 7, `days=${dayCount}`);
  await session.shot("03-weather-result");

  // ================= C2. ECharts trend charts =================
  const chartReady = await session.waitFor(
    "!!document.querySelector('[data-testid=\"weather-charts\"] canvas')",
  );
  check("[JD] ECharts 趋势图渲染出 canvas", chartReady);
  const chartHeight = await session.evaluate(
    "(()=>{const c=document.querySelector('[data-testid=\"weather-charts\"] canvas'); return c ? c.getBoundingClientRect().height : 0})()",
  );
  check("趋势图：canvas 有实际尺寸（不是 0 高）", chartHeight > 100, `h=${Math.round(chartHeight)}px`);

  /**
   * Regression guard for the legend-clipping bug: with `legend.top: 0` the
   * label box was centred on the 10px item, so the glyphs stuck out above the
   * canvas and the top rows contained sliced text pixels. After the fix the
   * first few device rows must be pure background.
   */
  const topRowInk = await session.evaluate(`(()=>{
    const c = document.querySelector('[data-testid="weather-charts"] canvas');
    if (!c) return -1;
    const d = c.getContext('2d').getImageData(0, 0, c.width, 4).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 30 && (d[i] < 210 || d[i + 1] < 210 || d[i + 2] < 210)) ink += 1;
    }
    return ink;
  })()`);
  check("图表样式：图例不再被画布顶边裁切", topRowInk === 0, `topRowInk=${topRowInk}`);

  // ...and the legend must still actually be painted (guards against "fixing"
  // the clip by hiding the legend altogether).
  const legendBandInk = await session.evaluate(`(()=>{
    const c = document.querySelector('[data-testid="weather-charts"] canvas');
    if (!c) return -1;
    const dpr = window.devicePixelRatio || 1;
    const d = c.getContext('2d').getImageData(0, Math.round(8 * dpr), c.width, Math.round(16 * dpr)).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 30 && (d[i] < 210 || d[i + 1] < 210 || d[i + 2] < 210)) ink += 1;
    }
    return ink;
  })()`);
  check("图表样式：图例文字完整绘制（不是被隐藏）", legendBandInk > 50, `legendBandInk=${legendBandInk}`);

  // The 24h chart now carries a second line ("体感温度") drawn in orange
  // (#f97316 = rgb 249,115,22). Orange appears nowhere else in the hourly
  // canvas, and the amber used by the daily chart has g≈158, so a tight
  // 90<g<145 band isolates the new line and proves it was actually painted.
  const feelsLineInk = await session.evaluate(`(()=>{
    const c = document.querySelector('[data-testid="weather-charts"] canvas');
    if (!c) return -1;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let hit = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      if (a > 120 && r > 200 && g > 90 && g < 145 && b < 90) hit += 1;
    }
    return hit;
  })()`);
  check("24 小时图：新增「体感温度」橙色对比线", feelsLineInk > 40, `orangeInk=${feelsLineInk}`);
  await session.shot("11-charts-hourly");

  for (const [tab, name] of [["daily", "12-charts-daily"], ["rain", "13-charts-rain"]]) {
    await session.evaluate(`document.querySelector('[data-testid="chart-tab-${tab}"]').click()`);
    await sleep(900);
    const ok = await session.evaluate(
      "!!document.querySelector('[data-testid=\"weather-charts\"] canvas')",
    );
    check(`趋势图：切换到 ${tab} 标签正常渲染`, ok);
    await session.shot(name);
  }

  // Animation on tab switch: the canvas node must survive (ECharts animates the
  // new series itself); a remount would mean we lost the instance and the
  // transition would be a hard cut.
  await session.evaluate(
    "window.__chartCanvas = document.querySelector('[data-testid=\"weather-charts\"] canvas')",
  );
  await session.evaluate("document.querySelector('[data-testid=\"chart-tab-hourly\"]').click()");
  await sleep(120);
  const canvasReused = await session.evaluate(
    "window.__chartCanvas === document.querySelector('[data-testid=\"weather-charts\"] canvas')",
  );
  check("图表动画：切换 Tab 复用同一实例（不重建 canvas）", canvasReused);
  const veilShown = await session.evaluate("!!document.querySelector('.chart-swap-veil')");
  check("图表动画：切换 Tab 有过渡层", veilShown);
  await sleep(900);
  const afterAnim = await session.evaluate(
    "!!document.querySelector('[data-testid=\"weather-charts\"] canvas')",
  );
  check("图表动画：动画结束后图表仍正常", afterAnim);

  // ================= D. shared / refreshed URL =================
  await session.send("Page.navigate", {
    url: BASE + "/?lat=31.2304&lon=121.4737&name=%E4%B8%8A%E6%B5%B7&country=%E4%B8%AD%E5%9B%BD&tz=Asia/Shanghai",
  });
  await session.waitFor(HYD);
  const sharedOk = await session.waitFor(
    "document.body.innerText.includes('上海') && !!document.querySelector('[data-testid=\"current-weather\"]')",
  );
  check("刷新/分享链接：直接打开仍能看到天气", sharedOk);
  await session.shot("04-shanghai");

  // ================= E. loading -> error =================
  // Server prefetch fails fast here (provider rejects the coordinates), so the
  // client is the one that fetches — which is exactly the loading path.
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    offline: false, latency: 2500, downloadThroughput: -1, uploadThroughput: -1,
  });
  await session.send("Page.navigate", { url: BASE + "/?lat=91&lon=181&name=NA&tz=auto" });
  let sawSkeleton = false;
  for (let i = 0; i < 40; i += 1) {
    if (await session.evaluate("!!document.querySelector('[data-testid=\"weather-skeleton\"]')")) {
      sawSkeleton = true;
      break;
    }
    await sleep(150);
  }
  check("[需求] 加载状态：显示加载骨架", sawSkeleton);
  if (sawSkeleton) await session.shot("08-loading");
  await session.send("Network.emulateNetworkConditions", {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });

  await session.waitFor(HYD);
  const errShown = await session.waitFor(
    "!!Array.from(document.querySelectorAll('button')).find(b=>/重试|重新/.test(b.textContent))",
  );
  const errText = await session.text();
  check("[需求] 错误状态：有错误提示", /失败|无法|错误|不可用|拒绝了/.test(errText), errText.slice(0, 70).replace(/\n/g, " | "));
  check("[需求] 错误状态：提供重试按钮", errShown);
  await session.shot("05-error");

  // ================= F. search with no result =================
  await session.send("Page.navigate", { url: BASE + "/" });
  await session.waitFor(HYD);
  await session.evaluate("document.querySelector('#location-search').focus()");
  await session.typeInto("#location-search", "zzzzzzzznotaplace");
  const noResult = await session.waitFor("document.body.innerText.includes('没有找到匹配的城市')");
  check("搜索：无结果时给明确提示", noResult);
  await session.shot("06-search-empty");

  // ================= G. mobile =================
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  });
  await session.send("Page.navigate", {
    url: BASE + "/?lat=22.54554&lon=114.0683&name=%E6%B7%B1%E5%9C%B3&country=%E4%B8%AD%E5%9B%BD&tz=Asia/Shanghai",
  });
  await session.waitFor(HYD);
  await session.waitFor("!!document.querySelector('[data-testid=\"current-weather\"]')");
  const overflow = await session.evaluate(
    "document.documentElement.scrollWidth - document.documentElement.clientWidth",
  );
  check("移动端 390px：无横向溢出", overflow <= 1, `overflow=${overflow}px`);

  const mobileChart = await session.waitFor(
    "!!document.querySelector('[data-testid=\"weather-charts\"] canvas')",
  );
  check("移动端 390px：趋势图正常渲染", mobileChart);

  const tapTargets = await session.evaluate(
    "Array.from(document.querySelectorAll('[data-testid^=\"chart-tab-\"]')).map(el => Math.round(el.getBoundingClientRect().height))",
  );
  check(
    "移动端：图表 Tab 触摸区 >= 36px",
    tapTargets.length > 0 && tapTargets.every((h) => h >= 36),
    tapTargets.join("/"),
  );
  await session.shot("07-mobile");

  // Tablet
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: 768, height: 1024, deviceScaleFactor: 1, mobile: false,
  });
  await sleep(1200);
  const tabletOverflow = await session.evaluate(
    "document.documentElement.scrollWidth - document.documentElement.clientWidth",
  );
  check("平板 768px：无横向溢出", tabletOverflow <= 1, `overflow=${tabletOverflow}px`);
  await session.shot("14-tablet");

  // ================= H. client-side switch under throttling =============
  // Start from an already-rendered city so we can prove the switch keeps the
  // old content on screen instead of falling back to a skeleton.
  await session.send("Emulation.clearDeviceMetricsOverride");
  await session.send("Page.navigate", {
    url: BASE + "/?lat=22.54554&lon=114.0683&name=%E6%B7%B1%E5%9C%B3&country=%E4%B8%AD%E5%9B%BD&tz=Asia/Shanghai",
  });
  await session.waitFor(HYD);
  await session.waitFor("!!document.querySelector('[data-testid=\"current-weather\"]')");
  await session.evaluate("document.querySelector('#location-search').focus()");
  await session.typeInto("#location-search", "伦敦");
  await session.waitFor("document.querySelectorAll('[data-testid=\"location-option\"]').length > 0");

  await session.send("Network.emulateNetworkConditions", {
    offline: false, latency: 2500, downloadThroughput: 80 * 1024, uploadThroughput: 80 * 1024,
  });
  await session.evaluate(
    "document.querySelectorAll('[data-testid=\"location-option\"]')[0].dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))",
  );
  let skeletonOnSwitch = false;
  let londonAppeared = false;
  let overlaySeen = false;
  let chipSeen = false;
  let oldCardKept = false;
  let overlayShotTaken = false;
  for (let i = 0; i < 60; i += 1) {
    if (await session.evaluate("!!document.querySelector('[data-testid=\"weather-skeleton\"]')")) {
      skeletonOnSwitch = true;
    }
    if (await session.evaluate("!!document.querySelector('[data-testid=\"switching-overlay\"]')")) {
      overlaySeen = true;
      // The overlay must sit on top of the *previous* city, not a skeleton.
      if (await session.evaluate("!!document.querySelector('[data-testid=\"current-weather\"]')")) {
        oldCardKept = true;
      }
      if (!overlayShotTaken) {
        overlayShotTaken = true;
        await session.shot("15-city-switch-loading");
      }
    }
    if (await session.evaluate("!!document.querySelector('[data-testid=\"search-switch-status\"]')")) {
      chipSeen = true;
    }
    // The "new city is here" signal must come from the weather card, not from
    // the overlay copy (which also contains the city name). Match the country
    // too: with the geocoding fix the UK capital "倫敦" (traditional) now ranks
    // first, so a hard-coded simplified "伦敦" would miss the rendered card.
    if (
      await session.evaluate(
        "(()=>{const el=document.querySelector('[data-testid=\"current-weather\"]'); return !!el && /英国|倫敦|伦敦/.test(el.innerText)})()",
      )
    ) {
      londonAppeared = true;
      break;
    }
    await sleep(150);
  }
  check("切换城市：限速下仍能拿到新数据", londonAppeared);
  check("[需求] 切换城市：出现 loading 状态", overlaySeen);
  check("切换城市：loading 提示在输入框可见", chipSeen);
  check("切换城市：loading 期间旧内容保留（不丢卡片）", oldCardKept);
  check("切换城市：loading 期间不闪骨架", !skeletonOnSwitch);
  await session.shot("09-city-switch");
  await session.send("Network.emulateNetworkConditions", {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });

  // ================= I. same-named places are distinguishable ==========
  await session.send("Page.navigate", { url: BASE + "/" });
  await session.waitFor(HYD);
  await session.evaluate("document.querySelector('#location-search').focus()");
  await session.typeInto("#location-search", "北京");
  const bjReady = await session.waitFor(
    "document.querySelectorAll('[data-testid=\"location-option\"]').length >= 3",
  );
  const bjOptions = await session.evaluate(
    "Array.from(document.querySelectorAll('[data-testid=\"location-option\"]')).map(el => el.innerText.replace(/\\n/g, ' | '))",
  );
  check("同名地点：全部候选都返回", bjReady && bjOptions.length >= 3, `n=${bjOptions.length}`);
  check("同名地点：首都排第一，且标注类型与人口", /首都/.test(bjOptions[0]) && /万人/.test(bjOptions[0]), bjOptions[0]);
  check(
    "同名地点：小地名有明确标注便于区分",
    bjOptions.slice(1).some((t) => /村镇级居民点|村落|城区/.test(t)),
    bjOptions[bjOptions.length - 1],
  );
  check(
    "同名地点：歧义项打上「同名小地名」标记",
    bjOptions.slice(1).filter((t) => /同名小地名/.test(t)).length === bjOptions.length - 1,
    `flagged=${bjOptions.slice(1).filter((t) => /同名小地名/.test(t)).length}/${bjOptions.length - 1}`,
  );
  await session.shot("10-beijing-candidates");

  // ================= J. simplified-zh geocoding must find the capital =====
  // Regression for the "东京不是城市" bug: Open-Meteo's zh dataset stores the
  // capital as "東京" (traditional), so typing "东京" used to return only
  // Chinese villages. After the alias-expansion fix the Japanese capital must
  // be offered — and ranked first, not buried under the villages.
  await session.send("Page.navigate", { url: BASE + "/" });
  await session.waitFor(HYD);
  await session.evaluate("document.querySelector('#location-search').focus()");
  await session.typeInto("#location-search", "东京");
  const tokyoReady = await session.waitFor(
    "document.querySelectorAll('[data-testid=\"location-option\"]').length >= 2",
  );
  const tokyoOptions = await session.evaluate(
    "Array.from(document.querySelectorAll('[data-testid=\"location-option\"]')).map(el => el.innerText.replace(/\\n/g, ' | '))",
  );
  check("中文城市：东京也能命中日本首都", tokyoReady && tokyoOptions.length >= 2, `n=${tokyoOptions.length}`);
  check(
    "中文城市：东京候选含日本首都（东京都/首都）",
    tokyoOptions.some((t) => /日本|东京都/.test(t)),
    tokyoOptions.join(" || "),
  );
  check(
    "中文城市：首都排第一（不被村庄挤掉）",
    /日本|东京都/.test(tokyoOptions[0] ?? ""),
    tokyoOptions[0] ?? "",
  );
  await session.shot("16-tokyo");

  // ================= K. first pick from the empty state shows loading =====
  // Regression for the requirement "妥善处理加载中(Loading)": the *first* city
  // has no previous content to keep, so the switch overlay has nothing to sit
  // on. Before the fix the empty state just sat there with zero feedback while
  // the first city loaded; a skeleton must appear instead.
  await session.send("Page.navigate", { url: BASE + "/" });
  await session.waitFor(HYD);
  await session.evaluate("document.querySelector('#location-search').focus()");
  await session.typeInto("#location-search", "深圳");
  await session.waitFor("document.querySelectorAll('[data-testid=\"location-option\"]').length > 0");

  await session.send("Network.emulateNetworkConditions", {
    offline: false, latency: 2500, downloadThroughput: 80 * 1024, uploadThroughput: 80 * 1024,
  });
  await session.evaluate(
    "document.querySelectorAll('[data-testid=\"location-option\"]')[0].dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))",
  );
  let firstPickSkeleton = false;
  let firstPickOverlay = false;
  let firstPickLoaded = false;
  let firstPickShot = false;
  for (let i = 0; i < 80; i += 1) {
    if (await session.evaluate("!!document.querySelector('[data-testid=\"weather-skeleton\"]')")) {
      firstPickSkeleton = true;
      if (!firstPickShot) {
        firstPickShot = true;
        await session.shot("17-first-pick-loading");
      }
    }
    if (await session.evaluate("!!document.querySelector('[data-testid=\"switching-overlay\"]')")) {
      firstPickOverlay = true;
    }
    if (await session.evaluate("!!document.querySelector('[data-testid=\"current-weather\"]')")) {
      firstPickLoaded = true;
      break;
    }
    await sleep(150);
  }
  check("[需求] 首次选城：出现 loading（骨架）", firstPickSkeleton);
  check("首次选城：无旧内容时不套遮罩（用骨架）", !firstPickOverlay);
  check("首次选城：限速下最终拿到数据", firstPickLoaded);
  await session.send("Network.emulateNetworkConditions", {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });

  // ================= L. 香港：不是首都，且只出现一条 ==================
  // GeoNames tags 香港 as PPLC (seat of the Hong Kong political entity), but
  // it is not a national capital; and it lists the same place twice (PPLC +
  // PCLS, identical population). Both must be handled.
  await session.send("Page.navigate", { url: BASE + "/" });
  await session.waitFor(HYD);
  await session.evaluate("document.querySelector('#location-search').focus()");
  await session.typeInto("#location-search", "香港");
  const hkReady = await session.waitFor(
    "document.querySelectorAll('[data-testid=\"location-option\"]').length >= 1",
  );
  const hkOptions = await session.evaluate(
    "Array.from(document.querySelectorAll('[data-testid=\"location-option\"]')).map(el => el.innerText.replace(/\\n/g, ' | '))",
  );
  check("香港：能搜到", hkReady && hkOptions.length >= 1, `n=${hkOptions.length}`);
  check("香港：不被标成「首都」", !hkOptions.some((t) => /首都/.test(t)), hkOptions.join(" || "));
  check("香港：同一地点去重为一条", hkOptions.length === 1, `n=${hkOptions.length}`);
  await session.shot("18-hongkong");

  // Multi-word English names are not matched without their space.
  await session.send("Page.navigate", { url: BASE + "/" });
  await session.waitFor(HYD);
  await session.evaluate("document.querySelector('#location-search').focus()");
  await session.typeInto("#location-search", "hongkong");
  const hkEnReady = await session.waitFor(
    "document.querySelectorAll('[data-testid=\"location-option\"]').length >= 1",
  );
  const hkEnOptions = await session.evaluate(
    "Array.from(document.querySelectorAll('[data-testid=\"location-option\"]')).map(el => el.innerText.replace(/\\n/g, ' | '))",
  );
  check(
    "hongkong（无空格）也能搜到香港",
    hkEnReady && hkEnOptions.some((t) => /香港/.test(t)),
    hkEnOptions[0] ?? "<none>",
  );

  // ================= M. 国家 / 地区不是「城市」 ========================
  // 英国 comes back as `PCLI` ("independent political entity") with 66M
  // inhabitants; a population-based heuristic happily called that a 城市.
  // 澳门 (PPLC + PCLS) and 新加坡 (PPLC + PCLI) are the same double
  // registration as 香港, but with coordinates *and* populations that differ,
  // so they exercise the entity-twin merge rather than the id keys.
  const labelCases = [
    { q: "英国", expect: "国家", sample: "19-uk-country" },
    { q: "澳门", expect: "地区" },
    { q: "新加坡", expect: "国家" },
  ];
  for (const testCase of labelCases) {
    await session.send("Page.navigate", { url: BASE + "/" });
    await session.waitFor(HYD);
    await session.evaluate("document.querySelector('#location-search').focus()");
    await session.typeInto("#location-search", testCase.q);
    await session.waitFor(
      "document.querySelectorAll('[data-testid=\"location-option\"]').length >= 1",
    );
    const texts = await session.evaluate(
      "Array.from(document.querySelectorAll('[data-testid=\"location-option\"]')).map(el => el.innerText.replace(/\\n/g, ' | '))",
    );
    const joined = texts.join(" || ");
    // Only the rows whose *own* name matches count — 新加坡 legitimately has a
    // second entry (新加坡樟宜机场) and it must survive the merge.
    const sameName = texts
      .map((t) => t.split(" | ")[0].trim())
      .filter((name) => name === testCase.q);
    check(
      `${testCase.q}：标注为「${testCase.expect}」而不是「城市」`,
      texts.some((t) => t.includes(testCase.expect)) && !texts.some((t) => t.includes("城市")),
      joined,
    );
    check(`${testCase.q}：同名条目合并为一条`, sameName.length === 1, `matched=${sameName.length} of ${texts.length}`);
    // The tag literally says "same name", so an entry with a different name
    // must never carry it — 新加坡樟宜机场 used to, purely because it has no
    // population to compare with.
    const wronglyTagged = texts.some(
      (t) => t.includes("同名小地名") && t.split(" | ")[0].trim() !== testCase.q,
    );
    check(`${testCase.q}：不同名的条目不会被打上「同名小地名」`, !wronglyTagged, joined);
    if (testCase.sample) await session.shot(testCase.sample);
  }

  // ================= N. 搜索 loading 在输入框内且醒目 =================
  // The old indicator was faint grey text that only appeared once the request
  // had actually started (i.e. after the 300ms debounce). It must now be a
  // visible chip *inside* the field, present from the first keystroke.
  await session.send("Page.navigate", { url: BASE + "/" });
  await session.waitFor(HYD);
  await session.evaluate("document.querySelector('#location-search').focus()");
  await session.send("Network.emulateNetworkConditions", {
    offline: false, latency: 2500, downloadThroughput: 80 * 1024, uploadThroughput: 80 * 1024,
  });
  await session.typeInto("#location-search", "深圳");

  // Deliberately shorter than the 300ms debounce: the chip has to be there
  // before the request even starts.
  const loadingAppearedImmediately = await session.waitFor(
    "document.querySelector('[data-testid=\"search-fetch-status\"]')",
    { timeout: 250, interval: 20 },
  );
  check("搜索 loading：第一次按键就出现（不等 300ms debounce）", loadingAppearedImmediately);

  const loading = await session.evaluate(`(() => {
    const el = document.querySelector('[data-testid="search-fetch-status"]');
    if (!el) return { found: false };
    const input = document.querySelector('#location-search');
    const box = el.getBoundingClientRect();
    const field = input.getBoundingClientRect();
    const svg = el.querySelector('svg');
    const icon = svg ? svg.getBoundingClientRect() : null;
    const style = getComputedStyle(el);
    return {
      found: true,
      text: el.innerText.trim(),
      insideInput:
        box.top >= field.top - 1 && box.bottom <= field.bottom + 1 &&
        box.left >= field.left - 1 && box.right <= field.right - 1,
      hasSpinner: !!svg,
      spinnerSize: icon ? Math.round(Math.min(icon.width, icon.height)) : 0,
      background: style.backgroundColor,
      hasBackground: !/rgba\\(0, 0, 0, 0\\)|transparent/.test(style.backgroundColor),
    };
  })()`);

  check("搜索 loading：渲染在输入框内部", loading.insideInput === true, JSON.stringify(loading));
  check(
    "搜索 loading：是带动画的 spinner（不是灰字）",
    loading.hasSpinner === true && loading.spinnerSize >= 12,
    `size=${loading.spinnerSize}px`,
  );
  check("搜索 loading：有可见底色（足够显眼）", loading.hasBackground === true, String(loading.background));
  check("搜索 loading：文案为「搜索中」", /搜索中/.test(loading.text ?? ""), String(loading.text));
  if (loading.found) await session.shot("20-search-loading");

  const loadingGone = await session.waitFor(
    "!document.querySelector('[data-testid=\"search-fetch-status\"]')",
    { timeout: 25000 },
  );
  check("搜索 loading：拿到结果后自动消失", loadingGone);

  await session.send("Network.emulateNetworkConditions", {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });

  try {
    await httpJson(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
  } catch {
    /* tab may already be closing */
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
})().catch((e) => {
  console.error("FATAL", e);
  process.exitCode = 1;
});
