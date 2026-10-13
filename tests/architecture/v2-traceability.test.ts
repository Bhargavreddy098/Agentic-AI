import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it, beforeAll, afterAll } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..", "..");

function runVerifyV2Guide(testRoot: string): { violations: { code: string; detail: string }[] } {
  const output = execFileSync(process.execPath, [resolve(repoRoot, "scripts/verify-v2-guide.mjs"), testRoot], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: "pipe",
  });
  return JSON.parse(output);
}

function runVerifyV2GuideExpectFailure(testRoot: string): { violations: { code: string; detail: string }[] } {
  try {
    execFileSync(process.execPath, [resolve(repoRoot, "scripts/verify-v2-guide.mjs"), testRoot], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: "pipe",
    });
    throw new Error("Expected verification to fail but it passed");
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    const stdout = err.stdout ?? err.stderr ?? "";
    if (!stdout) throw new Error("No output from verification script", { cause: error });
    return JSON.parse(stdout);
  }
}

let testRoot: string;

beforeAll(() => {
  testRoot = mkdtempSync(join(tmpdir(), "asi-v2-traceability-"));
  const docsDir = join(testRoot, "docs");
  mkdirSync(docsDir, { recursive: true });
  const scriptsDir = join(testRoot, "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  const superpowersDir = join(testRoot, "docs", "superpowers");
  mkdirSync(superpowersDir, { recursive: true });
  const decisionsDir = join(testRoot, "docs", "decisions");
  mkdirSync(decisionsDir, { recursive: true });
  const runbooksDir = join(testRoot, "docs", "runbooks");
  mkdirSync(runbooksDir, { recursive: true });
  const dbDir = join(testRoot, "db", "postgres", "migrations");
  mkdirSync(dbDir, { recursive: true });

  // Copy all files referenced in the manifest
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, "docs/v2-source-manifest.json"), "utf8"));
  for (const source of manifest.sourceFiles) {
    const src = join(repoRoot, source.path);
    const dest = join(testRoot, source.path);
    mkdirSync(join(dest, ".."), { recursive: true });
    if (existsSync(src)) {
      copyFileSync(src, dest);
    } else {
      writeFileSync(dest, "# placeholder\n");
    }
  }

  // Copy scripts
  const scriptsToCopy = [
    "scripts/verify-v2-guide.mjs",
    "scripts/v2-task-state.mjs",
    "scripts/v2-task.mjs",
    "scripts/assemble-v2-guide.mjs",
    "scripts/verify-traceability.mjs",
  ];
  for (const file of scriptsToCopy) {
    copyFileSync(resolve(repoRoot, file), join(testRoot, file));
  }

  // Copy migration files referenced in the registry
  const migrationFiles = [
    "db/postgres/migrations/001-control.sql",
    "db/postgres/migrations/009-identity-grants.sql",
    "db/postgres/migrations/010-control-qualification.sql",
  ];
  for (const file of migrationFiles) {
    const src = join(repoRoot, file);
    const dest = join(testRoot, file);
    mkdirSync(join(dest, ".."), { recursive: true });
    if (existsSync(src)) {
      copyFileSync(src, dest);
    } else {
      writeFileSync(dest, "-- placeholder migration\n");
    }
  }

  // Copy additional files needed by verification script but not in manifest
  const additionalFiles = [
    "docs/v2-build-guide.md",
    "docs/v2-task-ledger.json",
    "docs/v2-source-manifest.json",
  ];
  for (const file of additionalFiles) {
    const src = join(repoRoot, file);
    const dest = join(testRoot, file);
    mkdirSync(join(dest, ".."), { recursive: true });
    if (existsSync(src)) {
      copyFileSync(src, dest);
    } else {
      writeFileSync(dest, "# placeholder\n");
    }
  }

  // Verify test directory setup
  if (!existsSync(join(testRoot, "docs/v2-build-guide.md"))) {
    throw new Error("Test directory setup failed: v2-build-guide.md not found");
  }
  if (!existsSync(join(testRoot, "docs/v2-task-ledger.json"))) {
    throw new Error("Test directory setup failed: v2-task-ledger.json not found");
  }
});

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

function writeTestV2Ledger(ledger: object) {
  writeFileSync(join(testRoot, "docs/v2-task-ledger.json"), JSON.stringify(ledger, null, 2));
}

function writeTestV2BuildGuide(guide: string) {
  writeFileSync(join(testRoot, "docs/v2-build-guide.md"), guide);
}

function writeTestArchitectureBaseline(baseline: object) {
  writeFileSync(join(testRoot, "docs/architecture-baseline.json"), JSON.stringify(baseline, null, 2));
}

