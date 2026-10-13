import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { EffectRequestSchema, PrincipalSchema, RunContextSchema, ApprovalRecordSchema, OpaqueIdSchema, UtcTimestampSchema, Sha256HexSchema } from "@asi/contracts";
import type { EffectRequest, Principal, RunContext, ApprovalRecord, PolicyDecision } from "@asi/contracts";
import { requireAuthenticatedPrincipal } from "@asi/identity";
import { evaluatePolicy, PolicyConfigSchema, type PolicyConfig } from "./evaluate.js";
import { canonicalPolicyJson, createExecutionToken, validateExecutionToken, signPolicyEnvelope, verifyPolicyEnvelope, requireSigningKey, policyExpiry, type ExecutionToken, type PolicySigningKey } from "./capabilities.js";

const storedPrincipal = PrincipalSchema.extend({ expiresAt: UtcTimestampSchema });
const actorBinding = z.strictObject({ grantId: OpaqueIdSchema, principal: storedPrincipal });
const intentSchema = z.strictObject({ approvalId: OpaqueIdSchema, requester: actorBinding, approver: actorBinding, request: EffectRequestSchema, policyVersion: OpaqueIdSchema, nonce: OpaqueIdSchema, expiresAt: UtcTimestampSchema });
const decisionSchema = z.strictObject({ approvalId: OpaqueIdSchema, nonce: OpaqueIdSchema, decision: z.enum(['approve','reject']), actor: actorBinding, decidedAt: UtcTimestampSchema, requestSignature: Sha256HexSchema, reason: z.string().min(1).max(1024).optional() });
export interface PolicyServiceConfig { pool: Pool; tenantId: string; ownerId: string; context: RunContext; principal: Principal; signingKey: PolicySigningKey; transportKey: PolicySigningKey; tokenTtlMs: number; loadPolicy(): Promise<PolicyConfig> }
export interface ApprovalView { approvalId: string; effectId: string; runId: string; principal: Principal; action: string; resource: string; inputHash: string; status: 'pending'|'approved'|'denied'|'expired'; requestedAt: string; expiresAt: string; nonce: string; policyVersion: string; decidedAt?: string; decidedBy?: Principal; reason?: string }
export interface PolicyService {
  ready(): Promise<void>;
  authorizeEffect(request: EffectRequest, principal: Principal): Promise<PolicyDecision>;
  createApproval(request: EffectRequest, approver: Principal): Promise<{ approvalId: string; nonce: string; expiresAt: string }>;
  approveEffect(record: ApprovalRecord): Promise<void>;
  rejectApproval(id: string, nonce: string, approver: Principal, reason: string): Promise<void>;
  consumeApproval(id: string, nonce: string, request: EffectRequest): Promise<string>;
  issueExecutionCapability(request: EffectRequest): Promise<string>;
  validateExecutionCapability(token: string, request: EffectRequest): Promise<void>;
  getApproval(id: string): Promise<ApprovalView|null>;
  listPending(): Promise<ApprovalView[]>;
  expireApprovals(): Promise<number>;
  verifyApproval(id: string, nonce: string): Promise<boolean>;
}
type Row = Record<string, unknown>;
function object(value: unknown): Row { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid stored approval'); return value as Row; }
function signedRow(value: unknown, key: PolicySigningKey) {
  const row = object(value), intent = intentSchema.parse(row['request_json']);
  if (!verifyPolicyEnvelope('ASI-POLICY-APPROVAL-v1/request', intent, row['request_signature'], key) || row['approval_id'] !== intent.approvalId || row['nonce'] !== intent.nonce || row['policy_version'] !== intent.policyVersion || row['effect_id'] !== intent.request.effectId || row['run_id'] !== intent.request.runContext.runId || row['tenant_id'] !== intent.requester.principal.tenantId) throw new Error('Invalid persisted approval request signature or binding');
  const decision = row['decision_json'] === null ? null : decisionSchema.parse(row['decision_json']);
  if (decision && (!verifyPolicyEnvelope('ASI-POLICY-APPROVAL-v1/decision', decision, row['decision_signature'], key) || decision.approvalId !== intent.approvalId || decision.nonce !== intent.nonce || decision.requestSignature !== row['request_signature'] || decision.actor.grantId !== intent.approver.grantId || canonicalPolicyJson(decision.actor.principal) !== canonicalPolicyJson(intent.approver.principal) || row['decision'] !== decision.decision)) throw new Error('Invalid persisted approval decision signature or binding');
  return { row, intent, decision };
}
function view(value: ReturnType<typeof signedRow>): ApprovalView {
  const { row, intent, decision } = value;
  return { approvalId: intent.approvalId, effectId: intent.request.effectId, runId: intent.request.runContext.runId, principal: intent.requester.principal, action: intent.request.action, resource: intent.request.resource, inputHash: intent.request.inputHash, nonce: intent.nonce, policyVersion: intent.policyVersion, expiresAt: intent.expiresAt, requestedAt: new Date(String(row['created_at'])).toISOString(), status: Date.parse(intent.expiresAt) <= Date.now() ? 'expired' : decision ? decision.decision === 'approve' ? 'approved' : 'denied' : 'pending', ...(decision ? { decidedAt: decision.decidedAt, decidedBy: decision.actor.principal, ...(decision.reason ? {reason: decision.reason} : {}) } : {}) };
}
export async function createPolicyService(config: PolicyServiceConfig): Promise<PolicyService> {
  const key = Buffer.from(requireSigningKey(config.signingKey)), transport = requireSigningKey(config.transportKey);
  if (Buffer.from(transport).equals(key)) throw new Error('Distinct policy and transport keys required');
  const tenant = OpaqueIdSchema.parse(config.tenantId), owner = OpaqueIdSchema.parse(config.ownerId), context = RunContextSchema.parse(config.context), boundPrincipal = config.principal;
  if (!Number.isSafeInteger(config.tokenTtlMs) || config.tokenTtlMs < 1 || config.tokenTtlMs > 300000 || context.budgetRef.tenantId !== tenant || typeof config.loadPolicy !== 'function') throw new Error('Incomplete trusted policy configuration');
  const policy = async () => PolicyConfigSchema.parse(await config.loadPolicy());
  const authenticate = async (principal: Principal) => {
    const grant = await requireAuthenticatedPrincipal(principal);
    PrincipalSchema.parse(principal);
    if (principal.tenantId !== tenant || principal.audience !== 'policy-kernel') throw new Error('Authenticated policy principal scope mismatch');
    return { grantId: grant.grantId, principal: structuredClone(principal) };
  };
  const bound = await authenticate(boundPrincipal);
  const tx = async <T>(work: (c: PoolClient) => Promise<T>, actors: Principal[] = [boundPrincipal]): Promise<T> => {
    const bindings = await Promise.all(actors.map(authenticate));
    const c = await config.pool.connect();
    try {
      await c.query('BEGIN'); await c.query("SELECT set_config('asi.tenant_id',$1,true),set_config('asi.owner_id',$2,true)", [tenant,owner]);
      await c.query('SELECT p07_bind($1,$2)',[context,JSON.stringify(bindings)]);
      const activePolicy = canonicalPolicyJson(await policy());
      const result = await work(c);
      // Recheck live revocation and expiry after all database lock waits, before commit.
      for (const actor of actors) await authenticate(actor);
      if(canonicalPolicyJson(await policy()) !== activePolicy) throw new Error('Policy rotated during authorization');
      await c.query('SELECT p07_get($1,$2)',[context,'final-writer-check']);
      await c.query('COMMIT'); return result;
    } catch(e) { await c.query('ROLLBACK').catch(() => undefined); throw e; } finally { c.release(); }
  };
  const request = (input: EffectRequest) => { const r = EffectRequestSchema.parse(input); if (canonicalPolicyJson(r.runContext) !== canonicalPolicyJson(context)) throw new Error('Noncanonical bound policy context'); return r; };
  const check = async (c: PoolClient, req: EffectRequest) => { await c.query('SELECT p07_requester($1,$2)',[context,bound]); await c.query('SELECT p07_check($1,$2)',[context,req]); };
  const get = async (c: PoolClient,id: string) => { OpaqueIdSchema.parse(id); const r = await c.query<{value: unknown}>('SELECT p07_get($1,$2) AS value',[context,id]); return r.rows[0]?.value == null ? null : signedRow(r.rows[0].value,key); };
  const authorize = async (req: EffectRequest, principal: Principal) => {
    const actor = await authenticate(principal);
    if (actor.grantId !== bound.grantId) throw new Error('Policy requester binding mismatch');
    return tx(async c => { await check(c,req); return evaluatePolicy(await policy(),req,principal); });
  };
  const decide = async (id: string, nonce: string, approver: Principal, choice: 'approve'|'reject', reason?: string, canonical?: ApprovalRecord) => {
    const actor = await authenticate(approver);
    await tx(async c => {
      const approval = await get(c,id); if (!approval) throw new Error('Approval not found');
      const { intent, row } = approval;
      const current = await policy();
      if (intent.policyVersion !== current.version || intent.approver.grantId !== actor.grantId || canonicalPolicyJson(intent.approver.principal) !== canonicalPolicyJson(actor.principal) || nonce !== intent.nonce) throw new Error('Approval actor, nonce or policy mismatch');
      if (canonical && (canonical.effectId !== intent.request.effectId || canonical.inputHash !== intent.request.inputHash || canonical.policyVersion !== intent.policyVersion || canonical.expiresAt !== intent.expiresAt)) throw new Error('Canonical approval binding mismatch');
      const decision = decisionSchema.parse({ approvalId: id, nonce, decision: choice, actor, decidedAt: new Date().toISOString(), requestSignature: row['request_signature'], ...(reason ? { reason } : {}) });
      const signature = signPolicyEnvelope('ASI-POLICY-APPROVAL-v1/decision',decision,key);
      await c.query('SELECT p07_decide($1,$2,$3,$4,$5)',[context,id,nonce,decision,signature]);
    },[boundPrincipal,approver]);
  };
  const makeToken = (req: EffectRequest, current: PolicyConfig, approvalId?: string, nonce?: string) => {
    const token = createExecutionToken(req.requiredCapabilities![0]!,{ tenantId: tenant, principal: boundPrincipal, runMode: context.mode, policyVersion: current.version, currentTime: new Date(), signingKey: key }, req, config.tokenTtlMs);
    const { signature: ignoredSignature, ...body } = token;
    if (!ignoredSignature) throw new Error('Missing token signature');
    const envelope = { ...body, grantId: bound.grantId, ...(approvalId && nonce ? {approvalId,nonce} : {}) };
    return canonicalPolicyJson({ ...envelope, signature: signPolicyEnvelope('ASI-POLICY-EXECUTION-v1',envelope,key) });
  };
  const service: PolicyService = {
    ready: () => tx(async c => { await c.query('SELECT p07_get($1,$2)',[context,'readiness-probe']); }),
    authorizeEffect: (input, principal) => authorize(request(input),principal),
    createApproval: async (input, approver) => {
      const req = request(input), actor = await authenticate(approver);
      const approverGrant = await requireAuthenticatedPrincipal(approver);
      if (approver.agentId !== undefined || approverGrant.parentGrantId !== undefined) throw new Error('Agent or delegated identity cannot supply human approval');
      return tx(async c => {
        await check(c,req); const current = await policy();
        if (evaluatePolicy(current,req,boundPrincipal).decision !== 'approval_required') throw new Error('Effect is not eligible for approval');
        const expiresAt = new Date(Math.min(Date.parse(policyExpiry(current.approvalExpirySeconds*1000,boundPrincipal,req)),Date.parse(approver.expiresAt))).toISOString();
        const { randomUUID } = await import('node:crypto');
        const intent = intentSchema.parse({approvalId:randomUUID(),requester:bound,approver:actor,request:req,policyVersion:current.version,nonce:randomUUID(),expiresAt});
        const signature = signPolicyEnvelope('ASI-POLICY-APPROVAL-v1/request',intent,key);
        await c.query('SELECT p07_create($1,$2,$3,$4)',[context,req,intent,signature]);
        return {approvalId:intent.approvalId,nonce:intent.nonce,expiresAt};
      },[boundPrincipal,approver]);
    },
    approveEffect: async input => { await authenticate(input.approver); const r=ApprovalRecordSchema.parse(input); await decide(r.approvalId,r.nonce,input.approver,'approve',undefined,r); },
    rejectApproval: (id,nonce,approver,reason) => decide(id,nonce,approver,'reject',reason),
    consumeApproval: async (id,nonce,input) => {
      const req=request(input);
      return tx(async c => {
        await check(c,req);
        const approval=await get(c,id); if(!approval)throw new Error('Approval not found'); const current=await policy();
        if(approval.intent.policyVersion!==current.version||approval.intent.requester.grantId!==bound.grantId||approval.intent.nonce!==nonce||canonicalPolicyJson(approval.intent.request)!==canonicalPolicyJson(req)||evaluatePolicy(current,req,boundPrincipal).decision==='deny')throw new Error('Approval request or active policy mismatch');
        await c.query('SELECT p07_bind($1,$2)',[context,JSON.stringify([approval.intent.approver])]);
        await c.query('SELECT p07_consume($1,$2,$3,$4,$5)',[context,req,id,nonce,approval.row['decision_signature']]);
        return makeToken(req,current,id,nonce);
      });
    },
    issueExecutionCapability: async input => {
      const req=request(input);
      return tx(async c=>{await check(c,req);const current=await policy();if(evaluatePolicy(current,req,boundPrincipal).decision!=='allow')throw new Error('Effect requires approval or is denied');await c.query('SELECT p07_authorize($1,$2)',[context,req]);return makeToken(req,current);});
    },
    validateExecutionCapability: async (serialized,input) => {
      if(typeof serialized!=='string'||Buffer.byteLength(serialized)>65536)throw new Error('Invalid execution token size');
      const req=request(input), token=JSON.parse(serialized) as ExecutionToken & {grantId?:string;approvalId?:string;nonce?:string};
      if(!validateExecutionToken(token,req,new Date(),tenant,key).valid||token.grantId!==bound.grantId||canonicalPolicyJson(token.principal)!==canonicalPolicyJson(boundPrincipal))throw new Error('Invalid bound execution token');
      await tx(async c=>{await check(c,req);const current=await policy(),evaluation=evaluatePolicy(current,req,boundPrincipal);if(token.policyVersion!==current.version||evaluation.decision==='deny')throw new Error('Execution policy rotated or denied');if(evaluation.decision==='approval_required'||token.approvalId){if(!token.approvalId)throw new Error('Missing approval');const a=await get(c,token.approvalId);if(!a||!a.decision||a.decision.decision!=='approve'||!a.row['consumed_at']||a.intent.nonce!==token.nonce||a.intent.requester.grantId!==bound.grantId||a.intent.policyVersion!==current.version||Date.parse(a.intent.expiresAt)<=Date.now())throw new Error('Consumed approval proof unavailable');await c.query('SELECT p07_bind($1,$2)',[context,JSON.stringify([a.intent.approver])]);}});
    },
    getApproval: id => tx(async c=>{const a=await get(c,id);return a?view(a):null;}),
    listPending: () => tx(async c=>{const r=await c.query<{value:unknown}>('SELECT p07_list($1) AS value',[context]);if(!Array.isArray(r.rows[0]?.value))throw new Error('Invalid approval list');return r.rows[0].value.map(v=>view(signedRow(v,key)));}),
    expireApprovals: () => tx(async c=>{const r=await c.query<{value:number}>('SELECT p07_expire($1) AS value',[context]);return r.rows[0]?.value??0;}),
    verifyApproval: (id,nonce) => tx(async c=>{const a=await get(c,id);return !!a&&a.intent.nonce===nonce&&a.intent.policyVersion===(await policy()).version&&a.decision?.decision==='approve'&&a.row['consumed_at']===null&&Date.parse(a.intent.expiresAt)>Date.now();}),
  };
  await service.ready(); return service;
}
