"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  describeLocationSubtitle,
  isMinorNamesake,
  topPopulation as topPopulationOf,
} from "@/lib/geo";
import { MIN_QUERY_LENGTH, useLocationSearch } from "@/hooks/use-location-search";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { locationKey } from "@/lib/place";
import { Spinner } from "@/components/spinner";
import type { GeoLocation } from "@/lib/types";

/**
 * Pure input + result list. It does not navigate on its own: the parent owns
 * the transition, so the "switching city" state can be shown next to the
 * results it affects.
 */
export function LocationSearch({
  onSelectPlace,
  isSwitching,
}: {
  onSelectPlace: (location: GeoLocation) => void;
  isSwitching: boolean;
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebouncedValue(query, 300);
  const { data: locations, isFetching, isError } = useLocationSearch(debouncedQuery);

  const topPopulation = useMemo(
    () => topPopulationOf(locations ?? []),
    [locations],
  );

  const trimmedQuery = query.trim();
  // Between the keystroke and the debounce firing we are not *fetching* yet,
  // but we are already "searching" as far as the user is concerned. Without
  // this the input looked inert for 300ms before any feedback appeared.
  const isDebouncing =
    trimmedQuery.length >= MIN_QUERY_LENGTH && trimmedQuery !== debouncedQuery.trim();
  const isSearching =
    trimmedQuery.length >= MIN_QUERY_LENGTH && (isFetching || isDebouncing);

  const showList =
    isOpen && debouncedQuery.trim().length >= MIN_QUERY_LENGTH && !isError;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function selectLocation(location: GeoLocation) {
    setIsOpen(false);
    setQuery("");
    onSelectPlace(location);
  }

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor="location-search" className="sr-only">
        搜索地点
      </label>
      <div className="relative">
        <input
          id="location-search"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="搜索城市，例如：深圳 / Tokyo"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls="location-results"
          aria-busy={isSwitching || isSearching}
          className={`w-full rounded-xl border px-4 py-3 pr-32 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 ${
            isSwitching ? "border-sky-300 bg-sky-50/60" : "border-slate-300 bg-white"
          }`}
        />
        {/* Status chip lives *inside* the field, right where the user is
            looking. A faint grey "搜索中…" was too easy to miss, so it is now a
            tinted pill with an animated spinner — and the debounce window
            counts as searching, so it shows on the first keystroke. */}
        {isSwitching ? (
          <StatusChip testId="search-switch-status" label="切换中…" />
        ) : isSearching ? (
          <StatusChip testId="search-fetch-status" label="搜索中…" />
        ) : null}
      </div>

      {showList ? (
        <ul
          id="location-results"
          role="listbox"
          className="absolute z-10 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {locations && locations.length > 0 ? (
            locations.map((location) => (
              <li key={locationKey(location)} role="option" aria-selected={false}>
                <button
                  type="button"
                  data-testid="location-option"
                  disabled={isSwitching}
                  onMouseDown={(event) => {
                    // Keep focus in the input: blur-close would fire first.
                    event.preventDefault();
                    selectLocation(location);
                  }}
                  className="flex w-full flex-col items-start px-4 py-2 text-left transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="text-sm font-medium text-slate-800">
                    {location.name}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs text-slate-500">
                      {describeLocationSubtitle(location) || location.timezone}
                    </span>
                    {isMinorNamesake(location, debouncedQuery, topPopulation) ? (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200">
                        同名小地名
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li
              className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500"
              aria-live="polite"
            >
              {isSearching ? (
                <>
                  <Spinner className="h-4 w-4 text-sky-500" />
                  <span>搜索中…</span>
                </>
              ) : (
                "没有找到匹配的城市"
              )}
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Loading pill pinned inside the search field. `pointer-events-none` keeps it
 * from swallowing clicks on the native clear ("×") button next to it.
 */
function StatusChip({ testId, label }: { testId: string; label: string }) {
  return (
    <span
      data-testid={testId}
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 shadow-sm"
    >
      <Spinner className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
