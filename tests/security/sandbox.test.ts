import { describe, it, expect } from "vitest";
import { createWindowsSandboxBackend, executeIsolated, qualifySandboxBackend, runFullQualificationSuite,
  runQualificationWithConfig, generateQualificationReport } from "@asi/sandbox";

describe("Windows isolation availability gate", () => {
  it("never qualifies an unavailable native backend", async () => {
    const report=await qualifySandboxBackend("windows");
    expect(report.qualified).toBe(false);expect(report.checks.backend_available).toBe(false);
    expect(report.evidence.every(item=>item.passed===false)).toBe(true);
  });
  it("rejects removed backend selections", async () => {
    await expect(Reflect.apply(qualifySandboxBackend,undefined,["container"])).rejects.toThrow("outside the Windows release scope");
    await expect(Reflect.apply(qualifySandboxBackend,undefined,["microvm"])).rejects.toThrow("outside the Windows release scope");
  });
  it("reports the full suite as unqualified", async () => {
    const suite=await runFullQualificationSuite();expect(suite.overallQualified).toBe(false);
    expect(suite.windows?.qualified).toBe(false);expect(generateQualificationReport(suite)).toContain("Overall Qualified: NO");
  });
  it("does not turn a disabled backend into qualified isolation", async () => {
    const suite=await runQualificationWithConfig({windows:{enabled:false}});
    expect(suite.windows).toBeUndefined();expect(suite.overallQualified).toBe(false);
  });
  it("refuses tool execution before reading untrusted input", async () => {
    const hostile=new Proxy({}, {get(){throw new Error("Untrusted input evaluated");}});
    await expect(Reflect.apply(executeIsolated,undefined,[createWindowsSandboxBackend(),hostile,hostile,hostile,hostile])).rejects.toThrow("Windows isolation is not qualified");
  });
});
