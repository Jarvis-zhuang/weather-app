import type { Place } from "./types";

/**
 * Query keys are centralised so prefetching on the server and reading on the
 * client can never drift apart (a classic hydration bug source).
 */
export const queryKeys = {
  locations: (query: string) => ["locations", query.trim().toLowerCase()] as const,
  weather: (place: Place | null) =>
    ["weather", place?.latitude ?? null, place?.longitude ?? null] as const,
};
