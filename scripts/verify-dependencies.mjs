#!/usr/bin/env node
/**
 * Dependency pin and approval enforcement (Task 01; requirements R20, R24).
 *
 * Scans package.json manifests under a workspace root and reports:
 *
 *   UNPINNED_DEPENDENCY       a dependency specifier is a range, tag, or
 *                             protocol other than the exact internal "workspace:*"
 *   UNAPPROVED_DEPENDENCY     an exact version is absent from, or mismatched
 *                             against, docs/dependency-inventory.json
 *   UNRESOLVED_WORKSPACE_DEPENDENCY  "workspace:*" names no workspace package
 *   MALFORMED_MANIFEST        a package.json is not valid JSON
 *   ESM_MODULE_TYPE           the root manifest is not pure ESM ("type": "module")
 *   PACKAGE_MANAGER_PIN       the root manifest does not pin the qualified pnpm
 *   NODE_VERSION_PIN          the root manifest does not pin the qualified Node
 *
 * Peer dependencies follow the same exact-pin rule; a range peer requires an
 * approved ADR (R24). Internal workspace dependencies must use "workspace:*".
 *
 * Usage: node scripts/verify-dependencies.mjs <scan-root>
 * Prints a JSON report to stdout; exits 1 when violations are found.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const inventoryPath = join(repositoryRoot, "docs", "dependency-inventory.json");

const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const ALLOWED_INTERNAL_PROTOCOL = "workspace:*";
const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
]);
const SCAN_EXCLUSIONS = ["tests/fixtures"];

function toPosix(path) {
  return path.replaceAll("\\", "/");
}

function isExcluded(relativePath) {
  return SCAN_EXCLUSIONS.some(
    (exclusion) =>
      relativePath === exclusion || relativePath.startsWith(`${exclusion}/`),
  );
}

function discoverManifests(target) {
  const manifests = [];
  const walk = (directory) => {
    if (!existsSync(directory)) {
      return;
    }
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) {
          continue;
        }
        walk(entryPath);
      } else if (entry.isFile() && entry.name === "package.json") {
        const relativePath = toPosix(relative(target, entryPath));
        if (!isExcluded(relativePath)) {
          manifests.push(entryPath);
        }
      }
    }
  };
  walk(target);
  return manifests.sort();
}

function readManifest(manifestPath) {
  try {
    return { manifest: JSON.parse(readFileSync(manifestPath, "utf8")) };
  } catch (error) {
    return { error: String(error) };
  }
}

function verifyDependencies(target, inventory) {
  const violations = [];
  const approved = new Map();
  for (const entry of inventory.approved ?? []) {
    approved.set(entry.name, entry.version);
  }
  const toolchain = inventory.toolchain ?? {};

  const manifestPaths = discoverManifests(target);
  const workspaceNames = new Set();
  for (const manifestPath of manifestPaths) {
    const { manifest } = readManifest(manifestPath);
    if (manifest && typeof manifest.name === "string") {
      workspaceNames.add(manifest.name);
    }
  }

  for (const manifestPath of manifestPaths) {
    const file = toPosix(relative(target, manifestPath));
    const isRootManifest =
      resolve(manifestPath) === resolve(target, "package.json");
    const { manifest, error } = readManifest(manifestPath);
    if (error || !manifest) {
      violations.push({
        code: "MALFORMED_MANIFEST",
        rule: "DEP-000",
        file,
        package: null,
        spec: null,
        detail: `package.json could not be parsed: ${error}`,
      });
      continue;
    }

    if (isRootManifest) {
      if (manifest.type !== "module") {
        violations.push({
          code: "ESM_MODULE_TYPE",
          rule: "DEP-010",
          file,
          package: null,
          spec: null,
          detail: 'root manifest must declare "type": "module" (pure ESM workspace)',
        });
      }
      if (manifest.packageManager !== toolchain.packageManagerField) {
        violations.push({
          code: "PACKAGE_MANAGER_PIN",
          rule: "DEP-011",
          file,
          package: null,
          spec: manifest.packageManager ?? null,
          detail: `root manifest must pin packageManager "${toolchain.packageManagerField}"`,
        });
      }
      if (manifest.engines?.node !== toolchain.node) {
        violations.push({
          code: "NODE_VERSION_PIN",
          rule: "DEP-012",
          file,
          package: null,
          spec: manifest.engines?.node ?? null,
          detail: `root manifest must pin engines.node "${toolchain.node}"`,
        });
      }
    }

    for (const section of DEPENDENCY_SECTIONS) {
      const entries = manifest[section];
      if (!entries || typeof entries !== "object") {
        continue;
      }
      for (const [name, spec] of Object.entries(entries)) {
        if (typeof spec !== "string") {
          violations.push({
            code: "UNPINNED_DEPENDENCY",
            rule: "DEP-001",
            file,
            package: name,
            spec: String(spec),
            detail: `${section}.${name} must be a string specifier`,
          });
          continue;
        }
        if (spec === ALLOWED_INTERNAL_PROTOCOL) {
          if (!workspaceNames.has(name)) {
            violations.push({
              code: "UNRESOLVED_WORKSPACE_DEPENDENCY",
              rule: "DEP-003",
              file,
              package: name,
              spec,
              detail: `${section}.${name} uses ${ALLOWED_INTERNAL_PROTOCOL} but no workspace package declares that name`,
            });
          }
          continue;
        }
        if (!EXACT_VERSION_PATTERN.test(spec)) {
          violations.push({
            code: "UNPINNED_DEPENDENCY",
            rule: "DEP-001",
            file,
            package: name,
            spec,
            detail: `${section}.${name} must be an exact version (no ^, ~, *, tags, or ranges); found "${spec}"`,
          });
          continue;
        }
        const approvedVersion = approved.get(name);
        if (approvedVersion === undefined) {
          violations.push({
            code: "UNAPPROVED_DEPENDENCY",
            rule: "DEP-002",
            file,
            package: name,
            spec,
            detail: `${section}.${name}@${spec} is not in docs/dependency-inventory.json; qualify it through the inventory gate before use`,
          });
          continue;
        }
        if (approvedVersion !== spec) {
          violations.push({
            code: "UNAPPROVED_DEPENDENCY",
            rule: "DEP-002",
            file,
            package: name,
            spec,
            detail: `${section}.${name}@${spec} does not match the approved version ${approvedVersion}`,
          });
        }
      }
    }
  }

  return {
    ok: violations.length === 0,
    manifestCount: manifestPaths.length,
    violations,
  };
}

function main() {
  const scanTarget = resolve(process.argv[2] ?? repositoryRoot);
  if (!existsSync(inventoryPath)) {
    console.error(
      JSON.stringify({ ok: false, error: `inventory not found: ${inventoryPath}` }),
    );
    process.exit(2);
  }
  if (!existsSync(scanTarget)) {
    console.error(
      JSON.stringify({ ok: false, error: `scan target not found: ${scanTarget}` }),
    );
    process.exit(2);
  }
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
  const report = verifyDependencies(scanTarget, inventory);
  console.log(
    JSON.stringify(
      {
        ...report,
        target: toPosix(relative(process.cwd(), scanTarget)) || ".",
        inventory: "docs/dependency-inventory.json",
      },
      null,
      2,
    ),
  );
  process.exit(report.ok ? 0 : 1);
}

main();
