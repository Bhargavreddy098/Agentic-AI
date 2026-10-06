import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("detects modified tracked governance paths and nested untracked protected files", () => {
  const root = mkdtempSync(join(tmpdir(), "asi-protection-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
  try {
    mkdirSync(join(root, "docs"));
    for (const name of ["architecture-baseline", "ui-baseline", "task-ledger", "ui-task-ledger"]) {
      writeFileSync(join(root, "docs", `${name}.json`), JSON.stringify({ protectedPaths: ["packages/contracts/**"] }));
    }
    writeFileSync(join(root, "AGENTS.md"), "original");
    git("init"); git("add", ".");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "fixture");
    writeFileSync(join(root, "AGENTS.md"), "modified");
    mkdirSync(join(root, "packages/contracts/src"), { recursive: true });
    writeFileSync(join(root, "packages/contracts/src/new.ts"), "export {};");
    let output = "";
    try {
      output = execFileSync(process.execPath, [resolve("scripts/verify-protected-files.mjs"), root], { encoding: "utf8" });
    } catch (error) { output = (error as { stdout: string }).stdout; }
    const report = JSON.parse(output) as { violations: { file: string }[] };
    expect(report.violations.map(v => v.file)).toContain("AGENTS.md");
    expect(report.violations.map(v => v.file)).toContain("packages/contracts/src/new.ts");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
