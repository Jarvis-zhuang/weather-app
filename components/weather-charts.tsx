"use client";

import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";

import { useEChart } from "@/hooks/use-echarts";
import {
  buildDailyTemperatureOption,
  buildHourlyTemperatureOption,
  buildPrecipitationOption,
} from "@/lib/charts";
import type { WeatherPayload } from "@/lib/types";

type TabKey = "hourly" | "daily" | "rain";

const TABS: { key: TabKey; label: string }[] = [
  { key: "hourly", label: "未来 24 小时" },
  { key: "daily", label: "7 天温度" },
  { key: "rain", label: "降水量" },
];

function Chart({ option }: { option: EChartsOption }) {
  const containerRef = useEChart(option);
  // ECharts needs a sized DOM node; the height is fixed so init never sees 0px.
  // Shorter on phones so the chart and the forecast list fit one screen.
  return <div ref={containerRef} className="h-56 w-full sm:h-64" />;
}

export function WeatherCharts({ data }: { data: WeatherPayload }) {
  const [tab, setTab] = useState<TabKey>("hourly");
  /**
   * Bumped on every tab change and used as a React `key` on the veil below.
   * Remounting that single element restarts its CSS fade — a crossfade that
   * costs nothing and, crucially, does *not* touch the chart instance.
   * (Keying the chart itself, as we did before, forced a full re-init and
   * threw away ECharts' own transition.)
   */
  const [swapCount, setSwapCount] = useState(0);

  const options = useMemo(
    () => ({
      hourly: buildHourlyTemperatureOption(data.hourly, data.units),
      daily: buildDailyTemperatureOption(data.daily, data.units),
      rain: buildPrecipitationOption(data.daily, data.units),
    }),
    [data],
  );

  function selectTab(next: TabKey) {
    if (next === tab) return;
    setTab(next);
    setSwapCount((value) => value + 1);
  }

  const hasData =
    (tab === "rain" || tab === "daily" ? data.daily.length : data.hourly.length) > 0;

  return (
    <section
      data-testid="weather-charts"
      className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">趋势图</h2>
        <div
          role="tablist"
          aria-label="天气趋势图切换"
          className="flex gap-1 rounded-xl bg-slate-100 p-1"
        >
          {TABS.map((item) => {
            const active = item.key === tab;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                id={`chart-tab-${item.key}`}
                aria-selected={active}
                aria-controls="weather-chart-panel"
                data-testid={`chart-tab-${item.key}`}
                onClick={() => selectTab(item.key)}
                className={`min-h-[38px] rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200 ease-out ${
                  active
                    ? "bg-white text-sky-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700 active:scale-95"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {hasData ? (
        <div
          id="weather-chart-panel"
          role="tabpanel"
          aria-labelledby={`chart-tab-${tab}`}
          className="relative mt-4"
        >
          {/* Keyed by swapCount → the fade replays on every tab switch. Kept
              light (0.4 → 0) so it softens the swap without hiding the
              ECharts draw-in animation happening underneath. */}
          <div
            key={swapCount}
            aria-hidden
            className="chart-swap-veil pointer-events-none absolute inset-0 z-10 rounded-lg bg-white"
          />
          <Chart option={options[tab]} />
        </div>
      ) : (
        <p className="mt-4 h-64 text-sm text-slate-400">暂无趋势数据</p>
      )}
    </section>
  );
}
