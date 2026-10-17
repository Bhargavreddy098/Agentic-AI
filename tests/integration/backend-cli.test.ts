import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "../..");
const entrypoints = [
  ["gateway", "GATEWAY_SIGNING_KEY"],
  ["episodic-owner", "EPISODIC_SIGNING_KEY"],
  ["memory-broker", "MEMORY_BROKER_SIGNING_KEY"],
  ["privacy-router", "PRIVACY_ROUTER_SIGNING_KEY"],
  ["tool-engine", "TOOL_ENGINE_SIGNING_KEY"],
  ["orchestrator", "ORCHESTRATOR_SIGNING_KEY"],
  ["specialist", "SPECIALIST_SIGNING_KEY"],
] as const;

interface EntrypointResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

function runWithoutCredentials(app: string): Promise<EntrypointResult> {
  // Copy only OS runtime paths. No signing, database, provider, or Node preload settings survive.
  const environment: NodeJS.ProcessEnv = { NODE_ENV: "test" };
  for (const name of ["SystemRoot", "WINDIR", "TEMP", "TMP"]) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }

  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [resolve(workspace, "apps", app, "src/main.ts")], {
      cwd: workspace,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, 4000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout = (stdout + chunk).slice(-65536); });
    child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-65536); });
    child.once("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolveResult({ code, signal, timedOut, stdout, stderr });
    });
  });
}

describe("Backend CLI credential refusal", () => {
  it.each(entrypoints)("%s executes its native CLI guard and refuses missing credentials", async (app, signingVariable) => {
    const result = await runWithoutCredentials(app);
    const diagnostics = `${result.stdout}\n${result.stderr}`;
    expect(result.timedOut, diagnostics).toBe(false);
    expect(result.signal, diagnostics).toBeNull();
    expect(result.code, diagnostics).toBe(1);
    expect(result.stderr, diagnostics).toContain(signingVariable);
    expect(result.stderr, diagnostics).toMatch(/required/i);
    expect(result.stderr, diagnostics).not.toMatch(/ERR_MODULE_NOT_FOUND|Cannot find (?:package|module)/);
    expect(result.stdout, diagnostics).not.toMatch(/listening|ready/i);
  }, 6000);
});
