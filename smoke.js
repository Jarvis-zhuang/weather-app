// Smoke test: verifies the API contract and the SSR page end to end.
const BASE = process.env.BASE ?? "http://127.0.0.1:3100";

async function get(path) {
  const res = await fetch(BASE + path, { headers: { accept: "application/json" } });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, json, text };
}

function assert(cond, label, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? " :: " + extra : ""}`);
  if (!cond) process.exitCode = 1;
}

(async () => {
  // 1. home page renders (SSR)
  const home = await get("/");
  assert(home.status === 200, "GET / -> 200", String(home.status));
  assert(/天气/.test(home.text), "GET / contains app shell");

  // 2. geocoding
  const geo = await get("/api/geocode?name=" + encodeURIComponent("深圳"));
  assert(geo.status === 200 && geo.json?.ok === true, "GET /api/geocode ok");
  const first = geo.json?.data?.[0];
  assert(!!first && typeof first.latitude === "number", "geocode returns coordinates", JSON.stringify(first ?? {}).slice(0, 120));

  // 2b. same-named places must be ranked + carry the fields the UI needs
  const bj = await get("/api/geocode?name=" + encodeURIComponent("北京"));
  const list = bj.json?.data ?? [];
  assert(list.length >= 3, "geocode 北京 returns all candidates", `n=${list.length}`);
  assert(
    list[0]?.admin1 === "北京市" && list[0]?.featureCode === "PPLC",
    "capital ranks first",
    JSON.stringify({ admin1: list[0]?.admin1, feature: list[0]?.featureCode }),
  );
  assert((list[0]?.population ?? 0) > 10_000_000, "population is exposed", String(list[0]?.population));
  assert(
    (list[list.length - 1]?.population ?? 0) === 0,
    "population-less village sinks to the bottom",
    JSON.stringify({ admin1: list[list.length - 1]?.admin1, feature: list[list.length - 1]?.featureCode }),
  );

  // 2c. simplified-zh must surface the capital the user means.
  // Open-Meteo's zh dataset stores Tokyo as "東京", so plain "东京" used to
  // return only Chinese villages; the alias-expansion fix must recover 日本.
  const tk = await get("/api/geocode?name=" + encodeURIComponent("东京"));
  const tkList = tk.json?.data ?? [];
  assert(
    tkList.some((c) => c.country === "日本"),
    "geocode 东京 命中日本首都（zh 别名兜底）",
    `n=${tkList.length}`,
  );

  // 2d. multi-word English names are not matched without their space.
  const hkEn = await get("/api/geocode?name=hongkong");
  const hkEnList = hkEn.json?.data ?? [];
  assert(hkEnList.length > 0, "geocode hongkong 命中（无空格英文写法）", `n=${hkEnList.length}`);
  assert(/香港/.test(hkEnList[0]?.name ?? ""), "hongkong 首条是香港", String(hkEnList[0]?.name));

  // 2e. one place = one row: GeoNames returns 香港 as both a PPLC capital
  // record and a PCLS political-entity record (same population).
  const hkZh = await get("/api/geocode?name=" + encodeURIComponent("香港"));
  const hkZhList = hkZh.json?.data ?? [];
  assert(hkZhList.length === 1, "香港 去重为单条", `n=${hkZhList.length} ${JSON.stringify(hkZhList.map((c) => c.featureCode))}`);
  assert(
    hkZhList[0]?.featureCode === "PCLS",
    "香港 保留政治实体记录（PCLS，比 PPLC 更能说明它是什么）",
    String(hkZhList[0]?.featureCode),
  );

  // 2f. a country is a country, not a city. GeoNames returns 英国 as PCLI
  // ("independent political entity") with 66M inhabitants — the client-side
  // population heuristic must not be allowed to call that a 城市.
  const uk = await get("/api/geocode?name=" + encodeURIComponent("英国"));
  const ukList = uk.json?.data ?? [];
  assert(
    ukList.length === 1 && ukList[0]?.featureCode === "PCLI",
    "英国 返回独立政治实体记录（PCLI）",
    `n=${ukList.length} ${JSON.stringify(ukList.map((c) => c.featureCode))}`,
  );

  // 2g. the same double-registration show up for 澳门 (PPLC + PCLS) and
  // 新加坡 (PPLC + PCLI), where coordinates *and* populations differ slightly
  // — the id/name keys alone cannot merge them.
  const mo = await get("/api/geocode?name=" + encodeURIComponent("澳门"));
  const moList = mo.json?.data ?? [];
  assert(
    moList.length === 1 && moList[0]?.featureCode === "PCLS",
    "澳门 去重为单条（PCLS 胜出）",
    `n=${moList.length} ${JSON.stringify(moList.map((c) => c.featureCode))}`,
  );

  const sg = await get("/api/geocode?name=" + encodeURIComponent("新加坡"));
  const sgList = sg.json?.data ?? [];
  assert(
    sgList.filter((c) => c.name === "新加坡").length === 1,
    "新加坡 去重为单条（国家记录胜出，机场保留）",
    `n=${sgList.length} ${JSON.stringify(sgList.map((c) => c.featureCode))}`,
  );
  assert(
    sgList.some((c) => c.featureCode === "PCLI"),
    "新加坡 保留独立政治实体记录（PCLI）",
    JSON.stringify(sgList.map((c) => [c.name, c.featureCode])),
  );

  // 3. weather
  if (first) {
    const q = new URLSearchParams({
      lat: String(first.latitude),
      lon: String(first.longitude),
      name: first.name,
      country: first.country ?? "",
      tz: first.timezone ?? "auto",
    });
    const w = await get("/api/weather?" + q.toString());
    assert(w.status === 200 && w.json?.ok === true, "GET /api/weather ok");
    const payload = w.json?.data;
    assert(typeof payload?.current?.temperature === "number", "current.temperature is number", String(payload?.current?.temperature));
    assert(Array.isArray(payload?.daily) && payload.daily.length === 7, "daily has 7 entries", String(payload?.daily?.length));
    assert(
      Array.isArray(payload?.hourly) && payload.hourly.length === 24,
      "hourly is sliced to 24 points server-side",
      String(payload?.hourly?.length),
    );
    assert(
      typeof payload?.hourly?.[0]?.temperature === "number" &&
        typeof payload?.hourly?.[0]?.precipitationProbability === "number",
      "hourly point carries temperature + precipitation probability",
      JSON.stringify(payload?.hourly?.[0] ?? {}),
    );
    assert(
      typeof payload?.hourly?.[0]?.apparentTemperature === "number",
      "hourly point carries apparent (feels-like) temperature",
      String(payload?.hourly?.[0]?.apparentTemperature),
    );
    assert(typeof payload?.units?.temperature === "string", "units present", payload?.units?.temperature);

    // 4. SSR of a selected place: temperature should already be in the HTML
    const ssr = await get("/?" + q.toString());
    assert(ssr.status === 200, "GET /?place -> 200");
    const temp = Math.round(payload.current.temperature);
    assert(ssr.text.includes(String(temp)), "SSR html contains prefetched temperature", String(temp));
  }

  // 5. error contract
  const bad = await get("/api/weather");
  assert(bad.status === 400 && bad.json?.ok === false && bad.json.error?.code === "BAD_REQUEST", "missing params -> 400 BAD_REQUEST", JSON.stringify(bad.json?.error ?? {}));

  const emptyGeo = await get("/api/geocode?name=" + encodeURIComponent("   "));
  assert(emptyGeo.status === 400 && emptyGeo.json?.error?.code === "BAD_REQUEST", "blank keyword -> 400", JSON.stringify(emptyGeo.json?.error ?? {}));

  const unknown = await get("/api/weather?lat=91&lon=181&name=NA&tz=auto");
  assert(
    unknown.status === 400 && unknown.json?.ok === false && unknown.json.error?.code === "BAD_REQUEST",
    "invalid coords -> 400 BAD_REQUEST",
    `${unknown.status} ${unknown.json?.error?.code}`,
  );
})();
