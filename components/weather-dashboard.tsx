"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { useWeather } from "@/hooks/use-weather";
import { placeFromSearchParams, placeToSearchParams, toPlace } from "@/lib/place";
import type { GeoLocation } from "@/lib/types";
import { CurrentWeatherCard } from "@/components/current-weather-card";
import { ForecastList } from "@/components/forecast-list";
import { LocationSearch } from "@/components/location-search";
import { Spinner } from "@/components/spinner";
import { WeatherCharts } from "@/components/weather-charts";
import { EmptyState, ErrorPanel, WeatherSkeleton } from "@/components/states";

/**
 * The single client component that owns the page state.
 * The selected place is read from the URL (not from useState), so the server
 * and the client always agree on what is being displayed.
 */
export function WeatherDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  /**
   * Switching city is a *navigation*, not a local state change, so we wrap it
   * in a transition: React keeps the previous city on screen and `isSwitching`
   * stays true until the server payload for the new city has committed.
   * That is the honest "the new city is on its way" signal — no fake timers.
   */
  const [isSwitching, startTransition] = useTransition();
  /** Name of the city being loaded, only used for the overlay copy. */
  const [pendingName, setPendingName] = useState<string | null>(null);

  const place = useMemo(
    () => placeFromSearchParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const { data, isPending, isFetching, isError, error, refetch } = useWeather(place);

  const handleSelectPlace = useCallback(
    (location: GeoLocation) => {
      // Urgent update: the overlay must appear in the same frame as the tap,
      // even though the navigation itself is a low-priority transition.
      setPendingName(location.name);
      startTransition(() => {
        router.push(`/?${placeToSearchParams(toPlace(location)).toString()}`);
      });
    },
    [router],
  );

  useEffect(() => {
    if (!isSwitching) setPendingName(null);
  }, [isSwitching]);

  /**
   * Two ways a city can be "in flight":
   *  - a route transition (the usual path: the server re-renders with data);
   *  - a background refetch of an already-rendered place (cache miss / retry).
   * Both keep the old view mounted, so an overlay is the right affordance —
   * replacing the page with a skeleton would throw away readable content.
   */
  const isLoadingNewPlace =
    place !== null && (isSwitching || (isFetching && Boolean(data)));

  /**
   * First pick from the empty state. The overlay below exists to keep the
   * *previous* city readable while the new one loads — but here there is no
   * previous city, so it has nothing to sit on. Without this branch the user
   * would stare at the empty state with no feedback at all while the first
   * city loads; a skeleton is the honest placeholder for "content is coming".
   */
  const isFirstPickLoading = place === null && isSwitching;

  /**
   * Explicit branches instead of a nested ternary chain: each state is one
   * line, and adding a state (e.g. "offline") stays a one-line change.
   */
  function renderWeather() {
    if (isFirstPickLoading) return <WeatherSkeleton />;
    if (!place) return <EmptyState />;
    if (isPending) return <WeatherSkeleton />;
    if (isError) return <ErrorPanel error={error} onRetry={() => refetch()} />;
    if (!data) return null;

    return (
      <>
        <CurrentWeatherCard data={data} />
        <WeatherCharts data={data} />
        <ForecastList data={data} />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <LocationSearch onSelectPlace={handleSelectPlace} isSwitching={isSwitching} />

      <div className="relative space-y-6">
        {renderWeather()}

        {isLoadingNewPlace ? (
          <div
            data-testid="switching-overlay"
            role="status"
            aria-live="polite"
            className="absolute inset-0 z-20 flex items-start justify-center rounded-2xl bg-white/55 pt-24 backdrop-blur-[1px]"
          >
            <span className="flex items-center gap-2 rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-700 shadow-md">
              <Spinner />
              {pendingName
                ? `正在加载「${pendingName}」的天气…`
                : "正在更新天气数据…"}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
