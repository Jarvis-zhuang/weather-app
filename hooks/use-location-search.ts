"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { GeoLocation } from "@/lib/types";

export const MIN_QUERY_LENGTH = 2;

/** Debounced by the caller; only fires for queries worth searching. */
export function useLocationSearch(query: string) {
  const keyword = query.trim();
  const enabled = keyword.length >= MIN_QUERY_LENGTH;

  return useQuery<GeoLocation[]>({
    queryKey: queryKeys.locations(keyword),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ name: keyword });
      return apiGet<GeoLocation[]>("/api/geocode", params, signal);
    },
  });
}
