import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "yaml";
import { z } from "zod";
import { EffectRequestSchema, PrincipalSchema, OpaqueIdSchema } from "@asi/contracts";
import type { EffectRequest, Principal, PolicyDecision } from "@asi/contracts";

const condition = z.strictObject({ field: z.enum(['principal.tenantId','principal.subjectId','principal.roles','principal.capabilities','effectRequest.action','effectRequest.resource','effectRequest.inputHash','runMode']), operator: z.enum(['equals','contains','startsWith','matches','lessThan','greaterThan']), value: z.unknown() });
export const PolicyConfigSchema = z.strictObject({ version: OpaqueIdSchema, defaultEffect: z.enum(['allow','deny']), rules: z.array(z.strictObject({ capability: OpaqueIdSchema, effect: z.enum(['allow','deny']), conditions: z.array(condition).max(16) })).max(256), modeCapabilities: z.record(z.string(), z.array(OpaqueIdSchema).max(128)), approvalRequired: z.array(z.string().min(1).max(128)).max(128), protectedPaths: z.array(z.string().min(1).max(256)).max(128), maxEffectCostMicroUsd: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), approvalExpirySeconds: z.number().int().min(1).max(300) });
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;
export type PolicyRule = PolicyConfig['rules'][number];
export type PolicyCondition = PolicyRule['conditions'][number];
export interface AuthorizationContext { principal: Principal; effectRequest: EffectRequest; policyVersion: string; runMode: 'observe'|'assist'|'execute'; config: PolicyConfig }
export interface EvaluateConfig { config: PolicyConfig; service?: { authorizeEffect(request: EffectRequest, principal: Principal): Promise<PolicyDecision> } }
export async function loadPolicyConfig(path: string): Promise<PolicyConfig> {
  const bytes = readFileSync(path);
  if (bytes.length > 65536) throw new Error('Policy configuration exceeds bound');
  return PolicyConfigSchema.parse(parse(bytes.toString('utf8')));
}
function match(c: PolicyCondition, request: EffectRequest, principal: Principal): boolean {
  const fields: Record<PolicyCondition['field'], unknown> = { 'principal.tenantId': principal.tenantId, 'principal.subjectId': principal.subjectId, 'principal.roles': principal.roles, 'principal.capabilities': principal.capabilities, 'effectRequest.action': request.action, 'effectRequest.resource': request.resource, 'effectRequest.inputHash': request.inputHash, runMode: request.runContext.mode };
  const value = fields[c.field];
  if (c.operator === 'equals') return value === c.value;
  if (c.operator === 'contains') return Array.isArray(value) ? value.includes(c.value) : typeof value === 'string' && typeof c.value === 'string' && value.includes(c.value);
  if (c.operator === 'startsWith') return typeof value === 'string' && typeof c.value === 'string' && value.startsWith(c.value);
  // Arbitrary regex and unsupported numeric constraints have no bounded proof here.
  return false;
}
export function evaluatePolicy(policyInput: PolicyConfig, input: EffectRequest, actor: Principal): PolicyDecision {
  const policy = PolicyConfigSchema.parse(policyInput), request = EffectRequestSchema.parse(input), principal = PrincipalSchema.parse(actor);
  const base = { schemaVersion: 1 as const, decisionId: randomUUID(), policyVersion: policy.version };
  const deny = (reason: string): PolicyDecision => ({ ...base, decision: 'deny', reason });
  if (principal.tenantId !== request.runContext.budgetRef.tenantId || Date.parse(request.runContext.deadlineAt) <= Date.now()) return deny('Invalid tenant or expired run');
  if (policy.protectedPaths.some(p => request.resource.includes(p))) return deny('Protected resource');
  const caps = request.requiredCapabilities;
  if (!caps?.length) return deny('Explicit required capabilities are mandatory');
  for (const cap of caps) {
    if(policy.rules.some(r=>r.capability===cap && r.conditions.some(c=>!['equals','contains','startsWith'].includes(c.operator)))) return deny('Unsupported policy condition requires enforcement');
    if (!principal.capabilities.includes(cap) || !policy.modeCapabilities[request.runContext.mode]?.includes(cap)) return deny('Capability is absent from grant or mode');
    if (request.runContext.mode === 'observe' && (!cap.startsWith('read:') || request.action.startsWith('write'))) return deny('Write actions are disallowed in observe mode');
    const rules = policy.rules.filter(r => r.capability === cap && r.conditions.every(c => match(c,request,principal)));
    if (rules.some(r => r.effect === 'deny') || (!rules.some(r => r.effect === 'allow') && policy.defaultEffect === 'deny')) return deny('Required capability denied by policy');
  }
  if (policy.approvalRequired.some(p => p.endsWith('*') ? request.action.startsWith(p.slice(0,-1)) || request.resource.startsWith(p.slice(0,-1)) : request.action === p || request.resource === p)) return { ...base, decision: 'approval_required', reason: 'Action requires manual approval' };
  const expiry = Math.min(Date.now()+30000,Date.parse(principal.expiresAt),Date.parse(request.runContext.deadlineAt));
  if (expiry <= Date.now()) return deny('Expired authority');
  return { ...base, decision: 'allow', boundCapability: caps[0]!, boundExpiresAt: new Date(expiry).toISOString() };
}
export async function authorizeEffect(config: EvaluateConfig, context: AuthorizationContext): Promise<PolicyDecision> {
  if (!config.service) throw new Error('Authenticated policy owner service required');
  if (context.policyVersion !== config.config.version || context.runMode !== context.effectRequest.runContext.mode) throw new Error('Policy context mismatch');
  return config.service.authorizeEffect(context.effectRequest, context.principal);
}
