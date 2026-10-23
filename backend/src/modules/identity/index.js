// @ts-check
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { withTransaction } from '../../platform/database/transaction.js';
import { apiError } from '../../../middlewares/error-handler.js';

const hash = value => createHash('sha256').update(value).digest();
const secret = () => randomBytes(32).toString('base64url');
const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const equal = (a, b) => a.length === b.length && timingSafeEqual(a, b);
const csrfFor = token => createHmac('sha256', token).update('asi.local.csrf.v1').digest('base64url');

/**
 * Durable local identity port. Owner status is rechecked on every request.
 * @param {{pool: import('pg').Pool, sessionTtlMs?: number, idleTtlMs?: number}} options
 */
export function createIdentity({ pool, sessionTtlMs = 8 * 60 * 60 * 1000, idleTtlMs = 30 * 60 * 1000 }) {
    for (const ttl of [sessionTtlMs, idleTtlMs]) {
        if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 2147483647) throw new Error('Invalid session lifetime');
    }
    const view = (row, csrfToken) => ({ principalId: row.principal_id, workspaceId: row.workspace_id,
        expiresAt: row.expires_at.toISOString(), csrfToken });
    async function bind(tx, key, value) {
        await tx.query('SELECT set_config($1, $2, true)', [key, hash(value).toString('hex')]);
    }
    return {
        /** Invoked over the trusted launcher channel, not exposed to HTTP. */
        async issueChallenge({ workspaceId, principalId, ttlMs = 60000 }) {
            if (!Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 120000) throw new Error('Invalid challenge lifetime');
            const challenge = secret(), clientNonce = secret();
            await withTransaction(pool, async tx => {
                await bind(tx, 'asi.bootstrap_hash', challenge);
                await tx.query(`INSERT INTO identity.bootstrap_challenges
                (challenge_id,workspace_id,principal_id,challenge_hash,nonce_hash,expires_at)
                VALUES ($1,$2,$3,$4,$5,clock_timestamp()+($6::integer * interval '1 millisecond'))`,
                [randomUUID(), workspaceId, principalId, hash(challenge), hash(clientNonce), ttlMs]);
            });
            return { challenge, clientNonce };
        },
        async bootstrap({ challenge, clientNonce, previousToken }) {
            if (!validToken(challenge) || !validToken(clientNonce)) throw apiError('INVALID_INPUT', 'A valid launcher challenge and nonce are required.');
            return withTransaction(pool, async tx => {
                await bind(tx, 'asi.bootstrap_hash', challenge);
                const result = await tx.query(`SELECT c.*, clock_timestamp() < c.expires_at AS fresh
                    FROM identity.bootstrap_challenges c JOIN identity.principals p USING (principal_id)
                    JOIN identity.workspaces w USING (workspace_id)
                    WHERE c.challenge_hash=$1 AND p.status='active' AND p.kind='local_user'
                    AND w.owner_principal_id=p.principal_id FOR UPDATE OF c`, [hash(challenge)]);
                const record = result.rows[0];
                if (!record || !equal(record.nonce_hash, hash(clientNonce))) throw apiError('UNAUTHENTICATED', 'Launcher challenge was rejected.', 401);
                if (record.consumed_at) throw apiError('ALREADY_USED', 'Launcher challenge has already been consumed.', 409);
                if (!record.fresh) throw apiError('CHALLENGE_EXPIRED', 'Launcher challenge has expired.', 401);
                const token = secret(), csrfToken = csrfFor(token);
                if (validToken(previousToken)) {
                    await bind(tx, 'asi.session_hash', previousToken);
                    await tx.query(`UPDATE identity.sessions SET revoked_at=clock_timestamp(), version=version+1
                        WHERE token_hash=$1 AND principal_id=$2`, [hash(previousToken), record.principal_id]);
                }
                await bind(tx, 'asi.session_hash', token);
                const session = await tx.query(`INSERT INTO identity.sessions
                    (session_id,workspace_id,principal_id,token_hash,csrf_hash,expires_at,idle_expires_at)
                    VALUES ($1,$2,$3,$4,$5,clock_timestamp()+($6::integer * interval '1 millisecond'),
                    clock_timestamp()+($7::integer * interval '1 millisecond')) RETURNING *`,
                [randomUUID(), record.workspace_id, record.principal_id, hash(token), hash(csrfToken), sessionTtlMs, Math.min(idleTtlMs, sessionTtlMs)]);
                await tx.query('UPDATE identity.bootstrap_challenges SET consumed_at=clock_timestamp() WHERE challenge_id=$1', [record.challenge_id]);
                return { token, data: view(session.rows[0], csrfToken) };
            });
        },
        async authenticate(token, csrfToken) {
            if (!validToken(token)) throw apiError('UNAUTHENTICATED', 'A valid local session is required.', 401);
            return withTransaction(pool, async tx => {
                await bind(tx, 'asi.session_hash', token);
                const result = await tx.query(`UPDATE identity.sessions s SET updated_at=clock_timestamp(),
                    idle_expires_at=LEAST(s.expires_at,clock_timestamp()+($2::integer * interval '1 millisecond'))
                    FROM identity.principals p, identity.workspaces w
                    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
                    AND s.idle_expires_at>clock_timestamp() AND p.principal_id=s.principal_id
                    AND p.status='active' AND p.kind='local_user' AND w.workspace_id=s.workspace_id
                    AND w.owner_principal_id=p.principal_id RETURNING s.*`, [hash(token), idleTtlMs]);
                const record = result.rows[0];
                if (!record) throw apiError('SESSION_EXPIRED', 'The local session has expired or was revoked.', 401);
                if (csrfToken !== undefined && (!validToken(csrfToken) || !equal(record.csrf_hash, hash(csrfToken)))) {
                    throw apiError('CSRF_FAILED', 'CSRF token was rejected.', 403);
                }
                return { principalId: record.principal_id, workspaceId: record.workspace_id, sessionId: record.session_id };
            });
        },
        async current(token) {
            if (!validToken(token)) throw apiError('UNAUTHENTICATED', 'A valid local session is required.', 401);
            const csrfToken = csrfFor(token);
            return withTransaction(pool, async tx => {
                await bind(tx, 'asi.session_hash', token);
                const result = await tx.query(`SELECT s.* FROM identity.sessions s
                    JOIN identity.principals p ON p.principal_id=s.principal_id
                    JOIN identity.workspaces w ON w.workspace_id=s.workspace_id AND w.owner_principal_id=s.principal_id
                    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
                    AND s.idle_expires_at>clock_timestamp() AND p.status='active' AND p.kind='local_user'`, [hash(token)]);
                if (!result.rows[0]) throw apiError('SESSION_EXPIRED', 'The local session has expired.', 401);
                return view(result.rows[0], csrfToken);
            });
        },
        async revoke(token, csrfToken, idempotencyKey) {
            if (!validToken(token) || !validToken(csrfToken)) throw apiError('CSRF_FAILED', 'Valid session and CSRF tokens are required.', 403);
            if (typeof idempotencyKey !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(idempotencyKey)) throw apiError('INVALID_INPUT', 'An Idempotency-Key is required.');
            await withTransaction(pool, async tx => {
                await bind(tx, 'asi.session_hash', token);
                const result = await tx.query('SELECT session_id,workspace_id,principal_id,csrf_hash FROM identity.sessions WHERE token_hash=$1 FOR UPDATE', [hash(token)]);
                if (!result.rows[0]) return;
                const row = result.rows[0];
                if (!equal(row.csrf_hash, hash(csrfToken))) throw apiError('CSRF_FAILED', 'CSRF token was rejected.', 403);
                await tx.query(`SELECT set_config('asi.workspace_id',$1,true),set_config('asi.principal_id',$2,true)`, [row.workspace_id, row.principal_id]);
                const digest = hash('logout-v1:' + row.session_id).toString('hex');
                await tx.query(`INSERT INTO control.idempotency_records
                    (workspace_id,principal_id,operation_key,idempotency_key,request_digest,status,response_status,expires_at)
                    VALUES ($1,$2,'DELETE /api/v1/session',$3,$4,'completed',204,clock_timestamp()+interval '7 days')
                    ON CONFLICT DO NOTHING`, [row.workspace_id, row.principal_id, idempotencyKey, digest]);
                const replay = await tx.query(`SELECT request_digest FROM control.idempotency_records
                    WHERE workspace_id=$1 AND principal_id=$2 AND operation_key='DELETE /api/v1/session'
                    AND idempotency_key=$3 FOR UPDATE`, [row.workspace_id, row.principal_id, idempotencyKey]);
                if (replay.rows[0]?.request_digest !== digest) throw apiError('IDEMPOTENCY_CONFLICT', 'Idempotency-Key belongs to a different session.', 409);
                await tx.query('UPDATE identity.sessions SET revoked_at=clock_timestamp(),version=version+1 WHERE token_hash=$1 AND revoked_at IS NULL', [hash(token)]);
            });
        },
        async workspaces(principalId, { limit, after }) {
            const result = await pool.query(`SELECT workspace_id, display_name, owner_principal_id FROM identity.workspaces
                WHERE owner_principal_id=$1 AND ($2::uuid IS NULL OR workspace_id>$2::uuid) ORDER BY workspace_id LIMIT $3`, [principalId, after, limit + 1]);
            const rows = result.rows.slice(0, limit);
            return { data: rows.map(row => ({ id: row.workspace_id, name: row.display_name, ownerPrincipalId: row.owner_principal_id, status: 'active' })),
                nextCursor: result.rows.length > limit ? Buffer.from(rows.at(-1).workspace_id).toString('base64url') : null };
        },
    };
}
