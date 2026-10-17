import type { ToolManifest, RunContext } from "@asi/contracts";

export interface SandboxBackend {
  name: string;
  executeIsolated(
    manifest: ToolManifest,
    input: unknown,
    context: RunContext,
    signal: AbortSignal
  ): Promise<IsolatedExecutionResult>;
  qualify(): Promise<SandboxQualification>;
}

export async function executeIsolated(
  backend: SandboxBackend,
  manifest: ToolManifest,
  input: unknown,
  context: RunContext,
  signal: AbortSignal
): Promise<IsolatedExecutionResult> {
  return backend.executeIsolated(manifest, input, context, signal);
}

export async function qualifySandbox(backend: SandboxBackend): Promise<SandboxQualification> {
  return backend.qualify();
}

export interface IsolatedExecutionResult {
  exitCode: number;
  output: unknown;
  artifacts: string[];
  usage: {
    cpuMs: number;
    memoryBytes: number;
    wallTimeMs: number;
  };
}

export interface SandboxQualification {
  qualified: boolean;
  backend: string;
  checks: Record<string, boolean>;
  evidence: QualificationEvidence[];
}

export interface QualificationEvidence {
  check: string;
  passed: boolean;
  details: string;
  timestamp: string;
}

export interface SandboxLimits {
  cpuMs: number;
  memoryBytes: number;
  wallTimeMs: number;
  outputBytes: number;
  pids: number;
}

export interface SandboxMount {
  source: string;
  destination: string;
  readonly: boolean;
  type: "bind" | "tmpfs" | "dev";
}

export interface SandboxConfig {
  limits: SandboxLimits;
  mounts: SandboxMount[];
  environment: Record<string, string>;
  workingDirectory: string;
  user: string;
  capabilities: string[];
  networkEnabled: boolean;
  allowedNetworkDestinations: string[];
}

export type BackendType = "windows";
