import { describeWeather } from "@/lib/weather-code";
import { formatDayLabel, formatTemperature, nextDate } from "@/lib/format";
import type { WeatherPayload } from "@/lib/types";

export function ForecastList({ data }: { data: WeatherPayload }) {
  const { daily, units, current } = data;
  if (daily.length === 0) return null;

  const today = current.observedAt.slice(0, 10) || daily[0]!.date;
  const tomorrow = nextDate(today);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">未来 {daily.length} 天预报</h2>

      {/* 3 columns on phones keeps each day card about as wide as on desktop,
          instead of stretching 7 days over 4 very tall rows. */}
      <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-7">
        {daily.map((day) => {
          const weather = describeWeather(day.weatherCode);
          const isToday = day.date === today;
          return (
            <li
              key={day.date}
              data-testid="forecast-day"
              aria-current={isToday ? "date" : undefined}
              className={`flex flex-col items-center gap-1 rounded-xl px-2 py-3 ${
                isToday ? "bg-sky-50 ring-1 ring-sky-200" : "bg-slate-50"
              }`}
            >
              <span className="text-xs font-medium text-slate-500">
                {formatDayLabel(day.date, today, tomorrow)}
              </span>
              <span aria-hidden className="text-2xl">
                {weather.icon}
              </span>
              <span className="text-xs text-slate-600">{weather.label}</span>
              <span className="mt-1 text-sm font-semibold text-slate-900">
                {formatTemperature(day.tempMax, units.temperature)}
              </span>
              <span className="text-xs text-slate-500">
                {formatTemperature(day.tempMin, units.temperature)}
              </span>
              {day.precipitation > 0 ? (
                <span className="text-[11px] text-sky-600">
                  💧 {day.precipitation} {units.precipitation}
                </span>
              ) : (
                <span className="text-[11px] text-slate-300">—</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
