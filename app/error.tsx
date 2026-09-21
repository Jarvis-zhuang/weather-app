"use client";

/** Last-resort boundary: keeps an unexpected crash from blanking the page. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center gap-4 px-4">
      <h1 className="text-xl font-semibold text-slate-900">出现了一些问题</h1>
      <p className="text-sm text-slate-600">{error.message || "请稍后重试。"}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
      >
        重新加载
      </button>
    </main>
  );
}
