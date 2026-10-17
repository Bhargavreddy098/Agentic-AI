#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] ?? "dev";

function linkWorkspacePackages() {
  const scopeDir = join(rootDir, "node_modules", "@asi");
  mkdirSync(scopeDir, { recursive: true });
  for (const group of ["packages", "apps"]) {
    const baseDir = join(rootDir, group);
    if (!existsSync(baseDir)) continue;
    for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkgDir = join(baseDir, entry.name);
      const manifestPath = join(pkgDir, "package.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (typeof manifest.name !== "string" || !manifest.name.startsWith("@asi/")) continue;
      const shortName = manifest.name.slice("@asi/".length);
      const linkPath = join(scopeDir, shortName);
      try {
        rmSync(linkPath, { recursive: true, force: true });
      } catch {
        // ignore
      }
      symlinkSync(pkgDir, linkPath, "dir");
    }
  }
}

function runTsc(tsconfigRelPath) {
  const tscBin = join(rootDir, "node_modules", "typescript", "bin", "tsc");
  execFileSync(process.execPath, [tscBin, "-p", join(rootDir, tsconfigRelPath)], {
    cwd: rootDir,
    stdio: "inherit",
  });
}

function buildCorePackages() {
  linkWorkspacePackages();
  const buildOrder = [
    "packages/contracts/tsconfig.json",
    "packages/ui/tsconfig.json",
    "packages/identity/tsconfig.json",
    "packages/control/tsconfig.json",
    "packages/policy/tsconfig.json",
    "packages/episodic/tsconfig.json",
    "packages/telemetry/tsconfig.json",
    "packages/privacy/tsconfig.json",
    "packages/models/tsconfig.json",
    "packages/context/tsconfig.json",
    "packages/channels/tsconfig.json",
    "packages/protocols/tsconfig.json",
    "packages/budgets/tsconfig.json",
    "packages/audit/tsconfig.json",
    "packages/skills/tsconfig.json",
    "packages/sandbox/tsconfig.json",
    "packages/tools/tsconfig.json",
    "packages/specialists/tsconfig.json",
    "packages/memory/tsconfig.json",
    "packages/orchestrator/tsconfig.json",
    "packages/gateway/tsconfig.json",
    "apps/gateway-fixture/tsconfig.json",
    "apps/gateway/tsconfig.json",
  ];
  for (const configPath of buildOrder) {
    if (existsSync(join(rootDir, configPath))) {
      runTsc(configPath);
    }
  }
}

function runNextBuild() {
  const nextBin = join(rootDir, "node_modules", "next", "dist", "bin", "next");
  execFileSync(process.execPath, [nextBin, "build"], {
    cwd: join(rootDir, "apps", "web"),
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_ASI_UI_MODE: process.env.NEXT_PUBLIC_ASI_UI_MODE ?? "demo",
    },
  });
}

function runTypecheck() {
  linkWorkspacePackages();
  const tscBin = join(rootDir, "node_modules", "typescript", "bin", "tsc");
  execFileSync(process.execPath, [tscBin, "-p", join(rootDir, "packages/ui/tsconfig.json"), "--noEmit"], {
    cwd: rootDir,
    stdio: "inherit",
  });
  execFileSync(process.execPath, [tscBin, "-p", join(rootDir, "apps/web/tsconfig.json"), "--noEmit"], {
    cwd: join(rootDir, "apps", "web"),
    stdio: "inherit",
  });
}

async function startDevOrProd(isStart) {
  buildCorePackages();
  const fixtureEntry = join(rootDir, "apps", "gateway-fixture", "dist", "main.js");
  const fixtureEnv = { ...process.env, NODE_ENV: "development" };
  const fixtureProc = spawn(process.execPath, [fixtureEntry], {
    cwd: rootDir,
    stdio: "inherit",
    env: fixtureEnv,
  });

  const nextBin = join(rootDir, "node_modules", "next", "dist", "bin", "next");
  const nextArgs = isStart
    ? [nextBin, "start", "--hostname", "0.0.0.0", "--port", "3000"]
    : [nextBin, "dev", "--hostname", "0.0.0.0", "--port", "3000"];

  if (isStart && !existsSync(join(rootDir, "apps", "web", ".next", "BUILD_ID"))) {
    runNextBuild();
  }

  const webProc = spawn(process.execPath, nextArgs, {
    cwd: join(rootDir, "apps", "web"),
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_ASI_UI_MODE: process.env.NEXT_PUBLIC_ASI_UI_MODE ?? "demo",
    },
  });

  const cleanup = () => {
    fixtureProc.kill();
    webProc.kill();
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  webProc.on("exit", (code) => {
    fixtureProc.kill();
    process.exit(code ?? 0);
  });
}

if (mode === "build") {
  buildCorePackages();
  runNextBuild();
} else if (mode === "gateway-build") {
  buildCorePackages();
} else if (mode === "typecheck") {
  buildCorePackages();
  runTypecheck();
} else if (mode === "start") {
  await startDevOrProd(true);
} else {
  await startDevOrProd(false);
}
