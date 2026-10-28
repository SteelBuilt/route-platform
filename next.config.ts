import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Nearly every page is per-user and per-org, so we render dynamically and
  // skip Cache Components (see docs/ARCHITECTURE.md).
  cacheComponents: false,
  serverExternalPackages: ["@electric-sql/pglite"],
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
