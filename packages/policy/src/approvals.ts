import type { Principal, PolicyVersion, EffectRequest } from '@asi/contracts';
import type { PolicyService, ApprovalView } from './runtime.js';
import { requireSigningKey } from './capabilities.js';

// Compatibility operations delegate to the authenticated canonical owner. A Pool is never an approval port.
export interface ApprovalConfig { signingKey: Uint8Array; approvalExpirySeconds: number; service?: PolicyService; approver?: Principal }
export type ApprovalRecordRow = ApprovalView;
export interface ApprovalRequest { effectId: string; runId: string; tenantId: string; inputHash: Uint8Array; artifactHash?: Uint8Array; policyVersion: PolicyVersion; approver: Principal; effectRequest?: EffectRequest }
export interface ApprovalResult { approvalId: string; nonce: string; expiresAt: string }
export interface VerifyApprovalInput { approvalId: string; nonce: string; tenantId: string }
export interface VerifyApprovalResult { valid: boolean; approval: ApprovalRecordRow|undefined; reason?: string }
function owner(config: ApprovalConfig, port: unknown): PolicyService {
  requireSigningKey(config.signingKey);
  if (!Number.isSafeInteger(config.approvalExpirySeconds) || config.approvalExpirySeconds < 1 || config.approvalExpirySeconds > 300 || !config.service || port !== config.service) throw new Error('Complete trusted approval owner configuration required');
  return config.service;
}
async function scoped(service: PolicyService, id: string, tenant: string): Promise<ApprovalView> {
  const a = await service.getApproval(id);
  if (!a || a.principal.tenantId !== tenant) throw new Error('Approval not found in tenant');
  return a;
}
export async function requestApproval(config: ApprovalConfig, port: unknown, input: ApprovalRequest): Promise<ApprovalResult> {
  const service = owner(config, port), req = input.effectRequest;
  if (!req || req.effectId !== input.effectId || req.runContext.runId !== input.runId || req.runContext.budgetRef.tenantId !== input.tenantId || req.inputHash !== Buffer.from(input.inputHash).toString('hex') || req.artifactHash !== (input.artifactHash ? Buffer.from(input.artifactHash).toString('hex') : undefined)) throw new Error('Complete canonical approval effect required');
  const result = await service.createApproval(req,input.approver), a = await scoped(service,result.approvalId,input.tenantId);
  if(a.policyVersion !== input.policyVersion) throw new Error('Approval policy mismatch');
  return result;
}
export async function approveEffect(config: ApprovalConfig, port: unknown, approvalId: string, nonce: string, tenantId: string, decision: 'approve'|'reject', approverSubjectId: string): Promise<void> {
  const service = owner(config,port), actor = config.approver, a = await scoped(service,approvalId,tenantId);
  if (!actor || actor.subjectId !== approverSubjectId || actor.tenantId !== tenantId) throw new Error('Authenticated designated approver required');
  if(a.nonce !== nonce) throw new Error('Invalid nonce');
  if(decision === 'reject') return service.rejectApproval(approvalId,nonce,actor,'Rejected by authenticated approver');
  return service.approveEffect({schemaVersion:1,approvalId,nonce,approver:actor,effectId:a.effectId,inputHash:a.inputHash,policyVersion:a.policyVersion,expiresAt:a.expiresAt});
}
export async function verifyApproval(config: ApprovalConfig, port: unknown, input: VerifyApprovalInput): Promise<VerifyApprovalResult> {
  const service=owner(config,port), a=await scoped(service,input.approvalId,input.tenantId), valid=await service.verifyApproval(input.approvalId,input.nonce);
  return {valid,approval:valid?a:undefined,...(valid?{}:{reason:'Approval proof is unavailable or invalid'})};
}
export async function getPendingApprovals(service: PolicyService,tenantId: string): Promise<ApprovalRecordRow[]> { return (await service.listPending()).filter(a=>a.principal.tenantId===tenantId); }
export async function getApprovalById(service: PolicyService,id: string,tenantId: string): Promise<ApprovalRecordRow|null> { const a=await service.getApproval(id);return a?.principal.tenantId===tenantId?a:null; }
export async function expireOldApprovals(service: PolicyService,tenantId: string): Promise<number> { const a=await service.listPending();if(a.some(v=>v.principal.tenantId!==tenantId))throw new Error('Tenant mismatch');return service.expireApprovals(); }
