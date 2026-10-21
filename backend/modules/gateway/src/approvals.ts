import type { Principal, EffectRequest } from "@asi/contracts";
import type { ApprovalView, PolicyService } from "@asi/policy";
export type ApprovalPort = Pick<PolicyService,'ready'|'createApproval'|'approveEffect'|'rejectApproval'|'getApproval'|'listPending'|'expireApprovals'|'verifyApproval'>;
export interface ApprovalConfig { approvalPort: ApprovalPort }
export interface ApprovalRequest { effectRequest: EffectRequest; approver: Principal }
export type ApprovalRecord = ApprovalView;
// Gateway presents canonical policy-owned decisions. It has no approval store or signing keys.
export class ApprovalManager {
  constructor(private readonly config: ApprovalConfig) {
    if (!config.approvalPort) throw new Error('Canonical policy ApprovalPort required');
  }
  initialize(): Promise<void> { return this.config.approvalPort.ready(); }
  requestApproval(request: ApprovalRequest): Promise<{ approvalId: string; nonce: string; expiresAt: string }> { return this.config.approvalPort.createApproval(request.effectRequest,request.approver); }
  getApproval(id: string): Promise<ApprovalRecord|null> { return this.config.approvalPort.getApproval(id); }
  async approve(id: string, principal: Principal, reason?: string): Promise<void> {
    if (reason !== undefined && (reason.length<1 || reason.length>1024)) throw new Error('Invalid approval reason');
    const approval = await this.getApproval(id); if (!approval) throw new Error('Approval not found');
    await this.config.approvalPort.approveEffect({ schemaVersion:1,approvalId:id,approver:principal,effectId:approval.effectId,inputHash:approval.inputHash,policyVersion:approval.policyVersion,expiresAt:approval.expiresAt,nonce:approval.nonce });
  }
  async deny(id: string, principal: Principal, reason: string): Promise<void> { const approval=await this.getApproval(id);if(!approval)throw new Error('Approval not found');return this.config.approvalPort.rejectApproval(id,approval.nonce,principal,reason); }
  async getPendingApprovals(runId?: string): Promise<ApprovalRecord[]> { const list=await this.config.approvalPort.listPending();return runId?list.filter(a=>a.runId===runId):list; }
  cleanupExpired(): Promise<number> { return this.config.approvalPort.expireApprovals(); }
  verifySignature(id: string, nonce: string): Promise<boolean> { return this.config.approvalPort.verifyApproval(id,nonce); }
}
export function createApprovalManager(config: ApprovalConfig): ApprovalManager { return new ApprovalManager(config); }
