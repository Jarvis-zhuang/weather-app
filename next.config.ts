import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16 blocks dev-only resources (HMR, client chunks) from origins other
  // than `localhost` by default. Without this, opening http://127.0.0.1:3000
  // serves the SSR HTML but never hydrates — the UI looks dead.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
