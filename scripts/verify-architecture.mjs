#!/usr/bin/env node
/**
 * Architecture boundary enforcement (Task 01; requirements R01, R04, R20).
 *
 * Scans a workspace root and reports forbidden boundary crossings as JSON:
 *
 *   CHANNEL_MODEL_BYPASS        a Client Surface (channels) imports a model/provider SDK
 *   PROVIDER_SDK_BYPASS         any non-privacy component imports a model/provider SDK
 *   STORE_DRIVER_BYPASS         a non-store-owner component imports a database driver/ORM
 *   QUEUE_PACKAGE_BYPASS        a non-queue component imports the queue backend
 *   CROSS_APP_IMPORT            an app imports another app directly
 *   PACKAGE_IMPORTS_APP         a package imports an app
 *   CONTRACTS_INFRASTRUCTURE_IMPORT  packages/contracts production code imports non-contract
 *                                     infrastructure (zod only; vitest allowed under test paths)
 *   PRODUCTION_IMPORTS_TEST    production code imports a test-only helper, fixture or mock
 *   UNMAPPED_COMPONENT_PATH     a source path under apps/ or packages/ is not declared in the baseline
 *   BASELINE_INCONSISTENT       the machine-readable baseline lost a pictured component or flow
 *
 * Model/provider SDKs are allowed only inside the privacy service
 * (packages/privacy, packages/models). Store drivers are allowed only in the
 * declared store owners. Queue packages are allowed only in the specialist
 * fleet and the control outbox relay. Runtime behaviors that are not
 * statically checkable (credential scoping, RLS, fencing, cancellation) are
 * enforced by the integration and security suites of their owning tasks.
 *
 * Usage: node scripts/verify-architecture.mjs <scan-root>
 * Prints a JSON report to stdout; exits 1 when violations are found.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const baselinePath = join(repositoryRoot, "docs", "architecture-baseline.json");

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
]);
const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
]);
const SCAN_EXCLUSIONS = ["tests/fixtures"];

const PROVIDER_SDK_PACKAGES = new Set([
  "ai",
  "openai",
  "anthropic",
  "@ai-sdk/openai",
  "@ai-sdk/openai-compatible",
  "@ai-sdk/anthropic",
  "@ai-sdk/google",
  "@ai-sdk/google-vertex",
  "@ai-sdk/amazon-bedrock",
  "@ai-sdk/azure",
  "@ai-sdk/mistral",
  "@ai-sdk/cohere",
  "@ai-sdk/xai",
  "@ai-sdk/groq",
  "@ai-sdk/deepseek",
  "@ai-sdk/nvidia",
  "@google/genai",
  "@google/generative-ai",
  "@mistralai/mistralai",
  "@mistralai/mistralai-agents",
  "@cohere-ai/cohere-client",
  "@xai-ai/sdk",
  "groq-sdk",
  "llamaindex",
  "langchain",
  "langchain-core",
  "@langchain/core",
  "transformers",
  "@huggingface/inference",
]);

const STORE_DRIVER_ALLOWANCE = {
  pg: ["memStore", "govKernel", "control", "supervisor"],
  "@pgvector/pg": ["memStore", "control"],
  pgvector: ["memStore", "control"],
  "better-sqlite3": ["sessionFTS"],
  "node:sqlite": ["sessionFTS"],
  sqlite3: ["sessionFTS"],
  "@libsql/client": ["sessionFTS"],
};

const QUEUE_PACKAGE_ALLOWANCE = {
  bullmq: ["specialists", "control"],
  ioredis: ["specialists", "control"],
  redis: ["specialists", "control"],
};

const PROVIDER_SDK_OWNERS = new Set(["privRouter", "frontierModels"]);

const EXPECTED_COMPONENT_IDS = [
  "channels",
  "gateway",
  "supervisor",
  "specialists",
  "toolRuntime",
  "govKernel",
  "privRouter",
  "frontierModels",
  "sandbox",
  "sessionFTS",
  "consolidation",
  "memStore",
];
const EXPECTED_PRIMARY_FLOW = [
  "channels",
  "gateway",
  "supervisor",
  "specialists",
  "toolRuntime",
  "sandbox",
];

function toPosix(path) {
  return path.replaceAll("\\", "/");
}

function extractImportSpecifiers(source, filePath) {
  const specifiers = new Set();
  // Parse actual syntax so comments/quoted examples cannot create imports,
  // and comments between import tokens cannot conceal forbidden edges.
  const tree = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const add = node => { if (node && ts.isStringLiteralLike(node)) specifiers.add(node.text); };
  const visit = node => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) add(node.moduleReference.expression);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node.argument.literal);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))) add(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return [...specifiers];
}

function packageNameOf(specifier) {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("node:")
  ) {
    return null;
  }
  if (specifier.startsWith("@")) {
    const segments = specifier.split("/");
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : null;
  }
  return specifier.split("/")[0] ?? null;
}

function walkFiles(directory, collected = []) {
  if (!existsSync(directory)) {
    return collected;
  }
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return collected;
  }
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) {
        continue;
      }
      walkFiles(entryPath, collected);
    } else if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(`.${entry.name.split(".").pop() ?? ""}`)
    ) {
      collected.push(entryPath);
    }
  }
  return collected;
}

function isExcluded(relativePath) {
  return SCAN_EXCLUSIONS.some((exclusion) =>
    relativePath === exclusion || relativePath.startsWith(`${exclusion}/`),
  );
}

const NON_PRODUCTION_SEGMENTS = new Set([
  "test",
  "tests",
  "__tests__",
  "fixtures",
  "mocks",
]);

function isProductionSourcePath(relativePath) {
  const segments = relativePath.split("/");
  return !segments.some((segment) => NON_PRODUCTION_SEGMENTS.has(segment));
}

function buildComponentIndex(baseline) {
  const index = [];
  for (const [componentId, paths] of Object.entries(
    baseline.componentPaths ?? {},
  )) {
    for (const componentPath of paths) {
      index.push({ componentId, prefix: toPosix(componentPath) });
    }
  }
  return index.sort((left, right) => right.prefix.length - left.prefix.length);
}

function classifyComponent(index, relativePath) {
  for (const entry of index) {
    if (
      relativePath === entry.prefix ||
      relativePath.startsWith(`${entry.prefix}/`)
    ) {
      return entry.componentId;
    }
  }
  return null;
}

function collectAppRootsAndNames(target) {
  const roots = [];
  const packageNames = new Map();
  const appsDirectory = join(target, "apps");
  if (!existsSync(appsDirectory)) {
    return { roots, packageNames };
  }
  for (const entry of readdirSync(appsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const appRoot = join(appsDirectory, entry.name);
    roots.push(appRoot);
    const manifestPath = join(appRoot, "package.json");
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        if (typeof manifest.name === "string") {
          packageNames.set(manifest.name, entry.name);
        }
      } catch {
        // Malformed manifests are reported by verify-dependencies, not here.
      }
    }
  }
  return { roots, packageNames };
}

function containingAppRoot(roots, absolutePath) {
  for (const root of roots) {
    if (absolutePath === root || absolutePath.startsWith(`${root}${sep()}`)) {
      return root;
    }
  }
  return null;
}

function sep() {
  return "/";
}

function checkBaselineConsistency(baseline, violations) {
  const componentIds = (baseline.components ?? []).map(
    (component) => component.id,
  );
  const missingComponents = EXPECTED_COMPONENT_IDS.filter(
    (id) => !componentIds.includes(id),
  );
  const extraComponents = componentIds.filter(
    (id) => !EXPECTED_COMPONENT_IDS.includes(id),
  );
  if (missingComponents.length > 0 || extraComponents.length > 0) {
    violations.push({
      code: "BASELINE_INCONSISTENT",
      rule: "ARCH-010",
      file: "docs/architecture-baseline.json",
      specifier: null,
      component: null,
      detail: `baseline component IDs must preserve the 12 pictured components exactly; missing=[${missingComponents.join(",")}] extra=[${extraComponents.join(",")}]`,
    });
  }
  const primaryFlow = baseline.primaryFlow ?? [];
  if (JSON.stringify(primaryFlow) !== JSON.stringify(EXPECTED_PRIMARY_FLOW)) {
    violations.push({
      code: "BASELINE_INCONSISTENT",
      rule: "ARCH-011",
      file: "docs/architecture-baseline.json",
      specifier: null,
      component: null,
      detail: `primary flow must remain ${EXPECTED_PRIMARY_FLOW.join(" -> ")}; found ${primaryFlow.join(" -> ") || "(empty)"}`,
    });
  }
  for (const flow of ["inferenceFlow", "learningFlow"]) {
    if (!Array.isArray(baseline[flow]) || baseline[flow].length === 0) {
      violations.push({
        code: "BASELINE_INCONSISTENT",
        rule: "ARCH-012",
        file: "docs/architecture-baseline.json",
        specifier: null,
        component: null,
        detail: `baseline must preserve the pictured ${flow}`,
      });
    }
  }
  const requirements = baseline.requirements ?? [];
  for (let index = 1; index <= 24; index += 1) {
    const requirementId = `R${String(index).padStart(2, "0")}`;
    const requirement = requirements.find((entry) => entry.id === requirementId);
    if (
      !requirement ||
      !Array.isArray(requirement.taskIds) ||
      requirement.taskIds.length === 0 ||
      requirement.finalConformanceTask !== "30"
    ) {
      violations.push({
        code: "BASELINE_INCONSISTENT",
        rule: "ARCH-013",
        file: "docs/architecture-baseline.json",
        specifier: null,
        component: null,
        detail: `requirement ${requirementId} must map to at least one task and to final conformance task 30`,
      });
    }
  }
  if (!baseline.componentPaths || Object.keys(baseline.componentPaths).length === 0) {
    violations.push({
      code: "BASELINE_INCONSISTENT",
      rule: "ARCH-014",
      file: "docs/architecture-baseline.json",
      specifier: null,
      component: null,
      detail: "baseline must declare componentPaths for import-graph enforcement",
    });
  }
}

function verifyArchitecture(target, baseline) {
  const violations = [];
  checkBaselineConsistency(baseline, violations);

  const componentIndex = buildComponentIndex(baseline);
  const { roots: appRoots, packageNames: appPackageNames } =
    collectAppRootsAndNames(target);

  const allSourceFiles = walkFiles(target);
  let scannedFiles = 0;

  for (const filePath of allSourceFiles) {
    const relativePath = toPosix(relative(target, filePath));
    if (isExcluded(relativePath)) {
      continue;
    }
    scannedFiles += 1;

    const component = classifyComponent(componentIndex, relativePath);

    if (
      (relativePath.startsWith("apps/") || relativePath.startsWith("packages/")) &&
      component === null
    ) {
      violations.push({
        code: "UNMAPPED_COMPONENT_PATH",
        rule: "ARCH-009",
        file: relativePath,
        specifier: null,
        component: null,
        detail:
          "source path is not declared in baseline componentPaths; add it through an approved baseline change (protected file) before implementation",
      });
    }

    let source;
    try {
      source = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    for (const specifier of extractImportSpecifiers(source, filePath)) {
      // Test-only database fixtures must never become a production driver bypass.
      const importPath = specifier.startsWith(".")
        ? toPosix(relative(target, resolve(dirname(filePath), specifier)))
        : specifier;
      if ((relativePath.startsWith("apps/") || relativePath.startsWith("packages/")) &&
          isProductionSourcePath(relativePath) && !isProductionSourcePath(importPath)) {
        violations.push({
          code: "PRODUCTION_IMPORTS_TEST",
          rule: "ARCH-015",
          file: relativePath,
          specifier,
          component,
          detail: "Production code must use its reviewed owner port, never test-only helpers, fixtures or mocks",
        });
      }
      const packageName = packageNameOf(specifier);

      if (specifier === "node:sqlite") {
        const allowed = STORE_DRIVER_ALLOWANCE["node:sqlite"] ?? [];
        if (!allowed.includes(component)) {
          violations.push({
            code: "STORE_DRIVER_BYPASS",
            rule: "ARCH-002",
            file: relativePath,
            specifier,
            component,
            detail: `component '${component ?? "unmapped"}' must not import the built-in SQLite driver; only the episodic owner (sessionFTS) may hold the SQLite file`,
          });
        }
        continue;
      }

      if (packageName && PROVIDER_SDK_PACKAGES.has(packageName)) {
        if (!PROVIDER_SDK_OWNERS.has(component)) {
          violations.push({
            code:
              component === "channels"
                ? "CHANNEL_MODEL_BYPASS"
                : "PROVIDER_SDK_BYPASS",
            rule: "ARCH-001",
            file: relativePath,
            specifier,
            component,
            detail: `component '${component ?? "unmapped"}' must not import provider SDK '${packageName}'; every model call traverses the privacy router (packages/privacy, packages/models)`,
          });
        }
        continue;
      }

      if (packageName && Object.hasOwn(STORE_DRIVER_ALLOWANCE, packageName)) {
        const allowed = STORE_DRIVER_ALLOWANCE[packageName];
        if (!allowed.includes(component)) {
          violations.push({
            code: "STORE_DRIVER_BYPASS",
            rule: "ARCH-002",
            file: relativePath,
            specifier,
            component,
            detail: `component '${component ?? "unmapped"}' must not import store driver/ORM '${packageName}'; allowed owners are ${allowed.join(", ")}`,
          });
        }
        continue;
      }

      if (packageName && Object.hasOwn(QUEUE_PACKAGE_ALLOWANCE, packageName)) {
        const allowed = QUEUE_PACKAGE_ALLOWANCE[packageName];
        if (!allowed.includes(component)) {
          violations.push({
            code: "QUEUE_PACKAGE_BYPASS",
            rule: "ARCH-003",
            file: relativePath,
            specifier,
            component,
            detail: `component '${component ?? "unmapped"}' must not import queue package '${packageName}'; allowed owners are ${allowed.join(", ")}`,
          });
        }
        continue;
      }

      const importedApp = packageName ? appPackageNames.get(packageName) : null;
      if (importedApp) {
        const importerApp = containingAppRoot(
          appRoots,
          resolve(target, relativePath),
        );
        if (importerApp && importerApp !== join(target, "apps", importedApp)) {
          violations.push({
            code: "CROSS_APP_IMPORT",
            rule: "ARCH-004",
            file: relativePath,
            specifier,
            component,
            detail: `direct import of app package '${packageName}' (apps/${importedApp}); apps are composition roots and must not import each other`,
          });
        }
        continue;
      }

      if (specifier.startsWith(".")) {
        const resolved = resolve(dirname(filePath), specifier);
        const targetAppRoot = containingAppRoot(appRoots, resolved);
        const importerAppRoot = containingAppRoot(appRoots, filePath);
        if (
          importerAppRoot &&
          targetAppRoot &&
          importerAppRoot !== targetAppRoot
        ) {
          violations.push({
            code: "CROSS_APP_IMPORT",
            rule: "ARCH-004",
            file: relativePath,
            specifier,
            component,
            detail: `relative import crosses app boundaries (${toPosix(relative(target, filePath))} -> ${toPosix(relative(target, resolved))}); apps must communicate through packages only`,
          });
        } else if (!importerAppRoot && targetAppRoot) {
          violations.push({
            code: "PACKAGE_IMPORTS_APP",
            rule: "ARCH-005",
            file: relativePath,
            specifier,
            component,
            detail: `package import reaches into an app (${toPosix(relative(target, resolved))}); dependency direction is apps -> packages, never packages -> apps`,
          });
        }
        continue;
      }

      if (
        component === "contracts" &&
        packageName &&
        packageName !== "zod" &&
        !(
          !isProductionSourcePath(relativePath) &&
          packageName === "vitest"
        )
      ) {
        violations.push({
          code: "CONTRACTS_INFRASTRUCTURE_IMPORT",
          rule: "ARCH-006",
          file: relativePath,
          specifier,
          component,
          detail: `packages/contracts must not import infrastructure package '${packageName}'; contracts are pure schemas (zod only; the test runner is permitted only under test directories)`,
        });
      }
    }
  }

  return {
    ok: violations.length === 0,
    scannedFiles,
    violations,
  };
}

function main() {
  const scanTarget = resolve(process.argv[2] ?? repositoryRoot);
  if (!existsSync(baselinePath)) {
    console.error(
      JSON.stringify({ ok: false, error: `baseline not found: ${baselinePath}` }),
    );
    process.exit(2);
  }
  if (!existsSync(scanTarget)) {
    console.error(
      JSON.stringify({ ok: false, error: `scan target not found: ${scanTarget}` }),
    );
    process.exit(2);
  }
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const report = verifyArchitecture(scanTarget, baseline);
  console.log(
    JSON.stringify(
      {
        ...report,
        target: toPosix(relative(process.cwd(), scanTarget)) || ".",
        baseline: "docs/architecture-baseline.json",
      },
      null,
      2,
    ),
  );
  process.exit(report.ok ? 0 : 1);
}

main();
