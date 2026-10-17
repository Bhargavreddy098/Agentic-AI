import { createWindowsSandboxBackend } from "./windows.js";
import type { SandboxQualification, BackendType } from "./port.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface QualificationSuite { windows?: SandboxQualification; timestamp: string; overallQualified: boolean }
export interface QualificationConfig { windows?: { enabled: boolean }; outputDir?: string }
export async function qualifySandbox(backend: BackendType): Promise<SandboxQualification> {
  if (backend !== "windows") throw new Error("Backend is outside the Windows release scope");
  return createWindowsSandboxBackend().qualify();
}
export async function runFullQualificationSuite(): Promise<QualificationSuite> {
  return runQualificationWithConfig({ windows: { enabled: true } });
}
export async function runQualificationWithConfig(config: QualificationConfig): Promise<QualificationSuite> {
  const windows = config.windows?.enabled === false ? undefined : await qualifySandbox("windows");
  const suite: QualificationSuite = { timestamp: new Date().toISOString(), overallQualified: windows?.qualified === true,
    ...(windows === undefined ? {} : { windows }) };
  if (config.outputDir) await writeQualificationReport(suite, join(config.outputDir, "qualification-report.md"));
  return suite;
}
export function generateQualificationReport(suite: QualificationSuite): string {
  const lines = ["# Windows Sandbox Qualification Report", "", "Generated: " + suite.timestamp,
    "Overall Qualified: " + (suite.overallQualified ? "YES" : "NO"), ""];
  if (!suite.windows) lines.push("Not tested: no backend selected. Execution remains unavailable.");
  else for (const item of suite.windows.evidence) lines.push((item.passed ? "PASS " : "FAIL ") + item.check + ": " + item.details);
  return lines.join("\n");
}
export async function writeQualificationReport(suite: QualificationSuite, outputPath: string): Promise<void> {
  await writeFile(outputPath, generateQualificationReport(suite), "utf8");
}
