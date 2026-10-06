#!/usr/bin/env node
/**
 * Protected file integrity enforcement (Task 01; requirements R03, R20).
 *
 * Protected paths come from docs/architecture-baseline.json and
 * docs/ui-baseline.json. The check has two parts:
 *
 *   PROTECTED_PATH_MISSING  a governance document that must always exist is absent
 *   PROTECTED_FILE_DRIFT    a tracked protected file (or a new file matching a
 *                           protected glob) changed relative to the last commit
 *
 * Drift detection compares the working tree against HEAD, so a legitimate
 * protected-file change (for example an approved baseline update) must be
 * committed through its ADR before verification passes again. Before the
 * first commit the check reports status "pending-first-commit" and passes,
 * because nothing is protected by git yet.
 *
 * Usage: node scripts/verify-protected-files.mjs <repo-root>
 * Prints a JSON report to stdout; exits 1 when violations are found.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");

const ALWAYS_PRESENT_GOVERNANCE_FILES = [
  "AGENTS.md",
  "docs/architecture-baseline.json",
  "docs/task-ledger.json",
  "docs/ui-baseline.json",
  "docs/ui-task-ledger.json",
];

function toPosix(path) {
  return path.replaceAll("\\", "/");
}

function loadProtectedPatterns(repoRoot) {
  const patterns = new Set(ALWAYS_PRESENT_GOVERNANCE_FILES);
  for (const doc of [
    "docs/architecture-baseline.json",
    "docs/ui-baseline.json",
  ]) {
    const absolutePath = join(repoRoot, doc);
    if (!existsSync(absolutePath)) {
      continue;
    }
    const baseline = JSON.parse(readFileSync(absolutePath, "utf8"));
    for (const pattern of baseline.protectedPaths ?? []) {
      patterns.add(toPosix(pattern));
    }
  }
  return [...patterns].sort();
}

function patternToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const globbed = escaped
    .split("**")
    .map((segment) => segment.replace(/\*/g, "[^/]*"))
    .join(".*");
  return new RegExp(`^${globbed}$`);
}

function matchesAnyPattern(filePath, matchers) {
  return matchers.some((matcher) => matcher.test(filePath));
}

function gitArguments(repoRoot, arguments_) {
  return execFileSync("git", ["-C", repoRoot, ...arguments_], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitStatus(repoRoot) {
  try {
    gitArguments(repoRoot, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    return { status: "not-a-git-repo", changedFiles: [] };
  }
  try {
    gitArguments(repoRoot, ["rev-parse", "--verify", "HEAD"]);
  } catch {
    return { status: "pending-first-commit", changedFiles: [] };
  }
  const porcelain = gitArguments(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const entries = porcelain.split("\0");
  const changedFiles = [];
  // In -z output renames/copies have a second NUL-delimited source path.
  // Include it as well so moving a protected file cannot hide its removal.
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    changedFiles.push(toPosix(entry.slice(3)));
    if (entry && /^[RC]|^.[RC]/.test(entry.slice(0, 2))) {
      index += 1;
      const source = entries[index];
      if (source) changedFiles.push(toPosix(source));
    }
  }
  return { status: "enforcing", changedFiles };
}

function verifyProtectedFiles(repoRoot) {
  const violations = [];
  const patterns = loadProtectedPatterns(repoRoot);
  const matchers = patterns.map(patternToRegExp);

  for (const governanceFile of ALWAYS_PRESENT_GOVERNANCE_FILES) {
    if (!existsSync(join(repoRoot, governanceFile))) {
      violations.push({
        code: "PROTECTED_PATH_MISSING",
        rule: "PF-001",
        file: governanceFile,
        detail: `governance document ${governanceFile} must exist`,
      });
    }
  }

  const git = gitStatus(repoRoot);
  if (git.status === "enforcing") {
    for (const changedFile of git.changedFiles) {
      if (matchesAnyPattern(changedFile, matchers)) {
        violations.push({
          code: "PROTECTED_FILE_DRIFT",
          rule: "PF-002",
          file: changedFile,
          detail:
            "protected file changed relative to HEAD; protected files change only through an approved ADR and an explicit commit",
        });
      }
    }
  }

  return {
    ok: violations.length === 0,
    status: git.status,
    protectedPatternCount: patterns.length,
    violations,
  };
}

function main() {
  const repoRoot = resolve(process.argv[2] ?? repositoryRoot);
  const report = verifyProtectedFiles(repoRoot);
  console.log(
    JSON.stringify(
      {
        ...report,
        target: toPosix(relative(process.cwd(), repoRoot)) || ".",
      },
      null,
      2,
    ),
  );
  process.exit(report.ok ? 0 : 1);
}

main();
