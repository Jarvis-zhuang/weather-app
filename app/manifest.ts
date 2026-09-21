import type { MetadataRoute } from "next";

/**
 * Turns the page into an installable web app: "Add to Home Screen" opens it
 * without browser chrome, so it behaves like a native app entry.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "天气查询 · Weather App",
    short_name: "天气",
    description: "搜索城市，查看当前天气与未来 7 天预报。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#0ea5e9",
    lang: "zh-CN",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
