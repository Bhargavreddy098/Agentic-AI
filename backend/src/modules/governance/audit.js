// @ts-check
import { randomUUID } from 'node:crypto';
import { digestFor, canonicalJson } from '../../shared/canonicalization.js';
import { withScopedTransaction } from '../../platform/database/transaction.js';
import { apiError } from '../../../middlewares/error-handler.js';

const GENESIS = Buffer.alloc(32);
const FORBIDDEN_METADATA_KEY = /(secret|password|credential|nonce|cookie|authorization|api_?key|access_?token|refresh_?token)/i;

function assertSafeMetadata(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw apiError('INVALID_INPUT', 'Audit metadata must be a JSON object.');
    for (const [key, entry] of Object.entries(value)) {
        if (FORBIDDEN_METADATA_KEY.test(key)) throw apiError('SENSITIVE_AUDIT_METADATA', 'Audit metadata cannot contain credentials or nonces.');
        if (entry !== null && typeof entry === 'object') assertSafeMetadata(entry);
    }
    let encoded;
    try {
        encoded = canonicalJson(value);
    } catch {
        throw apiError('INVALID_INPUT', 'Audit metadata must be lossless JSON.');
    }
    if (Buffer.byteLength(encoded, 'utf8') > 4096) throw apiError('INVALID_INPUT', 'Audit metadata is too large.');
}

const view = row => ({
    id: row.id,
    sequence: String(row.sequence),
    actorId: row.actor_id,
    action: row.action,
    targetRef: row.target_ref,
    traceId: row.trace_id,
    metadata: row.safe_metadata,
    previousDigest: row.previous_digest.toString('hex'),
    digest: row.digest.toString('hex'),
    createdAt: row.created_at.toISOString(),
});

export function createAudit({ pool }) {
    return {
        async append(tx, scope, input) {
            if (typeof input?.action !== 'string' || !/^[a-z][a-z0-9_.:-]{2,127}$/.test(input.action)) throw new Error('Invalid audit action');
            if (typeof input.targetRef !== 'string' || input.targetRef.length < 1 || input.targetRef.length > 1024) throw new Error('Invalid audit target');
            const traceId = input.traceId ?? scope.requestId ?? scope.traceId ?? scope.sessionId ?? 'service';
            if (typeof traceId !== 'string' || traceId.length < 1 || traceId.length > 128) throw new Error('Invalid audit trace');
            const metadata = input.metadata ?? {};
            assertSafeMetadata(metadata);
            let head = (await tx.query('SELECT sequence,digest FROM ops.audit_heads WHERE workspace_id=$1 FOR UPDATE', [scope.workspaceId])).rows[0];
            if (!head) {
                await tx.query(`INSERT INTO ops.audit_heads (workspace_id,sequence,digest) VALUES ($1,0,$2) ON CONFLICT DO NOTHING`, [scope.workspaceId, GENESIS]);
                head = (await tx.query('SELECT sequence,digest FROM ops.audit_heads WHERE workspace_id=$1 FOR UPDATE', [scope.workspaceId])).rows[0];
            }
            const previousDigest = head.digest;
            const sequence = Number(head.sequence) + 1;
            if (!Number.isSafeInteger(sequence)) throw new Error('Audit sequence overflow');
            const digest = digestFor('asi-audit-v1', {
                sequence,
                workspaceId: scope.workspaceId,
                actorId: scope.principalId,
                action: input.action,
                targetRef: input.targetRef,
                traceId,
                metadata,
                previousDigest: previousDigest.toString('hex'),
            });
            const row = (await tx.query(`INSERT INTO ops.audit_events
                (id,workspace_id,sequence,actor_id,action,target_ref,trace_id,safe_metadata,previous_digest,digest)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [randomUUID(), scope.workspaceId, sequence, scope.principalId, input.action, input.targetRef, traceId, metadata, previousDigest, digest])).rows[0];
            await tx.query(`INSERT INTO ops.audit_heads (workspace_id,sequence,digest) VALUES ($1,$2,$3)
                ON CONFLICT (workspace_id) DO UPDATE SET sequence=EXCLUDED.sequence,digest=EXCLUDED.digest,updated_at=clock_timestamp()`,
            [scope.workspaceId, sequence, digest]);
            return view(row);
        },
        async list(scope, { limit, after }) {
            return withScopedTransaction(pool, scope, async tx => {
                const rows = (await tx.query(`SELECT * FROM ops.audit_events
                    WHERE ($1::uuid IS NULL OR id<$1::uuid) ORDER BY id DESC LIMIT $2`, [after, limit + 1])).rows;
                const items = rows.slice(0, limit);
                return { data: items.map(view), nextCursor: rows.length > limit ? Buffer.from(items.at(-1).id).toString('base64url') : null };
            });
        },
    };
}
