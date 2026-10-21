import type { PolicyConfig } from "@asi/contracts";
import { PrincipalSchema, RunContextSchema, OpaqueIdSchema } from "@asi/contracts";
import type { Principal, RunContext } from "@asi/contracts";
import { canonicalPolicyJson, signPolicyEnvelope, verifyPolicyEnvelope, requireSigningKey, type PolicySigningKey } from "./capabilities.js";

export type RunMode = "observe" | "assist" | "execute";

export interface ModeCapabilities {
  observe: string[];
  assist: string[];
  execute: string[];
}

export const DEFAULT_MODE_CAPABILITIES: ModeCapabilities = {
  observe: [
    "read:session",
    "read:memory",
    "read:tools",
    "read:models",
    "read:policy",
  ],
  assist: [
    "read:session",
    "read:memory",
    "read:tools",
    "read:models",
    "read:policy",
    "write:session",
    "write:memory",
    "invoke:tool",
    "invoke:model",
  ],
  execute: [
    "read:session",
    "read:memory",
    "read:tools",
    "read:models",
    "read:policy",
    "write:session",
    "write:memory",
    "invoke:tool",
    "invoke:model",
    "publish:effect",
    "request:approval",
    "manage:budget",
  ],
};

export function getCapabilitiesForMode(mode: RunMode, config: PolicyConfig): string[] {
  const baseCapabilities = config.modeCapabilities?.[mode] ?? DEFAULT_MODE_CAPABILITIES[mode] ?? [];
  return baseCapabilities;
}

export function canModePerform(mode: RunMode, capability: string, config: PolicyConfig): boolean {
  const capabilities = getCapabilitiesForMode(mode, config);
  return capabilities.includes(capability);
}

export function reduceCapabilitiesForMode(
  requestedCapabilities: string[],
  mode: RunMode,
  config: PolicyConfig,
): string[] {
  const allowedCapabilities = getCapabilitiesForMode(mode, config);
  return requestedCapabilities.filter((cap) => allowedCapabilities.includes(cap));
}

export function getRequiredMode(capability: string, config: PolicyConfig): RunMode | null {
  const modes: RunMode[] = ["observe", "assist", "execute"];
  for (const mode of modes) {
    if (getCapabilitiesForMode(mode, config).includes(capability)) {
      return mode;
    }
  }
  return null;
}

export interface ModeTransitionRequest {
  fromMode: RunMode;
  toMode: RunMode;
  principal: {
    tenantId: string;
    subjectId: string;
    roles: string[];
    capabilities: string[];
  };
  policyVersion: string;
}

export function validateModeTransition(
  request: ModeTransitionRequest,
  config: PolicyConfig,
): { valid: boolean; reason?: string } {
  const modeOrder: RunMode[] = ["observe", "assist", "execute"];
  const fromIndex = modeOrder.indexOf(request.fromMode);
  const toIndex = modeOrder.indexOf(request.toMode);

  if (toIndex <= fromIndex) {
    return { valid: true };
  }

  const requiredCapabilities = config.modeCapabilities?.[request.toMode] ?? DEFAULT_MODE_CAPABILITIES[request.toMode];
  const missingCapabilities = requiredCapabilities.filter(
    (cap) => !request.principal.capabilities.includes(cap),
  );

  if (missingCapabilities.length > 0) {
    return {
      valid: false,
      reason: `Missing required capabilities for ${request.toMode} mode: ${missingCapabilities.join(", ")}`,
    };
  }

  return { valid: true };
}

export interface ModeTokenSecurity { signingKey: PolicySigningKey; principal: Principal; runContext: RunContext }
export function createModeToken(mode: RunMode, principal: { tenantId: string; subjectId: string }, policyVersion: string, ttlMs: number, security?: ModeTokenSecurity): { token: string; expiresAt: string } {
  requireSigningKey(security?.signingKey);
  if (!security) throw new Error("Missing trusted mode scope");
  const actor = PrincipalSchema.parse(security.principal), context = RunContextSchema.parse(security.runContext);
  OpaqueIdSchema.parse(policyVersion);
  if (!["observe", "assist", "execute"].includes(mode) || mode !== context.mode || principal.tenantId !== actor.tenantId || principal.subjectId !== actor.subjectId || actor.tenantId !== context.budgetRef.tenantId) throw new Error("Mode scope mismatch");
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 300000) throw new Error("Invalid short mode lifetime");
  const expiresAt = new Date(Math.min(Date.now() + ttlMs, Date.parse(actor.expiresAt), Date.parse(context.deadlineAt))).toISOString();
  if (Date.parse(expiresAt) <= Date.now()) throw new Error("Expired mode authority");
  const payload = { mode, principal: actor, context, policyVersion, expiresAt };
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "ASI-POLICY-MODE-v1" })).toString("base64url");
  const encoded = Buffer.from(canonicalPolicyJson(payload)).toString("base64url");
  return { token: header + "." + encoded + "." + signPolicyEnvelope("ASI-POLICY-MODE-v1", payload, security.signingKey), expiresAt };
}
export function validateModeToken(token: string, mode: RunMode, policyVersion: string, security?: ModeTokenSecurity): boolean {
  try {
    if (!security || typeof token !== "string" || token.length > 90000) return false;
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return false;
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Record<string, unknown>;
    if (header['alg'] !== "HS256" || header['typ'] !== "ASI-POLICY-MODE-v1" || Object.keys(header).length !== 2) return false;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    if (!verifyPolicyEnvelope("ASI-POLICY-MODE-v1", payload, parts[2], security.signingKey)) return false;
    const actor = PrincipalSchema.parse(payload['principal']), context = RunContextSchema.parse(payload['context']);
    return payload['mode'] === mode && context.mode === mode && payload['policyVersion'] === policyVersion && typeof payload['expiresAt'] === "string" && Date.parse(payload['expiresAt']) > Date.now() && Date.parse(payload['expiresAt']) <= Date.parse(actor.expiresAt) && Date.parse(payload['expiresAt']) <= Date.parse(context.deadlineAt) && canonicalPolicyJson(actor) === canonicalPolicyJson(security.principal) && canonicalPolicyJson(context) === canonicalPolicyJson(security.runContext);
  } catch { return false; }
}
