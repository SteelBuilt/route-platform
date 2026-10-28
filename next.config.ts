import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Nearly every page is per-user and per-org, so we render dynamically and
  // skip Cache Components (see docs/ARCHITECTURE.md).
  cacheComponents: false,
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    // Route file uploads (PDF limit 25 MB, from app_config). Note: Netlify
    // functions cap request bodies at ~6 MB; see PROGRESS.md known limitations.
    serverActions: { bodySizeLimit: "26mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
