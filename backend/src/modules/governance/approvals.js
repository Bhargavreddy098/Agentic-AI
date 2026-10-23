// @ts-check
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { executeCommand } from '../../platform/database/commands.js';
import { withScopedTransaction } from '../../platform/database/transaction.js';
import { apiError } from '../../../middlewares/error-handler.js';

const hash = value => createHash('sha256').update(value).digest();

function stateOf(row) {
    if (row.state === 'pending' && row.expires_at.getTime() <= Date.now()) return 'expired';
    return row.state;
}

const view = row => {
    const state = stateOf(row);
    return {
        id: row.id,
        kind: row.kind,
        contractRevisionId: row.contract_revision_id,
        ...(row.effect_id ? { effectId: row.effect_id } : {}),
        digest: row.input_digest.toString('hex'),
        policyRevisionId: row.policy_revision_id,
        state,
        expiresAt: row.expires_at.toISOString(),
        scopeSummary: row.scope_summary,
        costCeilingMicroUsd: row.cost_ceiling_micro_usd === null ? null : String(row.cost_ceiling_micro_usd),
        consequences: row.consequences,
        ...(row.diff_ref ? { diffRef: row.diff_ref } : {}),
        ...(row.decided_at ? { decidedAt: row.decided_at.toISOString() } : {}),
        ...(row.consumed_at ? { consumedAt: row.consumed_at.toISOString() } : {}),
        ...(row.decision_reason ? { reason: row.decision_reason } : {}),
        version: String(row.version),
        createdAt: row.created_at.toISOString(),
    };
};

