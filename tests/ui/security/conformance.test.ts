import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { UiEventTypeSchema } from "../../../packages/contracts/src/ui/index.js";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");

export type Violation = { code: string; file: string; detail: string };

const sevenRoutes = ["chat", "models", "skills", "connections", "memory", "activity", "settings"];
const forbiddenRoutes = ["approvals", "approval", "questions", "agents", "agent", "goals", "projects", "dashboard"];
const approvalCallAllowlist = [
  "apps/web/src/lib/gateway/client.ts",
  "apps/web/src/lib/gateway/http-client.ts",
  "apps/web/src/features/chat/ChatFrame.tsx",
];
const providerPackages = [
  "openai", "@anthropic-ai/sdk", "anthropic", "@google/generative-ai", "@google/genai",
  "ai", "@ai-sdk/openai", "@ai-sdk/anthropic", "@ai-sdk/google", "langchain", "@langchain/core",
];

function walk(directory: string, names: string[] = []): string[] {
  if (!existsSync(directory)) return names;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, names);
    else names.push(path);
  }
  return names;
}

const relativeTo = (root: string, path: string) => relative(root, path).replaceAll("\\", "/");
const sourceFiles = (root: string, base: string) => walk(join(root, base)).filter(path => /\.[cm]?[jt]sx?$/.test(path));
const read = (path: string) => readFileSync(path, "utf8");
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function scanRoutes(root: string): Violation[] {
  const violations: Violation[] = [];
  const workspace = join(root, "apps/web/src/app/(workspace)");
  const directories = existsSync(workspace)
    ? readdirSync(workspace, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
    : [];
  for (const name of directories) {
    if (!sevenRoutes.includes(name)) violations.push({ code: "EXTRA_PRIMARY_ROUTE", file: `apps/web/src/app/(workspace)/${name}`, detail: "only the seven approved sections may be primary routes" });
    if (forbiddenRoutes.includes(name)) violations.push({ code: "FORBIDDEN_NAVIGATION_ROUTE", file: `apps/web/src/app/(workspace)/${name}`, detail: "no approval, question, agent, goal, project or dashboard page is allowed" });
  }
  for (const name of sevenRoutes) {
    if (!directories.includes(name)) violations.push({ code: "MISSING_PRIMARY_ROUTE", file: `apps/web/src/app/(workspace)/${name}`, detail: "approved primary section is missing" });
  }
  for (const path of walk(join(root, "apps/web/src/app"))) {
    const file = relativeTo(root, path);
    if (/(^|\/)route\.[tj]sx?$/.test(file)) violations.push({ code: "NEXT_API_ROUTE", file, detail: "the web app must not host Next route handlers or provider generation endpoints" });
  }
  return violations;
}

export function scanApprovalOwnership(root: string): Violation[] {
  const violations: Violation[] = [];
  for (const path of sourceFiles(root, "apps/web/src")) {
    const file = relativeTo(root, path);
    const source = read(path);
    if (!/\bdecideApproval\b/.test(source)) continue;
    if (!approvalCallAllowlist.includes(file)) violations.push({ code: "FEATURE_OWNED_APPROVAL_HANDLER", file, detail: "only the canonical approval route may decide approvals" });
    if (/clarification/i.test(file)) violations.push({ code: "QUESTION_AS_APPROVAL", file, detail: "a clarification must answer a question, never decide an approval" });
  }
  return violations;
}

export function scanProviderImports(root: string): Violation[] {
  const violations: Violation[] = [];
  for (const base of ["apps/web/src", "packages/ui/src"]) {
    for (const path of sourceFiles(root, base)) {
      const source = read(path);
      for (const pkg of providerPackages) {
        const pattern = new RegExp(`(?:from\\s+["']${escapeRegExp(pkg)}(?:/[^"']*)?["']|require\\(\\s*["']${escapeRegExp(pkg)}["']\\s*\\))`);
        if (pattern.test(source)) violations.push({ code: "DIRECT_PROVIDER_IMPORT", file: relativeTo(root, path), detail: `provider client ${pkg} must be reached through the Gateway` });
      }
    }
  }
  return violations;
}

export function scanStoreOwnership(root: string): Violation[] {
  const violations: Violation[] = [];
  const sources = sourceFiles(root, "apps/web/src");
  const constructions = sources.filter(path => /\bnew\s+ChatStore\s*\(/.test(read(path)));
  if (constructions.length !== 1 || relativeTo(root, constructions[0]!) !== "apps/web/src/features/shell/WorkspaceProvider.tsx") {
    violations.push({ code: "COMPETING_CHAT_STORE", file: constructions.map(path => relativeTo(root, path)).sort().join(",") || "(none)", detail: "exactly one WorkspaceProvider may construct the shared chat store" });
  }
  const owners = sources.filter(path => /class\s+ChatStore\b/.test(read(path)));
  if (owners.length !== 1 || relativeTo(root, owners[0]!) !== "apps/web/src/lib/chat/store.ts") {
    violations.push({ code: "MULTIPLE_CHAT_STORES", file: owners.map(path => relativeTo(root, path)).sort().join(",") || "(none)", detail: "one chat store owner is allowed" });
  }
  const inventoryPath = join(root, "docs/ui-component-inventory.json");
  if (!existsSync(inventoryPath)) violations.push({ code: "OWNER_DRIFT", file: "docs/ui-component-inventory.json", detail: "recorded component source inventory is missing" });
  else {
    const inventory = JSON.parse(read(inventoryPath)) as { stateOwner?: string; gatewayOwner?: string };
    if (inventory.stateOwner !== "apps/web/src/lib/chat" || inventory.gatewayOwner !== "apps/web/src/lib/gateway") {
      violations.push({ code: "OWNER_DRIFT", file: "docs/ui-component-inventory.json", detail: "recorded state/transport owner changed without a reviewed decision" });
    }
  }
  return violations;
}

export function scanWireSchema(root: string, eventTypes: readonly string[]): Violation[] {
  const contractsPath = join(root, "packages/contracts/src/ui/index.ts");
  const evidencePath = join(root, "docs/release-evidence/ui-wire-compatibility.json");
  if (!existsSync(contractsPath)) return [{ code: "WIRE_SCHEMA_EVIDENCE_MISSING", file: "packages/contracts/src/ui/index.ts", detail: "wire contract source is missing" }];
  if (!existsSync(evidencePath)) return [{ code: "WIRE_SCHEMA_EVIDENCE_MISSING", file: "docs/release-evidence/ui-wire-compatibility.json", detail: "a modified wire schema requires recorded compatibility evidence" }];
  const digest = createHash("sha256").update(read(contractsPath).replaceAll("\r\n", "\n")).digest("hex");
  const evidence = JSON.parse(read(evidencePath)) as { schemaVersion?: number; sourceDigest?: string; eventTypes?: string[] };
  const violations: Violation[] = [];
  if (evidence.schemaVersion !== 1) violations.push({ code: "WIRE_SCHEMA_VERSION_DRIFT", file: "docs/release-evidence/ui-wire-compatibility.json", detail: "recorded wire schema version changed" });
  if (evidence.sourceDigest !== digest) violations.push({ code: "WIRE_SCHEMA_CHANGED_WITHOUT_EVIDENCE", file: "packages/contracts/src/ui/index.ts", detail: "contracts changed without updating recorded compatibility evidence" });
  if (JSON.stringify(evidence.eventTypes ?? []) !== JSON.stringify([...eventTypes])) violations.push({ code: "WIRE_EVENT_TYPE_DRIFT", file: "docs/release-evidence/ui-wire-compatibility.json", detail: "event catalog changed without compatibility evidence" });
  return violations;
}

function runSourceScript(name: string, root: string): { ok: boolean; violations: { code: string }[] } {
  let output: string;
  try {
    output = execFileSync(process.execPath, [resolve(repoRoot, `scripts/${name}.mjs`), root], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    output = (error as { stdout?: string }).stdout ?? "";
  }
  return JSON.parse(output) as { ok: boolean; violations: { code: string }[] };
}

describe("repository conformance", () => {
  it("keeps exactly seven primary routes with no approval, agent, goal, project or Next generation route", () => {
    expect(scanRoutes(repoRoot)).toEqual([]);
  });
  it("keeps approvals in the canonical Chat handler and clarifications separate", () => {
    expect(scanApprovalOwnership(repoRoot)).toEqual([]);
    const clarification = read(join(repoRoot, "apps/web/src/features/chat/ClarificationCard.tsx"));
    expect(clarification).toMatch(/onSubmit/);
    expect(clarification).not.toMatch(/decideApproval/);
  });
  it("reaches providers only through the Gateway client", () => {
    expect(scanProviderImports(repoRoot)).toEqual([]);
  });
  it("keeps one shared chat store and the recorded state/transport owners", () => {
    expect(scanStoreOwnership(repoRoot)).toEqual([]);
  });
  it("qualifies component sources, licenses and vendor wrappers", () => {
    expect(runSourceScript("verify-ui-sources", repoRoot).ok).toBe(true);
    expect(runSourceScript("verify-ui-boundaries", repoRoot).ok).toBe(true);
  });
  it("pins the wire schema to recorded compatibility evidence", () => {
    expect(scanWireSchema(repoRoot, UiEventTypeSchema.options)).toEqual([]);
  });
});

describe("conformance checks reject drift", () => {
  it("accepts equivalent Windows and Git checkout line endings but rejects changed schema text", () => {
    const root = mkdtempSync(join(tmpdir(), "asi-wire-newlines-"));
    try {
      mkdirSync(join(root, "packages/contracts/src/ui"), { recursive: true });
      mkdirSync(join(root, "docs/release-evidence"), { recursive: true });
      const source = "export const schemaVersion = 1;\nexport const eventType = 'notice';\n";
      const file = join(root, "packages/contracts/src/ui/index.ts");
      writeFileSync(join(root, "docs/release-evidence/ui-wire-compatibility.json"), JSON.stringify({ schemaVersion: 1, sourceDigest: createHash("sha256").update(source).digest("hex"), eventTypes: [] }));
      writeFileSync(file, source);
      expect(scanWireSchema(root, [])).toEqual([]);
      writeFileSync(file, source.replaceAll("\n", "\r\n"));
      expect(scanWireSchema(root, [])).toEqual([]);
      writeFileSync(file, source.replace("schemaVersion = 1", "schemaVersion = 2"));
      expect(scanWireSchema(root, []).map(item => item.code)).toContain("WIRE_SCHEMA_CHANGED_WITHOUT_EVIDENCE");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("flags an eighth route, question-as-approval, direct provider import, competing store, Next route and changed wire schema", () => {
    const root = mkdtempSync(join(tmpdir(), "asi-ui-conformance-"));
    try {
      for (const name of sevenRoutes) {
        mkdirSync(join(root, `apps/web/src/app/(workspace)/${name}`), { recursive: true });
        writeFileSync(join(root, `apps/web/src/app/(workspace)/${name}/page.tsx`), "export default function Page() { return null; }\n");
      }
      mkdirSync(join(root, "apps/web/src/app/(workspace)/approvals"), { recursive: true });
      writeFileSync(join(root, "apps/web/src/app/(workspace)/approvals/page.tsx"), "export default function Page() { return null; }\n");
      mkdirSync(join(root, "apps/web/src/app/api/generate"), { recursive: true });
      writeFileSync(join(root, "apps/web/src/app/api/generate/route.ts"), "export function POST() { return new Response(); }\n");
      mkdirSync(join(root, "apps/web/src/features/chat"), { recursive: true });
      writeFileSync(join(root, "apps/web/src/features/chat/ClarificationCard.tsx"), "export const decideApproval = () => client.decideApproval;\n");
      mkdirSync(join(root, "apps/web/src/features/models"), { recursive: true });
      writeFileSync(join(root, "apps/web/src/features/models/Provider.tsx"), 'import OpenAI from "openai";\nexport const client = OpenAI;\n');
      mkdirSync(join(root, "apps/web/src/lib/chat"), { recursive: true });
      writeFileSync(join(root, "apps/web/src/lib/chat/store.ts"), "export class ChatStore {}\n");
      mkdirSync(join(root, "apps/web/src/features/shell"), { recursive: true });
      writeFileSync(join(root, "apps/web/src/features/shell/WorkspaceProvider.tsx"), "export const s = new ChatStore(client);\n");
      writeFileSync(join(root, "apps/web/src/features/models/Alt.tsx"), "export class ChatStore {}\nexport const s = new ChatStore(client);\n");
      mkdirSync(join(root, "docs/release-evidence"), { recursive: true });
      writeFileSync(join(root, "docs/ui-component-inventory.json"), JSON.stringify({ stateOwner: "apps/web/src/lib/chat/store.ts", gatewayOwner: "apps/web/src/lib/gateway" }));
      writeFileSync(join(root, "docs/release-evidence/ui-wire-compatibility.json"), JSON.stringify({ schemaVersion: 1, sourceDigest: "0".repeat(64), eventTypes: [] }));
      mkdirSync(join(root, "packages/contracts/src/ui"), { recursive: true });
      writeFileSync(join(root, "packages/contracts/src/ui/index.ts"), "export const changed = true;\n");

      const codes = [
        ...scanRoutes(root),
        ...scanApprovalOwnership(root),
        ...scanProviderImports(root),
        ...scanStoreOwnership(root),
        ...scanWireSchema(root, []),
      ].map(item => item.code);
      for (const expected of [
        "EXTRA_PRIMARY_ROUTE", "FORBIDDEN_NAVIGATION_ROUTE", "NEXT_API_ROUTE", "FEATURE_OWNED_APPROVAL_HANDLER",
        "QUESTION_AS_APPROVAL", "DIRECT_PROVIDER_IMPORT", "COMPETING_CHAT_STORE", "MULTIPLE_CHAT_STORES",
        "OWNER_DRIFT", "WIRE_SCHEMA_CHANGED_WITHOUT_EVIDENCE",
      ]) expect(codes).toContain(expected);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
