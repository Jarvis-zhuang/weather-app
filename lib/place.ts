import type { GeoLocation, Place } from "./types";

/**
 * The selected place lives in the URL, not in React state.
 * That single decision buys us: shareable links, working back/forward buttons,
 * refresh-safe screens, and server rendering of the exact same view.
 */
export const PLACE_QUERY_KEYS = {
  latitude: "lat",
  longitude: "lon",
  name: "name",
  country: "country",
  timezone: "tz",
} as const;

type ParamReader = (key: string) => string | string[] | null | undefined;

function readString(read: ParamReader, key: string): string {
  const value = read(key);
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function readNumber(read: ParamReader, key: string): number | null {
  const parsed = Number.parseFloat(readString(read, key));
  return Number.isFinite(parsed) ? parsed : null;
}

export function placeFromParams(read: ParamReader): Place | null {
  const latitude = readNumber(read, PLACE_QUERY_KEYS.latitude);
  const longitude = readNumber(read, PLACE_QUERY_KEYS.longitude);
  const name = readString(read, PLACE_QUERY_KEYS.name);
  if (latitude === null || longitude === null || !name) return null;

  return {
    latitude,
    longitude,
    name,
    country: readString(read, PLACE_QUERY_KEYS.country),
    timezone: readString(read, PLACE_QUERY_KEYS.timezone) || "auto",
  };
}

export function placeToSearchParams(place: Place): URLSearchParams {
  const params = new URLSearchParams();
  params.set(PLACE_QUERY_KEYS.latitude, String(place.latitude));
  params.set(PLACE_QUERY_KEYS.longitude, String(place.longitude));
  params.set(PLACE_QUERY_KEYS.name, place.name);
  if (place.country) params.set(PLACE_QUERY_KEYS.country, place.country);
  params.set(PLACE_QUERY_KEYS.timezone, place.timezone || "auto");
  return params;
}

export function placeFromSearchParams(params: URLSearchParams): Place | null {
  return placeFromParams((key) => params.get(key));
}

export function toPlace(location: GeoLocation): Place {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    name: location.name,
    country: location.country,
    timezone: location.timezone,
  };
}

/** A stable React key for a search result (Open-Meteo ids are not guaranteed). */
export function locationKey(location: GeoLocation): string {
  return `${location.name}-${location.latitude}-${location.longitude}`;
}
