import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");
const fixturesRoot = join(repositoryRoot, "tests", "fixtures", "architecture");

interface Violation {
  code: string;
  file: string;
  detail: string;
}

interface VerificationReport {
  ok: boolean;
  violations: Violation[];
}

function runVerifier(script: string, target: string): VerificationReport {
  let stdout: string;
  try {
    stdout = execFileSync(
      process.execPath,
      [join(repositoryRoot, "scripts", script), target],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    const failure = error as { stdout?: string };
    if (typeof failure.stdout !== "string") {
      throw error;
    }
    stdout = failure.stdout;
  }
  return JSON.parse(stdout) as VerificationReport;
}

describe("architecture boundary enforcement", () => {
  it("flags a channel importing a provider SDK directly and an unpinned dependency range", () => {
    const architecture = runVerifier("verify-architecture.mjs", join(fixturesRoot, "violations"));
    const dependencies = runVerifier("verify-dependencies.mjs", join(fixturesRoot, "violations"));
    const codes = [...architecture.violations, ...dependencies.violations].map((violation) => violation.code);
    expect(codes).toContain("CHANNEL_MODEL_BYPASS");
    expect(codes).toContain("UNPINNED_DEPENDENCY");
  });

  it("reports zero violations for a clean import graph and pinned manifests", () => {
    const architecture = runVerifier("verify-architecture.mjs", join(fixturesRoot, "clean"));
    const dependencies = runVerifier("verify-dependencies.mjs", join(fixturesRoot, "clean"));
    expect(architecture.violations).toHaveLength(0);
    expect(dependencies.violations).toHaveLength(0);
  });

  it("does not interpret documentation, comments or quoted program text as executing imports", () => {
    const architecture = runVerifier("verify-architecture.mjs", join(fixturesRoot, "import-text"));
    expect(architecture.violations).toHaveLength(0);
  });

  it("detects real imports across comments, re-exports, require calls and literal templates", () => {
    const architecture = runVerifier("verify-architecture.mjs", join(fixturesRoot, "import-forms"));
    const imports = architecture.violations.map(violation => (violation as Violation & { specifier: string }).specifier);
    expect(imports).toEqual(expect.arrayContaining(["openai", "anthropic", "@ai-sdk/openai", "pg"]));
    expect(architecture.violations.map(v => v.code)).toContain("CHANNEL_MODEL_BYPASS");
    expect(architecture.violations.map(v => v.code)).toContain("STORE_DRIVER_BYPASS");
  });

  it("denies production use of test database construction while preserving owner fixture access", () => {
    const architecture = runVerifier("verify-architecture.mjs", join(fixturesRoot, "fixture-boundary"));
    expect(architecture.violations.filter(v => v.code === "PRODUCTION_IMPORTS_TEST").map(v => v.file)).toEqual([
      "apps/tool-engine/src/main.ts",
    ]);
    expect(architecture.violations.filter(v => v.code === "STORE_DRIVER_BYPASS")).toHaveLength(0);
  });

  it("reports zero violations for the repository import graph and manifests", { timeout: 30000 }, () => {
    const architecture = runVerifier("verify-architecture.mjs", repositoryRoot);
    const dependencies = runVerifier("verify-dependencies.mjs", repositoryRoot);
    expect(architecture.violations).toHaveLength(0);
    expect(dependencies.violations).toHaveLength(0);
  });
});
