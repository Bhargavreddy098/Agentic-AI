// @ts-check
import { randomUUID } from 'node:crypto';
import { executeCommand } from '../../platform/database/commands.js';
import { withScopedTransaction } from '../../platform/database/transaction.js';
import { canonicalJson } from '../../shared/canonicalization.js';
import { apiError } from '../../../middlewares/error-handler.js';

const CAPABILITY = /^[a-z][a-z0-9_.:-]{2,127}$/;

const view = row => ({
    id: row.id,
    projectId: row.project_id,
    capability: row.capability,
    resourceScope: row.resource_scope,
    expiresAt: row.expires_at.toISOString(),
    ...(row.revoked_at ? { revokedAt: row.revoked_at.toISOString() } : {}),
    ...(row.contract_revision_id ? { contractRevisionId: row.contract_revision_id } : {}),
    version: String(row.version),
    createdAt: row.created_at.toISOString(),
});

function scopeObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw apiError('INVALID_INPUT', 'resourceScope must be an object.');
    let encoded;
    try { encoded = canonicalJson(value); } catch { throw apiError('INVALID_INPUT', 'resourceScope must be lossless JSON.'); }
    if (Buffer.byteLength(encoded, 'utf8') > 8192) throw apiError('INVALID_INPUT', 'resourceScope is too large.');
    return value;
}

export function createGrants({ pool, audit }) {
    const requireAudit = () => {
        if (!audit) throw apiError('CAPABILITY_UNAVAILABLE', 'Audit is not configured.', 503);
        return audit;
    };
    return {
        async create(scope, projectId, key, input) {
            return executeCommand(pool, scope, 'POST /projects/' + projectId + '/grants', key, input, async tx => {
                if (typeof input.capability !== 'string' || !CAPABILITY.test(input.capability)) throw apiError('INVALID_INPUT', 'Invalid capability.');
                const project = (await tx.query('SELECT status FROM product.projects WHERE project_id=$1 FOR UPDATE', [projectId])).rows[0];
                if (!project) throw apiError('NOT_FOUND', 'Project was not found.', 404);
                if (project.status !== 'active') throw apiError('PROJECT_ARCHIVED', 'Project is archived.', 409);
                const expiresAt = Date.parse(input.expiresAt);
                if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw apiError('INVALID_INPUT', 'expiresAt must be a future timestamp.');
                const resourceScope = scopeObject(input.resourceScope);
                if (input.contractRevisionId) {
                    const contract = (await tx.query('SELECT id FROM planning.contract_revisions WHERE id=$1 AND project_id=$2', [input.contractRevisionId, projectId])).rows[0];
                    if (!contract) throw apiError('NOT_FOUND', 'Contract revision was not found in this project.', 404);
                }
                const id = randomUUID();
                const row = (await tx.query(`INSERT INTO control.capability_grants
                    (id,workspace_id,project_id,principal_id,capability,resource_scope,expires_at,contract_revision_id,created_by)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
                [id, scope.workspaceId, projectId, scope.principalId, input.capability, resourceScope, new Date(expiresAt).toISOString(), input.contractRevisionId ?? null, scope.principalId])).rows[0];
                await requireAudit().append(tx, scope, {
                    action: 'grant.created',
                    targetRef: id,
                    metadata: { projectId, capability: input.capability, expiresAt: row.expires_at.toISOString() },
                });
                return { status: 201, projectId, data: view(row) };
            });
        },
        async list(scope, projectId, { limit, after }) {
            return withScopedTransaction(pool, scope, async tx => {
                const rows = (await tx.query(`SELECT * FROM control.capability_grants
                    WHERE project_id=$1 AND ($2::uuid IS NULL OR id<$2::uuid) ORDER BY id DESC LIMIT $3`,
                [projectId, after, limit + 1])).rows;
                const items = rows.slice(0, limit);
                return { data: items.map(view), nextCursor: rows.length > limit ? Buffer.from(items.at(-1).id).toString('base64url') : null };
            });
        },
        async revoke(scope, grantId, key, input) {
            return executeCommand(pool, scope, 'POST /grants/' + grantId + '/revoke', key, input, async tx => {
                const existing = (await tx.query('SELECT * FROM control.capability_grants WHERE id=$1 FOR UPDATE', [grantId])).rows[0];
                if (!existing) throw apiError('NOT_FOUND', 'Grant was not found.', 404);
                if (existing.revoked_at) return { status: 200, projectId: existing.project_id, data: view(existing) };
                const row = (await tx.query(`UPDATE control.capability_grants
                    SET revoked_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp()
                    WHERE id=$1 RETURNING *`, [grantId])).rows[0];
                await requireAudit().append(tx, scope, {
                    action: 'grant.revoked',
                    targetRef: grantId,
                    metadata: { projectId: row.project_id, capability: row.capability, reason: input.reason ?? '' },
                });
                return { status: 200, projectId: row.project_id, data: view(row) };
            });
        },
        async activeFor(scope, projectId, capability) {
            return withScopedTransaction(pool, scope, async tx => {
                const row = (await tx.query(`SELECT * FROM control.capability_grants
                    WHERE project_id=$1 AND principal_id=$2 AND capability=$3
                    AND revoked_at IS NULL AND expires_at>clock_timestamp()
                    ORDER BY expires_at DESC LIMIT 1`, [projectId, scope.principalId, capability])).rows[0];
                return row ? view(row) : null;
            });
        },
    };
}
