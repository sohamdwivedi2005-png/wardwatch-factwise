import { defineConfig, devices } from "@playwright/test";

// Run against production by default; override with E2E_BASE_URL.
const baseURL = process.env.E2E_BASE_URL || "https://wardwatch-factwise.vercel.app";

export default defineConfig({
  testDir: "./tests",
  testMatch: /workflows\.spec\.ts/,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    actionTimeout: 10_000,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
});
