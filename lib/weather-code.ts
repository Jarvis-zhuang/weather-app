/**
 * WMO weather interpretation codes -> human readable text + icon.
 * Reference: https://open-meteo.com/en/docs (weather_code)
 */
export interface WeatherDescriptor {
  label: string;
  icon: string;
}

const WMO_CODES: Record<number, WeatherDescriptor> = {
  0: { label: "晴朗", icon: "☀️" },
  1: { label: "大部晴朗", icon: "🌤️" },
  2: { label: "局部多云", icon: "⛅" },
  3: { label: "阴天", icon: "☁️" },
  45: { label: "有雾", icon: "🌫️" },
  48: { label: "雾凇", icon: "🌫️" },
  51: { label: "小毛毛雨", icon: "🌦️" },
  53: { label: "毛毛雨", icon: "🌦️" },
  55: { label: "大毛毛雨", icon: "🌦️" },
  56: { label: "冻毛毛雨", icon: "🌧️" },
  57: { label: "强冻毛毛雨", icon: "🌧️" },
  61: { label: "小雨", icon: "🌧️" },
  63: { label: "中雨", icon: "🌧️" },
  65: { label: "大雨", icon: "🌧️" },
  66: { label: "冻雨", icon: "🌧️" },
  67: { label: "强冻雨", icon: "🌧️" },
  71: { label: "小雪", icon: "🌨️" },
  73: { label: "中雪", icon: "🌨️" },
  75: { label: "大雪", icon: "❄️" },
  77: { label: "米雪", icon: "🌨️" },
  80: { label: "小阵雨", icon: "🌦️" },
  81: { label: "阵雨", icon: "🌧️" },
  82: { label: "强阵雨", icon: "🌧️" },
  85: { label: "小阵雪", icon: "🌨️" },
  86: { label: "强阵雪", icon: "❄️" },
  95: { label: "雷阵雨", icon: "⛈️" },
  96: { label: "雷阵雨伴冰雹", icon: "⛈️" },
  99: { label: "强雷阵雨伴冰雹", icon: "⛈️" },
};

const FALLBACK: WeatherDescriptor = { label: "未知天气", icon: "🌡️" };

/**
 * Clear-sky icons only make sense during the day. The provider tells us
 * whether the observation is daytime (`is_day`), so use it instead of always
 * showing a sun at 23:00.
 */
const NIGHT_ICONS: Partial<Record<number, string>> = {
  0: "🌙",
  1: "🌙",
  2: "☁️",
};

export function describeWeather(code: number, isDay = true): WeatherDescriptor {
  const base = WMO_CODES[code] ?? FALLBACK;
  const nightIcon = !isDay ? NIGHT_ICONS[code] : undefined;
  return nightIcon ? { ...base, icon: nightIcon } : base;
}
