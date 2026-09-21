/**
 * Formatting helpers. Everything is deterministic (explicit locale + UTC
 * anchoring) so server-rendered and client-rendered markup always match.
 */

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  weekday: "short",
  timeZone: "UTC",
});

export function formatWeekday(date: string): string {
  // Anchor at UTC noon so no timezone can shift the calendar day.
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : WEEKDAY_FORMATTER.format(parsed);
}

export function formatDayLabel(date: string, today: string, tomorrow: string): string {
  if (date === today) return "今天";
  if (date === tomorrow) return "明天";
  return formatWeekday(date);
}

export function nextDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

export function formatTemperature(value: number, unit: string): string {
  const rounded = Math.round(value);
  if (unit === "celsius") return `${rounded}°C`;
  if (unit === "fahrenheit") return `${rounded}°F`;
  return `${rounded}${unit}`;
}

export function formatObservedAt(observedAt: string): string {
  // Open-Meteo returns local time without an offset, e.g. "2026-09-21T18:30".
  return observedAt ? observedAt.replace("T", " ") : "";
}

export function formatLocationName(name: string, country: string): string {
  return country ? `${name} · ${country}` : name;
}

/**
 * A UTC offset in seconds as a short label: 28800 -> "UTC+8", 19800 -> "UTC+5:30".
 * The provider hands us the offset, so we never have to show the raw IANA zone
 * id ("Asia/Shanghai") — and being a plain integer it renders identically on the
 * server and the client (no hydration drift). `null` means "don't render".
 */
export function formatUtcOffset(seconds?: number | null): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  const sign = seconds < 0 ? "-" : "+";
  const totalMinutes = Math.abs(Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0
    ? `UTC${sign}${hours}`
    : `UTC${sign}${hours}:${String(minutes).padStart(2, "0")}`;
}