function writeTestUiBaseline(baseline: object) {
  writeFileSync(join(testRoot, "docs/ui-baseline.json"), JSON.stringify(baseline, null, 2));
}

function writeTestTaskLedger(ledger: object) {
  writeFileSync(join(testRoot, "docs/task-ledger.json"), JSON.stringify(ledger, null, 2));
}

function writeTestUiTaskLedger(ledger: object) {
  writeFileSync(join(testRoot, "docs/ui-task-ledger.json"), JSON.stringify(ledger, null, 2));
}

function readOriginalV2Ledger() {
  return JSON.parse(readFileSync(resolve(repoRoot, "docs/v2-task-ledger.json"), "utf8"));
}

function readOriginalArchitectureBaseline() {
  return JSON.parse(readFileSync(resolve(repoRoot, "docs/architecture-baseline.json"), "utf8"));
}

function readOriginalUiBaseline() {
  return JSON.parse(readFileSync(resolve(repoRoot, "docs/ui-baseline.json"), "utf8"));
}



it("passes with current valid V2 ledger and guide", () => {
  const report = runVerifyV2Guide(testRoot);
  expect(report.violations).toHaveLength(0);
});

it("fails when M01-M11 migration tasks are missing or duplicated", () => {
  const ledger = readOriginalV2Ledger();
  ledger.tasks = ledger.tasks.filter((t: { kind?: string }) => t.kind !== "migration");
  writeTestV2Ledger(ledger);
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "MIGRATION_TASKS")).toBe(true);
});

it("fails when V2-T01-V2-T40 extension tasks are missing or duplicated", () => {
  const ledger = readOriginalV2Ledger();
  ledger.tasks = ledger.tasks.filter((t: { kind?: string }) => t.kind !== "extension");
  writeTestV2Ledger(ledger);
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "EXTENSION_TASKS")).toBe(true);
});

it("fails when V2-G01 integration gate is missing", () => {
  const ledger = readOriginalV2Ledger();
  ledger.tasks = ledger.tasks.filter((t: { kind?: string }) => t.kind !== "integration_gate");
  writeTestV2Ledger(ledger);
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "PROTECTED_V2_GATE")).toBe(true);
});

it("fails when V2-F01-V2-F40 proposals are missing or duplicated", () => {
  const ledger = readOriginalV2Ledger();
  const firstTask = ledger.tasks.find((t: { kind?: string }) => t.kind === "extension");
  if (firstTask) firstTask.proposalIds = ["V2-F01", "V2-F01"];
  writeTestV2Ledger(ledger);
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "PROPOSAL_COVERAGE")).toBe(true);
});

it("fails when requirement references (R01-R24, F01-F18) are missing from active guide", () => {
  writeTestV2BuildGuide("# V2 Guide\n\nMinimal guide without requirements.");
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "REQUIREMENT_COVERAGE")).toBe(true);
});

it("fails when architecture baseline does not have exactly 12 components", () => {
  const baseline = readOriginalArchitectureBaseline();
  baseline.components = [];
  writeTestArchitectureBaseline(baseline);
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "COMPONENT_COUNT")).toBe(true);
});

it("fails when UI baseline does not have exactly 7 sections", () => {
  const baseline = readOriginalUiBaseline();
  baseline.sections = [];
  writeTestUiBaseline(baseline);
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "UI_SECTION_COUNT")).toBe(true);
});

it("fails when inherited snapshot does not preserve all 52 original tasks", () => {
  const ledger = readOriginalV2Ledger();
  ledger.inheritedSnapshot = ledger.inheritedSnapshot.slice(0, 10);
  writeTestV2Ledger(ledger);
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "SNAPSHOT_COUNT")).toBe(true);
});

it("fails when unknown task dependency is referenced", () => {
  const ledger = readOriginalV2Ledger();
  const firstTask = ledger.tasks[0];
  firstTask.dependsOn = [...(firstTask.dependsOn || []), "UNKNOWN-TASK"];
  writeTestV2Ledger(ledger);
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "UNKNOWN_DEPENDENCY")).toBe(true);
});

it("fails when dependency cycle exists in V2 task graph", () => {
  const ledger = readOriginalV2Ledger();
  const m01 = ledger.tasks.find((t: { id: string }) => t.id === "M01");
  const m02 = ledger.tasks.find((t: { id: string }) => t.id === "M02");
  if (m01 && m02) {
    m01.dependsOn = [...(m01.dependsOn || []), "M02"];
    m02.dependsOn = [...(m02.dependsOn || []), "M01"];
  }
  writeTestV2Ledger(ledger);
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "DEPENDENCY_CYCLE")).toBe(true);
});

