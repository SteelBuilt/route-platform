import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    env: { NODE_ENV: "test", DATABASE_URL: "pglite:memory" },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
  },
});
