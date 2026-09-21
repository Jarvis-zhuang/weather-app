import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { Suspense } from "react";

import { WeatherDashboard } from "@/components/weather-dashboard";
import { WeatherSkeleton } from "@/components/states";
import { placeFromParams } from "@/lib/place";
import { makeQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { getWeather } from "@/lib/weather-source";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Server component: turns the URL into data before the browser does any work.
 * The prefetched cache is handed to React Query via HydrationBoundary, so the
 * first paint already shows real weather instead of a spinner.
 */
export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const place = placeFromParams((key) => params[key]);
  const queryClient = makeQueryClient();

  if (place) {
    // Best effort: if the upstream is down we still render the shell and let
    // the client retry, instead of failing the whole page.
    await queryClient
      .prefetchQuery({
        queryKey: queryKeys.weather(place),
        queryFn: () => getWeather(place),
      })
      .catch(() => undefined);
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          天气查询
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          搜索城市，查看当前天气状况与未来 7 天预报。
        </p>
      </header>

      <HydrationBoundary state={dehydrate(queryClient)}>
        {/* useSearchParams needs a Suspense boundary during static rendering. */}
        <Suspense fallback={<WeatherSkeleton />}>
          <WeatherDashboard />
        </Suspense>
      </HydrationBoundary>

      <footer className="mt-12 text-center text-xs text-slate-400">
        数据来源{" "}
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-slate-600"
        >
          Open-Meteo
        </a>
        （免费开放天气 API，无需 API Key）
      </footer>
    </main>
  );
}