it("fails when task references unknown component owner", () => {
  const ledger = readOriginalV2Ledger();
  ledger.tasks[0].owner = "unknown-component";
  writeTestV2Ledger(ledger);
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "UNKNOWN_OWNER")).toBe(true);
});

it("fails when task has no requirements or invalid requirement IDs", () => {
  const ledger = readOriginalV2Ledger();
  ledger.tasks[0].requirements = ["INVALID-R01"];
  writeTestV2Ledger(ledger);
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "TASK_REQUIREMENTS")).toBe(true);
});

it("fails when task file paths contain globs or absolute paths", () => {
  const ledger = readOriginalV2Ledger();
  ledger.tasks[0].files = ["/absolute/path", "relative/**/*.ts"];
  writeTestV2Ledger(ledger);
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "EXACT_FILE_OWNERSHIP")).toBe(true);
});

it("fails when task contract fields are missing", () => {
  const ledger = readOriginalV2Ledger();
  delete ledger.tasks[0].interfaces;
  writeTestV2Ledger(ledger);
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "TASK_CONTRACT")).toBe(true);
});

it("fails when task card is missing from guide", () => {
  writeTestV2BuildGuide("# V2 Guide\n\nNo task cards here.");
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "MISSING_TASK_CARD")).toBe(true);
});

it("fails when task card missing interfaces/acceptance/files/checks", () => {
  const ledger = readOriginalV2Ledger();
  const m01 = ledger.tasks.find((t: { id: string }) => t.id === "M01");
  if (m01) {
    m01.files = [];
    m01.checks = [];
  }
  writeTestV2Ledger(ledger);
  writeTestV2BuildGuide("# V2 Guide\n\n### M01: V2 traceability and baseline review\n\nMinimal card.");
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "TASK_CARD_CONTRACT" || v.code === "TASK_CARD_FILE" || v.code === "MISSING_TASK_CHECK")).toBe(true);
});

it("fails when completed task lacks approved review status or evidence", () => {
  const ledger = readOriginalV2Ledger();
  const m01 = ledger.tasks.find((t: { id: string }) => t.id === "M01");
  if (m01) {
    m01.status = "completed";
    m01.reviewStatus = "pending";
    m01.evidence = [];
  }
  writeTestV2Ledger(ledger);
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "UNSUPPORTED_COMPLETION")).toBe(true);
});

it("fails when conditional dependency activation is invalid", () => {
  const ledger = readOriginalV2Ledger();
  ledger.activatedConditionalDependencies = { "V2-T01": ["NONEXISTENT"] };
  writeTestV2Ledger(ledger);
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "INVALID_CONDITIONAL_ACTIVATION")).toBe(true);
});

it("fails when approval honesty check is violated", () => {
  const ledger = readOriginalV2Ledger();
  ledger.approvedByHuman = true;
  ledger.status = "approved";
  ledger.approval.reviewStatus = "approved";
  ledger.approval.decisions = [];
  writeTestV2Ledger(ledger);
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "APPROVAL_HONESTY")).toBe(true);
});

it("fails when catalog port gate references unknown dependency", () => {
  const ledger = readOriginalV2Ledger();
  ledger.catalogPortGates = { "models": ["UNKNOWN-TASK"] };
  writeTestV2Ledger(ledger);
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "UNKNOWN_PORT_DEPENDENCY")).toBe(true);
});

it("fails when migration ID collision exists", () => {
  const ledger = readOriginalV2Ledger();
  ledger.migrationRegistry = {
    reservedInherited: ["001-control.sql"],
    newMigrations: [{ file: "001-control.sql", owner: "M04", requires: [] }]
  };
  writeTestV2Ledger(ledger);
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "MIGRATION_ID_COLLISION")).toBe(true);
});

it("fails when migration file owner mismatch", () => {
  const ledger = readOriginalV2Ledger();
  ledger.migrationRegistry = {
    reservedInherited: [],
    newMigrations: [{ file: "010-control-qualification.sql", owner: "M01", requires: [] }]
  };
  writeTestV2Ledger(ledger);
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "MIGRATION_FILE_OWNER")).toBe(true);
});

it("fails when original 30 system tasks are not preserved", () => {
  writeTestTaskLedger({ tasks: [] });
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "ORIGINAL_SYSTEM_TASKS")).toBe(true);
});

it("fails when original 22 UI tasks are not preserved", () => {
  writeTestUiTaskLedger({ tasks: [] });
  const report = runVerifyV2GuideExpectFailure(testRoot);
  expect(report.violations.some(v => v.code === "ORIGINAL_UI_TASKS")).toBe(true);
});