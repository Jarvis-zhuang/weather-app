import { describeWeather } from "@/lib/weather-code";
import {
  formatLocationName,
  formatObservedAt,
  formatTemperature,
  formatUtcOffset,
} from "@/lib/format";
import type { WeatherPayload } from "@/lib/types";

/** Presentational only: no fetching, no state — easy to test and reuse. */
export function CurrentWeatherCard({ data }: { data: WeatherPayload }) {
  const { current, units, place } = data;
  const weather = describeWeather(current.weatherCode, current.isDay);
  // "UTC+8", not the raw "Asia/Shanghai" — the id is developer-speak.
  const utcOffset = formatUtcOffset(data.utcOffsetSeconds);

  const metrics = [
    { label: "体感温度", value: formatTemperature(current.apparentTemperature, units.temperature) },
    { label: "相对湿度", value: `${Math.round(current.humidity)}%` },
    { label: "风速", value: `${Math.round(current.windSpeed)} ${units.windSpeed}` },
  ];

  return (
    <section
      data-testid="current-weather"
      className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {formatLocationName(place.name, place.country)}
          </h2>
          {utcOffset ? (
            <p className="text-xs text-slate-500">{utcOffset}</p>
          ) : null}
        </div>
        {current.observedAt ? (
          <p className="text-xs text-slate-400">
            观测时间 {formatObservedAt(current.observedAt)}
          </p>
        ) : null}
      </header>

      <div className="mt-6 flex items-center gap-6">
        <span aria-hidden className="text-5xl">
          {weather.icon}
        </span>
        <div>
          <p className="text-4xl font-semibold tracking-tight text-slate-900">
            {formatTemperature(current.temperature, units.temperature)}
          </p>
          <p className="text-sm text-slate-600">{weather.label}</p>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-xs text-slate-500">{metric.label}</dt>
            <dd className="mt-1 text-sm font-medium text-slate-800">{metric.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
