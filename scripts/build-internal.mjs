// @ts-check
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();

/**
 * Recursively transpile .ts files under srcDir into outDir as ES modules.
 * @param {string} srcDir
 * @param {string} outDir
 * @param {{ useZodV4?: boolean }} [opts]
 */
function transpileTree(srcDir, outDir, opts = {}) {
  if (!fs.existsSync(srcDir)) return;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const outPath = path.join(outDir, entry.name);
    if (entry.isDirectory()) {
      transpileTree(srcPath, outPath, opts);
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      let sourceText = fs.readFileSync(srcPath, "utf8");
      if (opts.useZodV4) {
        sourceText = sourceText.replace(/from\s+["']zod["']/g, 'from "zod/v4"');
      }
      const result = ts.transpileModule(sourceText, {
        fileName: srcPath,
        compilerOptions: {
          target: ts.ScriptTarget.ES2023,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          esModuleInterop: true,
        },
      });
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      const jsOutPath = outPath.replace(/\.ts$/, ".js");
      fs.writeFileSync(jsOutPath, result.outputText, "utf8");
      const dtsOutPath = outPath.replace(/\.ts$/, ".d.ts");
      fs.writeFileSync(
        dtsOutPath,
        [
          "export type SandboxQualificationReceipt = Record<string, any>;",
          "export type ToolManifest = Record<string, any>;",
          "export type RunContext = Record<string, any>;",
          "export const SandboxQualificationReceiptSchema: any;",
          "export {};",
        ].join("\n") + "\n",
        "utf8"
      );
    }
  }
}

/**
 * Ensure workspace package symlinks exist under node_modules/@asi/*
 * @param {string} pkgName
 * @param {string} targetRelDir
 */
function ensureWorkspaceLink(pkgName, targetRelDir) {
  const linkPath = path.join(ROOT, "node_modules", pkgName);
  const targetPath = path.join(ROOT, targetRelDir);
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  try {
    fs.rmSync(linkPath, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  fs.symlinkSync(targetPath, linkPath, "dir");
}

transpileTree(
  path.join(ROOT, "packages/contracts/src"),
  path.join(ROOT, "packages/contracts/dist"),
  { useZodV4: true }
);
transpileTree(
  path.join(ROOT, "backend/modules/gateway/src"),
  path.join(ROOT, "backend/modules/gateway/dist")
);
transpileTree(
  path.join(ROOT, "backend/workers/gateway/src"),
  path.join(ROOT, "backend/workers/gateway/dist")
);

ensureWorkspaceLink("@asi/contracts", "packages/contracts");
ensureWorkspaceLink("@asi/gateway", "backend/modules/gateway");
