/**
 * Data source layer: the ONLY place that knows we talk to Open-Meteo.
 *
 * Everything here runs on the server (route handlers / server components).
 * Swapping the provider means rewriting this file and nothing else.
 */
import { AppError, badRequest, notFound, rateLimited, upstream } from "./errors";
import { byRelevance, politicalEntityRank } from "./geo";
import type {
  CurrentWeather,
  DailyForecast,
  GeoLocation,
  HourlyPoint,
  Place,
  WeatherPayload,
} from "./types";

const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const REQUEST_TIMEOUT_MS = 8_000;
const FORECAST_DAYS = 7;

async function fetchUpstream(url: URL): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      // Revalidated by the route handler cache; upstream responses are public.
      cache: "no-store",
    });

    if (response.status === 429) {
      throw rateLimited("天气服务请求过于频繁，请稍后再试。");
    }
    // A 4xx from the provider means *we* sent something it refuses (usually
    // out-of-range coordinates); surfacing it as 502 would hide a client bug.
    if (response.status >= 400 && response.status < 500) {
      throw badRequest("天气服务拒绝了本次请求，请检查地点参数。", response.status);
    }
    if (!response.ok) {
      throw upstream("天气服务暂时不可用，请稍后再试。");
    }

    return await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw upstream("天气服务响应超时，请稍后再试。");
    }
    throw new AppError("NETWORK", "无法连接天气服务，请检查网络后重试。", 503);
  } finally {
    clearTimeout(timer);
  }
}

// --- small, defensive parsing helpers ---------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// --- geocoding --------------------------------------------------------------

function toGeoLocation(raw: unknown): GeoLocation | null {
  const record = asRecord(raw);
  const latitude = asFiniteNumber(record.latitude);
  const longitude = asFiniteNumber(record.longitude);
  const name = typeof record.name === "string" ? record.name : "";
  if (latitude === null || longitude === null || !name) return null;

  const id = asFiniteNumber(record.id);
  const population = asFiniteNumber(record.population);
  return {
    ...(id === null ? {} : { id }),
    name,
    country: typeof record.country === "string" ? record.country : "",
    admin1: typeof record.admin1 === "string" ? record.admin1 : undefined,
    featureCode:
      typeof record.feature_code === "string" ? record.feature_code : undefined,
    ...(population === null ? {} : { population }),
    latitude,
    longitude,
    timezone:
      typeof record.timezone === "string" ? record.timezone : "auto",
  };
}

/**
 * Curated query aliases for two quirks of Open-Meteo's geocoder. Both are
 * "the user typed something reasonable, the provider won't match it" cases, so
 * we *expand* the query — the original term is always searched too, nothing is
 * filtered out on the user's behalf.
 *
 * 1. `language=zh` matches the *stored* Chinese local name, which is not
 *    consistently simplified: the Japanese capital is stored as "東京"
 *    (traditional), Osaka as "大阪市", Seoul as "首尔特别市". Typing the
 *    simplified form a user expects ("东京" / "大阪" / "首尔") misses the
 *    capital entirely. (Verified live: `name=东京` → two Chinese PPL villages;
 *    `name=東京` → 東京/日本/PPLC.)
 * 2. Multi-word names are not matched without their space: `hongkong`,
 *    `newyork`, `losangeles` all return nothing (or an unrelated namesake).
 *
 * Keys are matched case-insensitively. Extend the map as more cases surface.
 */
const GEOCODING_ALIASES: Record<string, string[]> = {
  东京: ["東京"],
  纽约: ["紐約市", "紐約"],
  大阪: ["大阪市"],
  首尔: ["首尔特别市", "首爾"],
  伦敦: ["倫敦"],
  hongkong: ["Hong Kong"],
  newyork: ["New York"],
  losangeles: ["Los Angeles"],
  sanfrancisco: ["San Francisco"],
};

function geocodeUrl(keyword: string, limit: number): URL {
  const url = new URL(GEOCODING_ENDPOINT);
  url.searchParams.set("name", keyword);
  url.searchParams.set("count", String(limit));
  url.searchParams.set("language", "zh");
  url.searchParams.set("format", "json");
  return url;
}

async function fetchGeoLocations(keyword: string, limit: number): Promise<GeoLocation[]> {
  const json = asRecord(await fetchUpstream(geocodeUrl(keyword, limit)));
  return asArray(json.results)
    .map(toGeoLocation)
    .filter((item): item is GeoLocation => item !== null);
}

/**
 * How far apart two registrations of the *same* territory may sit and still be
 * treated as one place. GeoNames stores 香港 as `PPLC` (22.278/114.175) and
 * `PCLS` (22.250/114.167) — 3 km apart; 澳门 differs by ~5 km. 0.5° (~55 km) is
 * far more than that, yet still far less than the distance to a genuine
 * namesake (the 5-person "Hong Kong" village in Mexico is 29° away).
 */
