"use client";

import type { ReactNode } from "react";

import { AppError } from "@/lib/errors";

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
      {children}
    </section>
  );
}

export function WeatherSkeleton() {
  return (
    <div
      data-testid="weather-skeleton"
      className="space-y-4"
      aria-busy="true"
      aria-live="polite"
    >
      <Card>
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-32 rounded bg-slate-200" />
          <div className="h-12 w-40 rounded bg-slate-200" />
          <div className="h-4 w-48 rounded bg-slate-200" />
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="h-14 rounded bg-slate-100" />
            <div className="h-14 rounded bg-slate-100" />
            <div className="h-14 rounded bg-slate-100" />
          </div>
        </div>
      </Card>
      <Card>
        <div className="animate-pulse space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-4 w-16 rounded bg-slate-200" />
            <div className="h-7 w-40 rounded-lg bg-slate-100" />
          </div>
          <div className="h-64 rounded bg-slate-100" />
        </div>
      </Card>
      <Card>
        <div className="animate-pulse">
          <div className="h-4 w-24 rounded bg-slate-200" />
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-7">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="h-24 rounded bg-slate-100" />
            ))}
          </div>
        </div>
      </Card>
      <p className="text-center text-sm text-slate-500">正在获取天气数据…</p>
    </div>
  );
}

export function ErrorPanel({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const appError = error instanceof AppError ? error : null;
  const message =
    appError?.message ?? "加载天气数据时出现未知错误，请稍后重试。";

  return (
    <Card>
      <div role="alert" className="flex flex-col items-start gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-xl">
            ⚠️
          </span>
          <h2 className="text-base font-semibold text-rose-700">无法获取天气</h2>
        </div>
        <p className="text-sm text-slate-600">{message}</p>
        {appError ? (
          <p className="text-xs text-slate-400">错误码：{appError.code}</p>
        ) : null}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
          >
            重试
          </button>
        ) : null}
      </div>
    </Card>
  );
}

export function EmptyState() {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <span aria-hidden className="text-4xl">
          🌍
        </span>
        <h2 className="text-base font-semibold text-slate-800">搜索一个城市开始</h2>
        <p className="max-w-sm text-sm text-slate-500">
          支持中英文城市名，例如「深圳」「Tokyo」「New York」。选择地点后可查看当前天气与未来 7 天预报。
        </p>
      </div>
    </Card>
  );
}
