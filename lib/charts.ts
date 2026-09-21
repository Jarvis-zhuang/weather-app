import type { EChartsOption } from "echarts";

import type { DailyForecast, HourlyPoint, WeatherUnits } from "./types";

/**
 * Chart options are pure data: no DOM, no echarts import at runtime.
 * That makes them trivially testable and keeps the rendering concern inside
 * the `useEChart` hook.
 */

const AXIS_LABEL = "#94a3b8";
const LEGEND_TEXT = "#64748b";
const SPLIT_LINE = "#e2e8f0";
const SKY = "#0ea5e9";
const AMBER = "#f59e0b";
/** "Feels like" line — a warm hue against the cool actual-temperature line. */
const ORANGE = "#f97316";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/**
 * Enter / update animation, declared here instead of inside the hook: the
 * animation becomes part of the chart spec, so it is visible in review and
 * testable without a DOM. `animationDuration` covers a *new* series (a tab
 * switch), `animationDurationUpdate` a data swap (a city switch).
 */
const ANIMATION = {
  animation: true,
  animationDuration: 700,
  animationEasing: "cubicOut" as const,
  animationDurationUpdate: 450,
  animationEasingUpdate: "cubicInOut" as const,
};

/**
 * `top` must leave room for the legend row on top of the plot area.
 * At `top: 0` the label box is centred on the 10px item, so the glyphs stick
 * out above the canvas and get sliced — the bug we are fixing here.
 */
const LEGEND_TOP_OFFSET = 6;
const LEGEND_ROW_HEIGHT = 22;

const BASE_GRID = { left: 4, right: 8, bottom: 4, containLabel: true };
/** Legend above the grid. */
const GRID_WITH_LEGEND = { ...BASE_GRID, top: LEGEND_TOP_OFFSET + LEGEND_ROW_HEIGHT + 18 };
/** No legend, but the y-axis name ("°C") still needs a little headroom. */
const GRID_PLAIN = { ...BASE_GRID, top: 28 };

const LEGEND_BASE = {
  right: 0,
  top: LEGEND_TOP_OFFSET,
  itemWidth: 10,
  itemHeight: 10,
  itemGap: 16,
  textStyle: { color: LEGEND_TEXT, fontSize: 11 },
};

/** Deterministic (UTC) weekday — avoids a server/client mismatch. */
function weekdayOf(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  return WEEKDAYS[parsed.getUTCDay()] ?? "";
}

function hoursLabel(time: string): string {
  return time.slice(11, 16);
}

function fade(color: string, from: number, to: number) {
  return {
    // `as const` keeps the literal "linear" that ZRColor's gradient type needs.
    type: "linear" as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: `rgba(${color}, ${from})` },
      { offset: 1, color: `rgba(${color}, ${to})` },
    ],
  };
}

export function buildHourlyTemperatureOption(
  hourly: HourlyPoint[],
  units: WeatherUnits,
): EChartsOption {
  return {
    ...ANIMATION,
    grid: GRID_WITH_LEGEND,
    tooltip: { trigger: "axis" },
    legend: { ...LEGEND_BASE, data: ["气温", "体感温度", "降水概率"] },
    xAxis: {
      type: "category",
      data: hourly.map((point) => hoursLabel(point.time)),
      boundaryGap: true,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: SPLIT_LINE } },
      axisLabel: { color: AXIS_LABEL, fontSize: 11, interval: 3 },
    },
    yAxis: [
      {
        type: "value",
        name: units.temperature,
        nameTextStyle: { color: AXIS_LABEL, fontSize: 11 },
        splitLine: { lineStyle: { color: SPLIT_LINE } },
        axisLabel: { color: AXIS_LABEL, fontSize: 11 },
        scale: true,
      },
      {
        type: "value",
        min: 0,
        max: 100,
        splitLine: { show: false },
        // The unit rides on the tick labels ("80%") instead of a floating axis
        // name. A name is drawn at the top-right — exactly where the legend
        // sits — and the two used to collide. Labels sit below the legend row,
        // so they can never overlap it.
        axisLabel: { color: AXIS_LABEL, fontSize: 11, formatter: "{value}%" },
      },
    ],
    series: [
      {
        name: "降水概率",
        type: "bar",
        yAxisIndex: 1,
        barWidth: 6,
        itemStyle: { color: "rgba(14, 165, 233, 0.22)", borderRadius: 3 },
        data: hourly.map((point) => point.precipitationProbability),
      },
      {
        name: "气温",
        type: "line",
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2.5, color: SKY },
        itemStyle: { color: SKY },
        areaStyle: { color: fade("14, 165, 233", 0.28, 0.02) },
        data: hourly.map((point) => Math.round(point.temperature * 10) / 10),
      },
      {
        // Drawn last (on top of the area) and dashed, so "feels like" reads as
        // a derived comparison rather than a second real measurement. No area
        // fill — two filled bands would fight each other.
        name: "体感温度",
        type: "line",
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: ORANGE, type: "dashed" },
        itemStyle: { color: ORANGE },
        data: hourly.map((point) => Math.round(point.apparentTemperature * 10) / 10),
      },
    ],
  };
}

export function buildDailyTemperatureOption(
  daily: DailyForecast[],
  units: WeatherUnits,
): EChartsOption {
  return {
    ...ANIMATION,
    grid: GRID_WITH_LEGEND,
    tooltip: { trigger: "axis" },
    legend: { ...LEGEND_BASE, data: ["最高温", "最低温"] },
    xAxis: {
      type: "category",
      data: daily.map((day) => weekdayOf(day.date)),
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: SPLIT_LINE } },
      axisLabel: { color: AXIS_LABEL, fontSize: 11 },
    },
    yAxis: {
      type: "value",
      name: units.temperature,
      nameTextStyle: { color: AXIS_LABEL, fontSize: 11 },
      splitLine: { lineStyle: { color: SPLIT_LINE } },
      axisLabel: { color: AXIS_LABEL, fontSize: 11 },
      scale: true,
    },
    series: [
      {
        name: "最高温",
        type: "line",
        smooth: true,
        symbolSize: 6,
        lineStyle: { width: 2.5, color: AMBER },
        itemStyle: { color: AMBER },
        areaStyle: { color: fade("245, 158, 11", 0.18, 0.02) },
        data: daily.map((day) => day.tempMax),
      },
      {
        name: "最低温",
        type: "line",
        smooth: true,
        symbolSize: 6,
        lineStyle: { width: 2, color: SKY },
        itemStyle: { color: SKY },
        data: daily.map((day) => day.tempMin),
      },
    ],
  };
}

export function buildPrecipitationOption(
  daily: DailyForecast[],
  units: WeatherUnits,
): EChartsOption {
  return {
    ...ANIMATION,
    grid: GRID_PLAIN,
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: daily.map((day) => weekdayOf(day.date)),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: SPLIT_LINE } },
      axisLabel: { color: AXIS_LABEL, fontSize: 11 },
    },
    yAxis: {
      type: "value",
      name: units.precipitation,
      nameTextStyle: { color: AXIS_LABEL, fontSize: 11 },
      splitLine: { lineStyle: { color: SPLIT_LINE } },
      axisLabel: { color: AXIS_LABEL, fontSize: 11 },
    },
    series: [
      {
        name: "降水量",
        type: "bar",
        barWidth: "45%",
        data: daily.map((day) => day.precipitation),
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(14, 165, 233, 0.95)" },
              { offset: 1, color: "rgba(14, 165, 233, 0.35)" },
            ],
          },
        },
      },
    ],
  };
}
