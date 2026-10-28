import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a dev server on a throwaway PGlite database.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npx tsx scripts/migrate.ts && npx next dev -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 180_000,
    env: { PGLITE_DIR: ".data/pglite-e2e", PLATFORM_ADMIN_EMAILS: "e2e-admin@example.test" },
  },
});
