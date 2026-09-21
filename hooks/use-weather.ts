"use client";

import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import { placeToSearchParams } from "@/lib/place";
import { queryKeys } from "@/lib/query-keys";
import type { Place, WeatherPayload } from "@/lib/types";

/**
 * Server state (the weather itself) is owned by React Query: it gives us
 * loading / error / refetch / cache / request cancellation for free instead of
 * a hand-rolled useEffect + 3 useState combo.
 */
export function useWeather(place: Place | null) {
  return useQuery<WeatherPayload>({
    queryKey: queryKeys.weather(place),
    enabled: place !== null,
    queryFn: ({ signal }) =>
      apiGet<WeatherPayload>("/api/weather", placeToSearchParams(place!), signal),
  });
}
