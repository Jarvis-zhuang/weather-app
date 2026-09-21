import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "天气查询 · Weather App",
  description: "搜索城市，查看当前天气与未来 7 天预报。",
  applicationName: "天气",
  appleWebApp: {
    capable: true,
    title: "天气",
    statusBarStyle: "default",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh bg-gradient-to-b from-sky-50 via-white to-slate-100 text-slate-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
