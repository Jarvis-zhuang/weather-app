import type { GeoLocation } from "./types";

/**
 * Search results are fed by GeoNames, where the same name often exists as a
 * capital, a city and a tiny village ("北京" in 北京市 / 重庆市 / 四川).
 * The provider already tells us which is which via `feature_code` and
 * `population` — this module turns that into something a human can rank.
 */

const FEATURE_LABELS: Record<string, string> = {
  PPLC: "首都",
  PPLA: "省级行政中心",
  PPLA2: "地区行政中心",
  PPLA3: "县级行政中心",
  PPLA4: "乡镇行政中心",
  PPLA5: "行政中心",
  // A bare `PPL` is just "a populated place" — in practice these are the
  // village-level namesakes that confuse users, so say so explicitly.
  PPL: "村镇级居民点",
  PPLX: "城区",
  PPLL: "村落",
  PPLQ: "废弃居民点",
  PPLS: "居民点群",
  ADM1: "一级行政区",
  ADM2: "二级行政区",
  ADM3: "三级行政区",
  ADM4: "四级行政区",
};

/**
 * GeoNames tags e.g. 深圳 as `PPLA2` ("seat of a second-order division"),
 * which is technically true but useless to a user. Anything with a real
 * population is what people mean by "city".
 */
const CITY_POPULATION_THRESHOLD = 500_000;

/**
 * Feature class P ("country, state, region") codes describe a political entity
 * *itself*, not a populated place. This matters because the population
 * heuristic below has no idea what it is looking at: 英国 comes back as `PCLI`
 * with 66M inhabitants and would be filed under "城市" — the exact bug where
 * searching a country tells the user they picked a city.
 *
 * So entity codes are checked *first*, before population gets a vote.
 */
const ENTITY_LABELS: Record<string, string> = {
  PCLI: "国家",
  PCLS: "地区",
  PCLD: "属地",
  PCLF: "自由联合邦",
  PCLIX: "政治实体分区",
  PCL: "政治实体",
  TERR: "属地",
  LTER: "租借地",
};

/**
 * Which provider codes mark a record as a political entity rather than a
 * settlement. Ordered by how well the record describes the entity itself:
 * an independent state (`PCLI`) beats a semi-independent one (`PCLS`), and both
 * beat the entity's *seat* (`PPLC`).
 *
 * Needed because GeoNames registers the same territory twice — 香港 arrives as
 * both `PPLC` (its seat) and `PCLS` (the entity), 新加坡 as `PPLC` + `PCLI` —
 * at slightly different coordinates. `politicalEntityRank` lets the dedupe in
 * `weather-source.ts` collapse those into one row and keep the record that
 * actually describes what the place *is*.
 */
export const POLITICAL_ENTITY_CODES = [
  "PCLI",
  "PCLS",
  "PCLD",
  "PCLF",
  "TERR",
  "LTER",
  "PCL",
  "PCLIX",
  "PPLC",
] as const;

/** Lower is a better description of the entity; -1 means "not a political entity". */
export function politicalEntityRank(location: GeoLocation): number {
  if (!location.featureCode) return -1;
  return POLITICAL_ENTITY_CODES.indexOf(
    location.featureCode as (typeof POLITICAL_ENTITY_CODES)[number],
  );
}

export function describePlaceType(location: GeoLocation): string | null {
  // ① What a place *is* outranks how many people live in it.
  const entity = location.featureCode ? ENTITY_LABELS[location.featureCode] : undefined;
  if (entity) return entity;
  // ② "首都" is only meaningful relative to a *country*. GeoNames also tags the
  // seats of non-sovereign entities as PPLC (香港 / 澳门 are PPLC in its data),
  // and calling those a national capital is simply wrong — so require the
  // provider to actually give us a country before using the label.
  if (location.featureCode === "PPLC" && location.country) return "首都";
  // ③ Only settlements are left, and for those population is a good proxy.
  if ((location.population ?? 0) >= CITY_POPULATION_THRESHOLD) return "城市";
  return location.featureCode ? FEATURE_LABELS[location.featureCode] ?? null : null;
}

export function formatPopulation(value?: number): string | null {
  if (!value || value <= 0) return null;
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)} 亿人`;
  if (value >= 10_000) return `${Math.round(value / 10_000)} 万人`;
  return `${value} 人`;
}

/** One line that lets the user tell same-named places apart at a glance. */
export function describeLocationSubtitle(location: GeoLocation): string {
  // Searching "英国" returns the country itself, where `country` is also
  // "英国" — repeating it makes the row read "英国 / 英国 · 国家 · 6649 万人".
  // Drop the country whenever it only restates the name.
  const country = location.country !== location.name ? location.country : "";
  return [
    country,
    location.admin1,
    describePlaceType(location),
    formatPopulation(location.population),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/** Highest population in the result set — used to flag namesake villages. */
export function topPopulation(locations: GeoLocation[]): number {
  return locations.reduce((max, item) => Math.max(max, item.population ?? 0), 0);
}

/**
 * "北京" in 四川 is a real place, but next to the capital it is ambiguous.
 * Only flag it when a better-known namesake is actually in the list, otherwise
 * searching for that village alone would get a pointless warning.
 *
 * The label says "同名" (same name), so it must only fire when the entry
 * actually carries the name the user typed. Comparing against the top result's
 * name instead would look right for 北京 but break for 东京, whose top result
 * is stored in traditional characters (東京) — and it would wrongly tag
 * 新加坡樟宜机场, a *different* name that simply has no population.
 */
export function isMinorNamesake(
  location: GeoLocation,
  query: string,
  topPopulation: number,
): boolean {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return false;
  if (location.name.trim().toLowerCase() !== keyword) return false;
  return (location.population ?? 0) < topPopulation;
}

const FEATURE_RANK: Record<string, number> = {
  PPLC: 0,
  PPLA: 1,
  PPLA2: 2,
  PPLA3: 3,
  PPLA4: 4,
  PPLA5: 5,
  PPLX: 6,
  PPL: 7,
  PPLS: 8,
  PPLL: 9,
  PPLQ: 10,
};

function rankOf(location: GeoLocation): number {
  const rank = location.featureCode ? FEATURE_RANK[location.featureCode] : undefined;
  return rank ?? 11;
}

/**
 * Most relevant first: bigger population wins, then the more significant
 * feature class. `Array.prototype.sort` is stable, so the provider's own
 * ordering is preserved between equal entries.
 */
export function byRelevance(a: GeoLocation, b: GeoLocation): number {
  const populationDiff = (b.population ?? 0) - (a.population ?? 0);
  if (populationDiff !== 0) return populationDiff;
  return rankOf(a) - rankOf(b);
}
