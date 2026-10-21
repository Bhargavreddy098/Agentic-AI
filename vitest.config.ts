import { defineConfig } from "vitest/config";
import path from "path";

const defaults = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/coverage/**"];

export default defineConfig({
  resolve: {
    alias: {
      "@asi/contracts": path.resolve(import.meta.dirname, "packages/contracts/src"),
      "@asi/ui": path.resolve(import.meta.dirname, "packages/ui/src"),
      "@asi/privacy": path.resolve(import.meta.dirname, "backend/modules/privacy/src"),
      "@asi/models": path.resolve(import.meta.dirname, "backend/modules/models/src"),
      "@asi/telemetry": path.resolve(import.meta.dirname, "backend/modules/telemetry/src"),
      "@asi/identity": path.resolve(import.meta.dirname, "backend/modules/identity/src"),
      "@asi/policy": path.resolve(import.meta.dirname, "backend/modules/policy/src"),
      "@asi/budgets": path.resolve(import.meta.dirname, "backend/modules/budgets/src"),
      "@asi/episodic": path.resolve(import.meta.dirname, "backend/modules/episodic/src"),
      "@asi/memory": path.resolve(import.meta.dirname, "backend/modules/memory/src"),
      "@asi/control": path.resolve(import.meta.dirname, "backend/modules/control/src"),
      "@asi/audit": path.resolve(import.meta.dirname, "backend/modules/audit/src"),
      "@asi/sandbox": path.resolve(import.meta.dirname, "backend/modules/sandbox/src"),
      "@asi/tools": path.resolve(import.meta.dirname, "backend/modules/tools/src"),
      "@asi/specialists": path.resolve(import.meta.dirname, "backend/modules/specialists/src"),
      "@asi/orchestrator": path.resolve(import.meta.dirname, "backend/modules/orchestrator/src"),
      "@asi/gateway": path.resolve(import.meta.dirname, "backend/modules/gateway/src"),
      "@asi/channels": path.resolve(import.meta.dirname, "backend/modules/channels/src"),
      "@asi/context": path.resolve(import.meta.dirname, "backend/modules/context/src"),
      "@asi/protocols": path.resolve(import.meta.dirname, "backend/modules/protocols/src"),
      "@asi/skills": path.resolve(import.meta.dirname, "backend/modules/skills/src"),
      "@asi/web": path.resolve(import.meta.dirname, "apps/web/src"),
      "@asi/gateway-fixture": path.resolve(import.meta.dirname, "apps/gateway-fixture/src"),
      "@asi/gateway-app": path.resolve(import.meta.dirname, "backend/workers/gateway/src"),
    },
  },
  test: {
    passWithNoTests: false,
    globals: true,
    setupFiles: ["tests/setup.ts"],
    projects: [
      {
        oxc: { jsx: { runtime: "automatic" } },
        test: {
          name: "unit",
          environment: "jsdom",
          include: [
            "tests/**/*.test.ts",
            "tests/**/*.test.tsx",
            "packages/*/test/**/*.test.ts",
            "backend/modules/*/test/**/*.test.ts",
            "backend/workers/*/test/**/*.test.ts",
            "packages/*/test/**/*.test.tsx",
            "apps/*/test/**/*.test.ts",
            "apps/*/test/**/*.test.tsx",
          ],
          exclude: [
            ...defaults,
            "tests/integration/**",
            "tests/security/**",
            "tests/protocols/**",
            "tests/e2e/**",
            "tests/load/**",
            "tests/fixtures/**",
            "backend/modules/control/test/**",
          ],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts", "backend/modules/control/test/**/*.test.ts"],
          exclude: defaults,
        },
      },
      {
        test: {
          name: "security",
          environment: "node",
          include: ["tests/security/**/*.test.ts"],
          exclude: defaults,
        },
      },
      {
        test: {
          name: "protocols",
          environment: "node",
          include: ["tests/protocols/**/*.test.ts"],
          exclude: defaults,
        },
      },
      {
        test: {
          name: "e2e",
          environment: "node",
          include: ["tests/e2e/**/*.test.ts"],
          exclude: defaults,
        },
      },
      {
        test: {
          name: "load",
          environment: "node",
          include: ["tests/load/**/*.test.ts"],
          exclude: defaults,
        },
      },
    ],
  },
});
