import { ApprovalQuorumRequestSchema, ApprovalActorVoteSchema, ApprovalQuorumDecisionSchema } from '../schemas/approval-quorum.schema.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, createScopedStore } from './_shared.js';

export function createApprovalQuorumModel(options = {}) {
    const quorumStore = createScopedStore(options.quorumStore);
    const votesByQuorum = new Map();

    function evaluateQuorum(quorum, votes, nowMs) {
        const currentVotes = votes.filter(v => v.proposalVersion === quorum.proposalVersion && v.inputHash === quorum.inputHash);
        const decisionRefs = currentVotes.map(v => `${v.actorId}:${v.decision}:v${v.proposalVersion}`);
        if (Date.parse(quorum.expiresAt) <= nowMs) {
            return parseSchema(ApprovalQuorumDecisionSchema, {
                quorumId: quorum.quorumId,
                status: 'expired',
                decisionRefs,
                proposalVersion: quorum.proposalVersion,
                inputHash: quorum.inputHash,
                epoch: quorum.proposalVersion,
            });
        }
        if (currentVotes.some(v => v.decision === 'deny')) {
            return parseSchema(ApprovalQuorumDecisionSchema, {
                quorumId: quorum.quorumId,
                status: 'denied',
                decisionRefs,
                proposalVersion: quorum.proposalVersion,
                inputHash: quorum.inputHash,
                epoch: quorum.proposalVersion,
            });
        }
        const distinctApprovers = new Set(currentVotes.filter(v => v.decision === 'approve').map(v => v.actorId));
        const status = distinctApprovers.size >= quorum.quorumCount ? 'allowed' : 'pending';
        return parseSchema(ApprovalQuorumDecisionSchema, {
            quorumId: quorum.quorumId,
            status,
            decisionRefs,
            proposalVersion: quorum.proposalVersion,
            inputHash: quorum.inputHash,
            epoch: quorum.proposalVersion,
        });
    }

    return {
        async createQuorum(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const parsed = parseSchema(ApprovalQuorumRequestSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid approval quorum request');
            const key = `${ctx.tenantId}::${parsed.quorumId}`;
            const existing = quorumStore.get(ctx.tenantId, parsed.quorumId);
            if (existing) {
                if (existing.inputHash === parsed.inputHash && existing.proposalVersion === parsed.proposalVersion) {
                    return { status: 'same_existing', record: existing };
                }
                if (parsed.proposalVersion <= existing.proposalVersion) {
                    throw new ModelDomainError('STALE_REVISION', 'Modified quorum proposal requires higher proposalVersion.', 409);
                }
                votesByQuorum.set(key, []);
            } else {
                votesByQuorum.set(key, []);
            }
            return { status: existing ? 'updated' : 'created', record: quorumStore.set(ctx.tenantId, parsed.quorumId, parsed) };
        },
        async getQuorum(quorumId, context) {
            const ctx = validateContext(context);
            return quorumStore.get(ctx.tenantId, quorumId);
        },
        async recordDecision(input, context) {
            const ctx = validateContext(context);
            if (input?.replacementEffectArgs) {
                throw new ModelDomainError('POLICY_DENIED', 'Client-provided replacement effect args are forbidden in approval decisions.', 403);
            }
            const vote = parseSchema(ApprovalActorVoteSchema, input, 'Invalid approval quorum vote');
            const quorum = quorumStore.get(ctx.tenantId, vote.quorumId);
            if (!quorum) throw new ModelDomainError('NOT_FOUND', 'Approval quorum not found.', 404);
            if (vote.effectRef !== quorum.effectRef || vote.inputHash !== quorum.inputHash || vote.proposalVersion !== quorum.proposalVersion) {
                throw new ModelDomainError('STALE_REVISION', 'Vote binding does not match exact quorum effectRef, inputHash, and proposalVersion.', 409);
            }
            if (!quorum.requiredActorRoles.includes(vote.actorRole)) {
                throw new ModelDomainError('POLICY_DENIED', `Actor role '${vote.actorRole}' is not authorized for this quorum.`, 403);
            }
            const key = `${ctx.tenantId}::${quorum.quorumId}`;
            const votes = votesByQuorum.get(key) ?? [];
            const duplicateActor = votes.find(v => v.actorId === vote.actorId && v.proposalVersion === vote.proposalVersion);
            if (duplicateActor) {
                if (duplicateActor.decision !== vote.decision) {
                    throw new ModelDomainError('CONFLICT', 'Actor already recorded a conflicting vote for this proposalVersion.', 409);
                }
            } else {
                votes.push(vote);
                votesByQuorum.set(key, votes);
            }
            const nowMs = ctx.now ? Date.parse(ctx.now) : Date.now();
            return evaluateQuorum(quorum, votes, nowMs);
        },
        async readDecision(quorumId, context) {
            const ctx = validateContext(context);
            const quorum = quorumStore.get(ctx.tenantId, quorumId);
            if (!quorum) return null;
            const key = `${ctx.tenantId}::${quorumId}`;
            const votes = votesByQuorum.get(key) ?? [];
            const nowMs = ctx.now ? Date.parse(ctx.now) : Date.now();
            return evaluateQuorum(quorum, votes, nowMs);
        },
    };
}