const ENTITY_TWIN_MAX_DEGREES = 0.5;

/**
 * GeoNames registers a territory *twice*: once as the political entity
 * (`PCLI` = independent state, `PCLS` = semi-independent, 香港 / 澳门 / 新加坡
 * all do this) and once as its seat (`PPLC`), under different ids, slightly
 * different coordinates and sometimes slightly different populations — so the
 * id/name-based keys in `locationKeys` cannot see that they are the same place.
 *
 * This pass merges exactly that pair, and only that pair: both records must be
 * political-entity codes, share a name and a country, and sit within
 * `ENTITY_TWIN_MAX_DEGREES`. Ordinary settlements are never touched, so two
 * genuinely different villages with the same name stay separate.
 */
function collapseEntityTwins(locations: GeoLocation[]): GeoLocation[] {
  const out: GeoLocation[] = [];

  for (const item of locations) {
    const index = out.findIndex((kept) => isEntityTwin(kept, item));
    if (index === -1) {
      out.push(item);
      continue;
    }
    // Keep the record that describes the entity itself: 国家 / 地区 beats 首都.
    if (politicalEntityRank(item) < politicalEntityRank(out[index])) out[index] = item;
  }

  return out;
}

function isEntityTwin(a: GeoLocation, b: GeoLocation): boolean {
  const rankA = politicalEntityRank(a);
  if (rankA < 0 || politicalEntityRank(b) < 0) return false;
  if (a.name.trim().toLowerCase() !== b.name.trim().toLowerCase()) return false;
  if (a.country.trim().toLowerCase() !== b.country.trim().toLowerCase()) return false;
  return (
    Math.abs(a.latitude - b.latitude) <= ENTITY_TWIN_MAX_DEGREES &&
    Math.abs(a.longitude - b.longitude) <= ENTITY_TWIN_MAX_DEGREES
  );
}