export function createApprovals({ pool, audit, policy, approvalTtlMs = 15 * 60 * 1000 }) {
    if (!Number.isSafeInteger(approvalTtlMs) || approvalTtlMs < 60000 || approvalTtlMs > 60 * 60 * 1000) throw new Error('Invalid approval lifetime');
    const requireAudit = () => {
        if (!audit) throw apiError('CAPABILITY_UNAVAILABLE', 'Audit is not configured.', 503);
        return audit;
    };
    const owner = async (tx, scope) => {
        const row = (await tx.query(`SELECT p.kind, w.owner_principal_id FROM identity.principals p
            JOIN identity.workspaces w ON w.workspace_id=$1 AND w.owner_principal_id=p.principal_id
            WHERE p.principal_id=$2`, [scope.workspaceId, scope.principalId])).rows[0];
        if (!row || row.kind !== 'local_user' || row.owner_principal_id !== scope.principalId) throw apiError('FORBIDDEN', 'Only the local owner may decide approvals.', 403);
    };
    return {
        async requestContract(scope, revisionId, key, input) {
            return executeCommand(pool, scope, 'POST /contract-revisions/' + revisionId + '/approval-requests', key, input, async tx => {
                if (typeof input.digest !== 'string' || !/^[0-9a-f]{64}$/.test(input.digest)) throw apiError('INVALID_INPUT', 'A hexadecimal contract digest is required.');
                const revision = (await tx.query('SELECT * FROM planning.contract_revisions WHERE id=$1 FOR UPDATE', [revisionId])).rows[0];
                if (!revision) throw apiError('NOT_FOUND', 'Contract revision was not found.', 404);
                if (revision.digest.toString('hex') !== input.digest) throw apiError('DIGEST_MISMATCH', 'Digest does not bind the exact contract revision.', 409);
                const active = await policy.activeInTransaction(tx, scope.workspaceId);
                if (!active) throw apiError('POLICY_NOT_CONFIGURED', 'No active policy revision exists.', 409);
                const pending = (await tx.query(`SELECT id FROM control.approvals
                    WHERE contract_revision_id=$1 AND input_digest=$2 AND kind='contract' AND state='pending'`,
                [revisionId, revision.digest])).rows[0];
                if (pending) throw apiError('APPROVAL_PENDING', 'An approval request is already pending for this exact revision.', 409);
                const nonce = randomBytes(32).toString('base64url');
                const id = randomUUID();
                const expiresAt = new Date(Date.now() + approvalTtlMs).toISOString();
                const summary = {
                    projectId: revision.project_id,
                    contractId: revision.contract_id,
                    contractRevisionId: revision.id,
                    planRevisionId: revision.plan_revision_id,
                    requirementRevisionId: revision.requirement_revision_id,
                    revision: String(revision.revision),
                };
                const row = (await tx.query(`INSERT INTO control.approvals
                    (id,workspace_id,project_id,kind,contract_revision_id,input_digest,policy_revision_id,
                     approver_principal_id,requested_by,state,nonce_hash,expires_at,scope_summary,cost_ceiling_micro_usd,consequences)
                    VALUES ($1,$2,$3,'contract',$4,$5,$6,$7,$8,'pending',$9,$10,$11,0,$12) RETURNING *`,
                [id, scope.workspaceId, revision.project_id, revisionId, revision.digest, active.id,
                    scope.principalId, scope.principalId, hash(nonce), expiresAt, summary,
                    'Approval binds the exact contract revision digest. Any material change requires a new approval.'])).rows[0];
                await requireAudit().append(tx, scope, {
                    action: 'approval.requested',
                    targetRef: id,
                    metadata: { kind: 'contract', contractRevisionId: revisionId, digest: input.digest, expiresAt },
                });
                return { status: 201, projectId: revision.project_id, data: { ...view(row), nonce } };
            });
        },
        async list(scope, { limit, after, projectId, state }) {
            return withScopedTransaction(pool, scope, async tx => {
                const rows = (await tx.query(`SELECT * FROM control.approvals
                    WHERE ($1::uuid IS NULL OR project_id=$1)
                    AND ($2::text IS NULL OR state=$2 OR ($2='expired' AND state='pending' AND expires_at<=clock_timestamp()))
                    AND ($3::uuid IS NULL OR id<$3::uuid) ORDER BY id DESC LIMIT $4`,
                [projectId ?? null, state ?? null, after, limit + 1])).rows;
                const items = rows.slice(0, limit);
                return { data: items.map(view), nextCursor: rows.length > limit ? Buffer.from(items.at(-1).id).toString('base64url') : null };
            });
        },
        async get(scope, approvalId) {
            return withScopedTransaction(pool, scope, async tx => {
                const row = (await tx.query('SELECT * FROM control.approvals WHERE id=$1', [approvalId])).rows[0];
                if (!row) throw apiError('NOT_FOUND', 'Approval was not found.', 404);
                return view(row);
            });
        },
        async decide(scope, approvalId, key, input) {
            return executeCommand(pool, scope, 'POST /approvals/' + approvalId + '/decisions', key, input, async tx => {
                await owner(tx, scope);
                if (typeof input.nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.nonce)) throw apiError('INVALID_NONCE', 'Approval nonce is invalid.', 403);
                if (typeof input.digest !== 'string' || !/^[0-9a-f]{64}$/.test(input.digest)) throw apiError('INVALID_INPUT', 'A hexadecimal approval digest is required.');
                const row = (await tx.query('SELECT * FROM control.approvals WHERE id=$1 FOR UPDATE', [approvalId])).rows[0];
                if (!row) throw apiError('NOT_FOUND', 'Approval was not found.', 404);
                if (row.state !== 'pending') throw apiError('ALREADY_DECIDED', 'Approval was already decided.', 409);
                if (row.approver_principal_id !== scope.principalId) throw apiError('FORBIDDEN', 'This principal is not the designated approver.', 403);
                if (row.input_digest.toString('hex') !== input.digest) throw apiError('DIGEST_MISMATCH', 'Approval digest does not match.', 409);
                if (!hash(input.nonce).equals(row.nonce_hash)) throw apiError('INVALID_NONCE', 'Approval nonce was rejected.', 403);
                if (row.expires_at.getTime() <= Date.now()) throw apiError('APPROVAL_EXPIRED', 'Approval request has expired.', 409);
                const state = input.decision === 'approve' ? 'approved' : 'rejected';
                const updated = (await tx.query(`UPDATE control.approvals
                    SET state=$2,decided_at=clock_timestamp(),decision_reason=$3,version=version+1,updated_at=clock_timestamp()
                    WHERE id=$1 RETURNING *`, [approvalId, state, input.reason ?? null])).rows[0];
                await requireAudit().append(tx, scope, {
                    action: 'approval.' + state,
                    targetRef: approvalId,
                    metadata: { kind: row.kind, digest: input.digest, ...(input.reason ? { reason: input.reason } : {}) },
                });
                return { status: 200, data: view(updated) };
            });
        },
        async revoke(scope, approvalId, key, input) {
            return executeCommand(pool, scope, 'POST /approvals/' + approvalId + '/revoke', key, input, async tx => {
                await owner(tx, scope);
                const row = (await tx.query('SELECT * FROM control.approvals WHERE id=$1 FOR UPDATE', [approvalId])).rows[0];
                if (!row) throw apiError('NOT_FOUND', 'Approval was not found.', 404);
                if (row.consumed_at) throw apiError('EFFECT_ALREADY_DISPATCHED', 'Approval was already consumed.', 409);
                if (row.state === 'revoked') return { status: 200, data: view(row) };
                if (!['pending', 'approved'].includes(row.state)) throw apiError('ALREADY_DECIDED', 'Approval is no longer revocable.', 409);
                const updated = (await tx.query(`UPDATE control.approvals
                    SET state='revoked',decision_reason=$2,version=version+1,updated_at=clock_timestamp()
                    WHERE id=$1 RETURNING *`, [approvalId, input.reason])).rows[0];
                await requireAudit().append(tx, scope, { action: 'approval.revoked', targetRef: approvalId, metadata: { reason: input.reason } });
                return { status: 200, data: view(updated) };
            });
        },
    };
}
