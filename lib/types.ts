/**
 * Domain types shared by the server (data source), the route handlers (API
 * contract) and the client (UI). Keeping them in one place is what makes the
 * three layers safe to change independently.
 */

/** A place returned by the geocoding search. */
export interface GeoLocation {
  /** Not every provider returns a stable id, so it is optional. */
  id?: number;
  name: string;
  country: string;
  /** First-level administrative division (state / province). Optional. */
  admin1?: string;
  /**
   * GeoNames feature class (PPLC = capital, PPL = populated place, …).
   * Used to tell same-named places apart and to rank search results.
   */
  featureCode?: string;
  population?: number;
  latitude: number;
  longitude: number;
  timezone: string;
}

/** The minimal identity of a place, as encoded in the URL query string. */
export interface Place {
  latitude: number;
  longitude: number;
  name: string;
  country: string;
  timezone: string;
}

export interface CurrentWeather {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  isDay: boolean;
  /** Local time of the observation, `YYYY-MM-DDTHH:mm`. */
  observedAt: string;
}

export interface DailyForecast {
  /** `YYYY-MM-DD` */
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipitation: number;
}

export interface HourlyPoint {
  /** `YYYY-MM-DDTHH:mm`, local time of the place. */
  time: string;
  temperature: number;
  /** "Feels like" temperature — shown alongside the actual temperature. */
  apparentTemperature: number;
  precipitationProbability: number;
}

export interface WeatherUnits {
  temperature: string;
  windSpeed: string;
  precipitation: string;
}

export interface WeatherPayload {
  place: Place;
  current: CurrentWeather;
  daily: DailyForecast[];
  /** Next 24 hours, already sliced on the server — the client gets 24, not 168. */
  hourly: HourlyPoint[];
  units: WeatherUnits;
  /**
   * The place's offset from UTC, in seconds, as reported by the provider.
   * Kept as a plain number so the UI can show a friendly "UTC+8" instead of
   * the raw IANA id ("Asia/Shanghai") — and deterministic across SSR/hydration.
   */
  utcOffsetSeconds?: number;
}

/**
 * Every API response is a discriminated union instead of "throw / null".
 * The client never has to guess what an empty body means.
 */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiErrorBody };

export interface ApiErrorBody {
  code: ApiErrorCode;
  /** Human readable, safe to render directly in the UI. */
  message: string;
}

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "UPSTREAM"
  | "RATE_LIMITED"
  | "NETWORK"
  | "UNKNOWN";
