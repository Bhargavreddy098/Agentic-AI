import { defineConfig } from "@playwright/test";

const GATEWAY_ORIGIN = "http://127.0.0.1:4400";
const WEB_ORIGIN = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests/ui/e2e",
  testMatch: "protected-flow.live.spec.ts",
  fullyParallel: false,
  timeout: 120_000,
  use: { baseURL: WEB_ORIGIN, headless: true, trace: "retain-on-failure" },
  webServer: [
    {
      command: "node backend/workers/gateway/dist/ui-server.js",
      url: `${GATEWAY_ORIGIN}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ASI_UI_GATEWAY_PORT: "4400", ASI_UI_ALLOWED_ORIGINS: WEB_ORIGIN },
    },
    {
      command: "pnpm --filter @asi/web exec next dev --hostname 127.0.0.1 --port 3100",
      url: `${WEB_ORIGIN}/chat`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { ASI_UI_GATEWAY_ORIGIN: GATEWAY_ORIGIN, ASI_UI_DIST_DIR: ".next-live", NEXT_PUBLIC_ASI_UI_MODE: "" },
    },
  ],
});
