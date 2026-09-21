import type { Viewport } from "next";

/**
 * Mobile-first: `viewport-fit=cover` lets the layout reach under the notch and
 * the home indicator, which is what makes a web app feel like a native one.
 * Zoom is deliberately left enabled (disabling it hurts accessibility).
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0ea5e9",
};
