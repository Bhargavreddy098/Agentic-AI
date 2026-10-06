import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ui", testMatch: "**/*.spec.ts", fullyParallel: false,
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000", headless: true, trace: "retain-on-failure" },
});