/** Drop duplicates that arrive through more than one query variant or record. */
function dedupeLocations(locations: GeoLocation[]): GeoLocation[] {
  const seen = new Set<string>();
  const out: GeoLocation[] = [];
  for (const item of locations) {
    const keys = locationKeys(item);
    if (keys.some((key) => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Identity keys for de-duplication. A single place can arrive twice under
 * *different* provider ids: GeoNames lists 香港 both as a capital (`PPLC`,
 * 22.278/114.175) and as its own political entity (`PCLS`, 22.250/114.167), so
 * matching on id alone would show the user the same city twice. Name +
 * population is a very strong fingerprint, name + coordinates covers records
 * without a population.
 */
function locationKeys(item: GeoLocation): string[] {
  const name = item.name.trim().toLowerCase();
  const country = item.country.trim().toLowerCase();
  const keys = [
    `n:${name}|${country}|${item.latitude.toFixed(2)}|${item.longitude.toFixed(2)}`,
  ];
  if (item.id !== undefined) keys.push(`i:${item.id}`);
  if (item.population && item.population > 0) {
    keys.push(`p:${name}|${country}|${item.population}`);
  }
  return keys;
}

export async function searchLocations(query: string, limit = 6): Promise<GeoLocation[]> {
  const keyword = query.trim();
  if (!keyword) throw badRequest("请输入地点名称。");

  // The typed term plus any curated aliases (matched case-insensitively, so
  // "HongKong" / "hongkong" both hit the same entry).
  const variants = new Set<string>([keyword]);
  for (const alias of GEOCODING_ALIASES[keyword.toLowerCase()] ?? []) variants.add(alias);

  const settled = await Promise.allSettled(
    [...variants].map((term) => fetchGeoLocations(term, limit)),
  );
  const merged = settled
    .filter(
      (result): result is PromiseFulfilledResult<GeoLocation[]> =>
        result.status === "fulfilled",
    )
    .flatMap((result) => result.value);

  // "北京" exists as a capital, a village in 重庆 and a village in 四川;
  // rank by population / feature class so the capital is never buried.
  // Entity twins are collapsed first: they are the *same* place, so the
  // surviving record should be chosen before ranking, not after.
  return dedupeLocations(collapseEntityTwins(merged)).sort(byRelevance).slice(0, limit);
}

// --- forecast ---------------------------------------------------------------

function assertPlace(place: Place): void {
  const { latitude, longitude } = place;
  if (asFiniteNumber(latitude) === null || asFiniteNumber(longitude) === null) {
    throw badRequest("缺少有效的经纬度。");
  }
}

function toCurrent(raw: unknown): CurrentWeather | null {
  const record = asRecord(raw);
  const temperature = asFiniteNumber(record.temperature_2m);
  if (temperature === null) return null;

  return {
    temperature,
    apparentTemperature: asFiniteNumber(record.apparent_temperature) ?? temperature,
    humidity: asFiniteNumber(record.relative_humidity_2m) ?? 0,
    windSpeed: asFiniteNumber(record.wind_speed_10m) ?? 0,
    weatherCode: asFiniteNumber(record.weather_code) ?? 0,
    isDay: record.is_day === 0 ? false : true,
    observedAt: typeof record.time === "string" ? record.time : "",
  };
}

function toDaily(raw: unknown): DailyForecast[] {
  const record = asRecord(raw);
  const dates = asArray(record.time);
  const codes = asArray(record.weather_code);
  const maxTemps = asArray(record.temperature_2m_max);
  const minTemps = asArray(record.temperature_2m_min);
  const precipitations = asArray(record.precipitation_sum);

  const days: DailyForecast[] = [];
  for (let i = 0; i < dates.length; i += 1) {
    const date = typeof dates[i] === "string" ? (dates[i] as string) : null;
    const tempMax = asFiniteNumber(maxTemps[i]);
    const tempMin = asFiniteNumber(minTemps[i]);
    if (!date || tempMax === null || tempMin === null) continue;

    days.push({
      date,
      weatherCode: asFiniteNumber(codes[i]) ?? 0,
      tempMax,
      tempMin,
      precipitation: asFiniteNumber(precipitations[i]) ?? 0,
    });
  }
  return days;
}

/**
 * The provider returns 7 × 24 hourly values; we only ever show the next 24.
 * Slicing here keeps the payload (and the client bundle work) small.
 */
const HOURLY_WINDOW = 24;

function toHourly(raw: unknown, fromTime: string): HourlyPoint[] {
  const record = asRecord(raw);
  const times = asArray(record.time);
  const temperatures = asArray(record.temperature_2m);
  const apparents = asArray(record.apparent_temperature);
  const probabilities = asArray(record.precipitation_probability);

  // Compare only up to the hour (`YYYY-MM-DDTHH`) so we start at the current
  // hour rather than the next one.
  const hourPrefix = fromTime.slice(0, 13);
  const found = times.findIndex(
    (value) => typeof value === "string" && value.slice(0, 13) >= hourPrefix,
  );
  const start = found < 0 ? 0 : found;

  const points: HourlyPoint[] = [];
  for (let i = start; i < times.length && points.length < HOURLY_WINDOW; i += 1) {
    const time = typeof times[i] === "string" ? (times[i] as string) : null;
    const temperature = asFiniteNumber(temperatures[i]);
    if (!time || temperature === null) continue;
    points.push({
      time,
      temperature,
      // Fall back to the actual temperature if the provider omits "feels like".
      apparentTemperature: asFiniteNumber(apparents[i]) ?? temperature,
      precipitationProbability: asFiniteNumber(probabilities[i]) ?? 0,
    });
  }
  return points;
}

export async function getWeather(place: Place): Promise<WeatherPayload> {
  assertPlace(place);

  const url = new URL(FORECAST_ENDPOINT);
  url.searchParams.set("latitude", String(place.latitude));
  url.searchParams.set("longitude", String(place.longitude));
  // Use the timezone resolved during geocoding so "today" means the same thing
  // on the server and in the browser.
  url.searchParams.set("timezone", place.timezone || "auto");
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day",
  );
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
  );
  url.searchParams.set(
    "hourly",
    "temperature_2m,apparent_temperature,precipitation_probability",
  );
  url.searchParams.set("forecast_days", String(FORECAST_DAYS));

  const json = asRecord(await fetchUpstream(url));
  const current = toCurrent(json.current);
  if (!current) throw notFound("未能获取该地点的天气数据。");

  const currentUnits = asRecord(json.current_units);
  const dailyUnits = asRecord(json.daily_units);
  // Provider-reported UTC offset (seconds). Lets the UI show "UTC+8" instead of
  // the raw IANA zone id ("Asia/Shanghai"); optional, so tolerate its absence.
  const utcOffset = asFiniteNumber(json.utc_offset_seconds);

  return {
    place,
    current,
    daily: toDaily(json.daily),
    hourly: toHourly(json.hourly, current.observedAt),
    units: {
      temperature:
        typeof currentUnits.temperature_2m === "string"
          ? currentUnits.temperature_2m
          : "°C",
      windSpeed:
        typeof currentUnits.wind_speed_10m === "string"
          ? currentUnits.wind_speed_10m
          : "km/h",
      precipitation:
        typeof dailyUnits.precipitation_sum === "string"
          ? dailyUnits.precipitation_sum
          : "mm",
    },
    ...(utcOffset === null ? {} : { utcOffsetSeconds: utcOffset }),
  };
}
