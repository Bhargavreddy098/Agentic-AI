import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/.next-live/**",
      "**/coverage/**",
      "tests/fixtures/**",
      "docs/**",
      "assets/**",
      ".archify/**",
      ".superpowers/**",
      // Pinned upstream source snapshot; not an ASI workspace or runtime dependency.
      "third_party/openclaw/**",
      "pnpm-lock.yaml",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
