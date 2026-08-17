import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PLAYWRIGHT_PORT ?? "8080";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 60_000,
  // Dev server (not a production build) compiles each route on first
  // request, which can take several seconds — give assertions enough
  // headroom that a cold Vite compile isn't mistaken for a real bug.
  expect: { timeout: 15_000 },
  use: {
    navigationTimeout: 20_000,
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Reuses a dev server you already have running on this port; otherwise
  // starts one itself. Registration/auth specs need SUPABASE_SERVICE_ROLE_KEY
  // set (see docs/RUNBOOK.md → "Local dev environment") or every auth-gated
  // action will fail closed by design.
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      ...process.env,
      // When Playwright starts the server itself, forward the cron secret so
      // ops-phase-a + settle helpers exercise the same fail-closed path as CI.
      ...(process.env.CRON_HOOK_SECRET
        ? { CRON_HOOK_SECRET: process.env.CRON_HOOK_SECRET }
        : {}),
    },
  },
});
