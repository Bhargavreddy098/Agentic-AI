import { defineConfig } from "vitest/config";

const defaults = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/coverage/**"];

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        oxc: { jsx: { runtime: "automatic" } },
        test: {
          name: "unit",
          environment: "node",
          include: [
            "tests/**/*.test.ts",
            "packages/*/test/**/*.test.ts",
            "apps/*/test/**/*.test.ts",
          ],
          exclude: [
            ...defaults,
            "tests/integration/**",
            "tests/security/**",
            "tests/protocols/**",
            "tests/e2e/**",
            "tests/load/**",
            "tests/fixtures/**",
          ],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
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
