import { defineConfig } from "vitest/config";
import path from "path";

const defaults = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/coverage/**"];

export default defineConfig({
  resolve: {
    alias: {
      "@asi/contracts": path.resolve(__dirname, "packages/contracts/src"),
      "@asi/privacy": path.resolve(__dirname, "packages/privacy/src"),
      "@asi/models": path.resolve(__dirname, "packages/models/src"),
      "@asi/telemetry": path.resolve(__dirname, "packages/telemetry/src"),
      "@asi/identity": path.resolve(__dirname, "packages/identity/src"),
      "@asi/policy": path.resolve(__dirname, "packages/policy/src"),
      "@asi/budgets": path.resolve(__dirname, "packages/budgets/src"),
      "@asi/episodic": path.resolve(__dirname, "packages/episodic/src"),
      "@asi/memory": path.resolve(__dirname, "packages/memory/src"),
      "@asi/control": path.resolve(__dirname, "packages/control/src"),
      "@asi/audit": path.resolve(__dirname, "packages/audit/src"),
      "@asi/sandbox": path.resolve(__dirname, "packages/sandbox/src"),
      "@asi/tools": path.resolve(__dirname, "packages/tools/src"),
      "@asi/specialists": path.resolve(__dirname, "packages/specialists/src"),
      "@asi/orchestrator": path.resolve(__dirname, "packages/orchestrator/src"),
      "@asi/gateway": path.resolve(__dirname, "packages/gateway/src"),
      "@asi/channels": path.resolve(__dirname, "packages/channels/src"),
      "@asi/context": path.resolve(__dirname, "packages/context/src"),
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
            "packages/control/test/**",
          ],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts", "packages/control/test/**/*.test.ts"],
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
