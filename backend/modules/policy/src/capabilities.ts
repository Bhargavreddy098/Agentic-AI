import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { EffectRequestSchema, PrincipalSchema, OpaqueIdSchema, boundedJsonObjectSchema } from "@asi/contracts";
import type { EffectRequest, Principal, PolicyVersion } from "@asi/contracts";

export type PolicySigningKey = string | Uint8Array;
export function requireSigningKey(key: PolicySigningKey | undefined): Uint8Array {
  if (key === undefined) throw new Error("Explicit policy signing key required");
  const bytes = typeof key === "string" ? Buffer.from(key, "utf8") : Buffer.from(key);
  if (bytes.length < 32 || bytes.length > 4096) throw new Error("Invalid policy signing key length");
  return bytes;
}
export function canonicalPolicyJson(value: object): string {
  boundedJsonObjectSchema(65536).parse(value);
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort);
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, sort(v)]));
    return value;
  };
  return JSON.stringify(sort(value));
}
export function signPolicyEnvelope(domain: string, value: object, key: PolicySigningKey | undefined): string {
  return createHmac("sha256", requireSigningKey(key)).update(domain + "\n" + canonicalPolicyJson(value)).digest("hex");
}
export function verifyPolicyEnvelope(domain: string, value: object, signature: unknown, key: PolicySigningKey | undefined): boolean {
  try {
    if (typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature)) return false;
    const expected = Buffer.from(signPolicyEnvelope(domain, value, key), "hex"), actual = Buffer.from(signature, "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}
export function policyExpiry(ttlMs: number, principal: Principal, request: EffectRequest): string {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 300000) throw new Error("Invalid short policy token lifetime");
  const expires = Math.min(Date.now() + ttlMs, Date.parse(principal.expiresAt), Date.parse(request.runContext.deadlineAt));
  if (!Number.isFinite(expires) || expires <= Date.now()) throw new Error("Expired policy authority");
  return new Date(expires).toISOString();
}
export interface CapabilityGrant { capability: string; tenantId: string; grantedAt: string; expiresAt: string; grantedBy: string; constraints?: CapabilityConstraint[] }
export interface CapabilityConstraint { type: "resource" | "action" | "cost" | "tenant" | "timeWindow"; value: string | number | string[] }
export interface CapabilityValidationConfig { tenantId: string; principal: Principal; runMode: "observe" | "assist" | "execute"; policyVersion: PolicyVersion; currentTime: Date; signingKey?: PolicySigningKey | undefined }
export interface ValidationResult { valid: boolean; reason?: string; missingCapabilities: string[]; degradedCapabilities: string[] }
export interface ExecutionToken {
  schemaVersion: 1; tokenId: string; capability: string; tenantId: string; subjectId: string; expiresAt: string;
  inputHash: string; artifactHash: string; policyVersion: string; constraints: CapabilityConstraint[];
  request: EffectRequest; principal: Principal; signature?: string | undefined;
}
export interface CapabilityStore {
  getGrant(capability: string, tenantId: string): Promise<CapabilityGrant | null>;
  setGrant(grant: CapabilityGrant): Promise<void>;
  revokeGrant(capability: string, tenantId: string): Promise<void>;
  listGrants(tenantId: string): Promise<CapabilityGrant[]>;
}
// Explicit fixture store; production service always rechecks authenticated identity and M04.
export class InMemoryCapabilityStore implements CapabilityStore {
  private grants = new Map<string, CapabilityGrant>();
  private key(capability: string, tenantId: string) { return JSON.stringify([tenantId, capability]); }
  async getGrant(capability: string, tenantId: string): Promise<CapabilityGrant | null> {
    const grant = this.grants.get(this.key(capability, tenantId));
    return grant && Date.parse(grant.expiresAt) > Date.now() ? structuredClone(grant) : null;
  }
  async setGrant(grant: CapabilityGrant): Promise<void> { this.grants.set(this.key(grant.capability, grant.tenantId), structuredClone(grant)); }
  async revokeGrant(capability: string, tenantId: string): Promise<void> { this.grants.delete(this.key(capability, tenantId)); }
  async listGrants(tenantId: string): Promise<CapabilityGrant[]> { return [...this.grants.values()].filter(g => g.tenantId === tenantId && Date.parse(g.expiresAt) > Date.now()).map(g => structuredClone(g)); }
}
export async function validateExecutionCapability(config: CapabilityValidationConfig, input: EffectRequest, store: CapabilityStore): Promise<ValidationResult> {
  const request = EffectRequestSchema.parse(input), principal = PrincipalSchema.parse(config.principal);
  const missingCapabilities: string[] = [], degradedCapabilities: string[] = [];
  for (const cap of request.requiredCapabilities ?? []) {
    const grant = await store.getGrant(cap, config.tenantId);
    if (!principal.capabilities.includes(cap) || principal.tenantId !== config.tenantId || request.runContext.budgetRef.tenantId !== config.tenantId || !grant || grant.tenantId !== config.tenantId || !Number.isFinite(Date.parse(grant.expiresAt)) || Date.parse(grant.expiresAt) <= config.currentTime.getTime()) missingCapabilities.push(cap);
    else if (grant.constraints?.some(c => !checkConstraint(c, request, config))) degradedCapabilities.push(cap);
  }
  return { valid: missingCapabilities.length === 0 && degradedCapabilities.length === 0, ...(missingCapabilities.length || degradedCapabilities.length ? { reason: "Missing, expired or constrained capabilities" } : {}), missingCapabilities, degradedCapabilities };
}
function checkConstraint(c: CapabilityConstraint, request: EffectRequest, config: CapabilityValidationConfig): boolean {
  const values = typeof c.value === "string" ? [c.value] : Array.isArray(c.value) ? c.value : [];
  if (c.type === "tenant") return values.includes(config.tenantId);
  if (c.type === "resource") return values.some(v => request.resource.startsWith(v));
  if (c.type === "action") return values.some(v => request.action.startsWith(v));
  return false;
}
export function createExecutionToken(capability: string, config: CapabilityValidationConfig, input: EffectRequest, ttlMs: number, key?: PolicySigningKey): ExecutionToken {
  const effectiveKey = key ?? config.signingKey;
  requireSigningKey(effectiveKey);
  const request = EffectRequestSchema.parse(input), principal = PrincipalSchema.parse(config.principal);
  OpaqueIdSchema.parse(capability); OpaqueIdSchema.parse(config.policyVersion);
  if (principal.tenantId !== config.tenantId || request.runContext.budgetRef.tenantId !== config.tenantId || request.runContext.mode !== config.runMode || !principal.capabilities.includes(capability) || !request.requiredCapabilities?.includes(capability)) throw new Error("Execution capability scope mismatch");
  const body: Omit<ExecutionToken, "signature"> = { schemaVersion: 1, tokenId: randomUUID(), capability, tenantId: config.tenantId, subjectId: principal.subjectId, expiresAt: policyExpiry(ttlMs, principal, request), inputHash: request.inputHash, artifactHash: request.artifactHash ?? "", policyVersion: config.policyVersion, constraints: [{ type: "tenant", value: config.tenantId }], request, principal };
  return { ...body, signature: signPolicyEnvelope("ASI-POLICY-EXECUTION-v1", body, effectiveKey) };
}
export function validateExecutionToken(token: ExecutionToken, input: EffectRequest, now: Date, tenantId?: string, key?: PolicySigningKey): { valid: boolean; reason?: string } {
  try {
    const request = EffectRequestSchema.parse(input), principal = PrincipalSchema.parse(token.principal);
    const { signature, ...body } = token;
    if (!tenantId || !verifyPolicyEnvelope("ASI-POLICY-EXECUTION-v1", body, signature, key)) throw new Error("Missing or invalid token signature");
    if (token.schemaVersion !== 1 || token.tenantId !== tenantId || principal.tenantId !== tenantId || token.subjectId !== principal.subjectId || request.runContext.budgetRef.tenantId !== tenantId || token.inputHash !== request.inputHash || token.artifactHash !== (request.artifactHash ?? "") || canonicalPolicyJson(token.request) !== canonicalPolicyJson(request)) throw new Error("Execution request binding mismatch");
    const expiry = Date.parse(token.expiresAt), time = now.getTime();
    if (!Number.isFinite(time) || !Number.isFinite(expiry) || expiry <= time || expiry > Date.parse(principal.expiresAt) || expiry > Date.parse(request.runContext.deadlineAt) || !principal.capabilities.includes(token.capability) || !request.requiredCapabilities?.includes(token.capability)) throw new Error("Expired or invalid execution authority");
    return { valid: true };
  } catch (error) { return { valid: false, reason: error instanceof Error ? error.message : "Invalid execution token" }; }
}
export function checkCapabilitySubset(parent: string[], child: string[]): { valid: boolean; exceedingCapabilities: string[] } {
  const exceedingCapabilities = child.filter(c => !parent.includes(c));
  return { valid: exceedingCapabilities.length === 0, exceedingCapabilities };
}
