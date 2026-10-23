// @ts-check
import { randomUUID, createHash } from 'node:crypto';
import { withScopedTransaction } from '../../platform/database/transaction.js';
import { executeCommand } from '../../platform/database/commands.js';
import { apiError } from '../../../middlewares/error-handler.js';

const view = row => ({ id: row.id, state: row.state, expectedBytes: row.expected_bytes,
    receivedBytes: row.received_bytes, expectedDigest: row.expected_digest.toString('hex'), expiresAt: row.expires_at.toISOString() });
const textTypes = new Set(['text/plain', 'text/markdown', 'text/csv', 'application/json']);
function releasableText(bytes, mediaType) {
    if (!textTypes.has(mediaType)) return false;
    try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (text.includes('\0') || /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(text)) return false;
        if (mediaType === 'application/json') JSON.parse(text);
        return true;
    } catch { return false; }
}

export function createUploads({ pool, projects, artifacts, operations }) {
    const lookup = async (tx, id, lock = false) => {
        const row = (await tx.query('SELECT *, expires_at>clock_timestamp() AS fresh FROM product.uploads WHERE id=$1' + (lock ? ' FOR UPDATE' : ''), [id])).rows[0];
        if (!row) throw apiError('NOT_FOUND', 'Upload was not found.', 404);
        return row;
    };
    return {
        async begin(scope, projectId, key, input) {
            return executeCommand(pool, scope, 'POST /projects/' + projectId + '/uploads', key, input, async tx => {
                await projects.requireActive(tx, projectId);
                const quota = (await tx.query(`SELECT
                    (SELECT COALESCE(sum(bytes),0) FROM product.artifacts WHERE project_id=$1) AS stored,
                    (SELECT COALESCE(sum(expected_bytes),0) FROM product.uploads WHERE project_id=$1 AND state='staged' AND expires_at>clock_timestamp()) AS pending,
                    (SELECT count(*) FROM product.uploads WHERE project_id=$1 AND state IN ('staged','uploaded','quarantined') AND expires_at>clock_timestamp()) AS active`, [projectId])).rows[0];
                if (BigInt(quota.stored) + BigInt(quota.pending) + BigInt(input.bytes) > 512n * 1024n * 1024n || BigInt(quota.active) >= 16n) {
                    throw apiError('QUOTA_EXCEEDED', 'Project upload quota has been reached.', 409);
                }
                const row = (await tx.query(`INSERT INTO product.uploads
                    (id,workspace_id,project_id,filename,media_type,expected_digest,expected_bytes,expires_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,clock_timestamp()+interval '24 hours') RETURNING *`,
                [randomUUID(), scope.workspaceId, projectId, input.filename, input.mediaType, Buffer.from(input.digest, 'hex'), input.bytes])).rows[0];
                return { status: 201, projectId, data: view(row) };
            });
        },
        async write(scope, id, bytes) {
            return withScopedTransaction(pool, scope, async tx => {
                const initial = await lookup(tx, id);
                await projects.requireActive(tx, initial.project_id);
                const upload = await lookup(tx, id, true);
                if (!upload.fresh) throw apiError('UPLOAD_EXPIRED', 'Upload has expired.', 409);
                if (!Buffer.isBuffer(bytes) || String(bytes.length) !== upload.expected_bytes || createHash('sha256').update(bytes).digest('hex') !== upload.expected_digest.toString('hex')) {
                    throw apiError('HASH_MISMATCH', 'Upload bytes do not match the declared size and digest.', 409);
                }
                if (['uploaded', 'available', 'quarantined'].includes(upload.state)) return view(upload);
                if (upload.state !== 'staged') throw apiError('STATE_CONFLICT', 'Upload cannot accept content.', 409);
                const artifactScope = { ...scope, projectId: upload.project_id };
                const artifact = await artifacts.store(tx, artifactScope, bytes, upload.media_type, 'quarantined');
                await artifacts.link(tx, artifactScope, artifact.id, 'upload', upload.id, 'upload');
                const row = (await tx.query("UPDATE product.uploads SET artifact_id=$2,received_bytes=$3,state='uploaded',version=version+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *", [id, artifact.id, bytes.length])).rows[0];
                return view(row);
            });
        },
        async complete(scope, id, key, input) {
            return executeCommand(pool, scope, 'POST /uploads/' + id + '/complete', key, input, async tx => {
                const initial = await lookup(tx, id);
                await projects.requireActive(tx, initial.project_id);
                const upload = await lookup(tx, id, true);
                if (!upload.fresh) throw apiError('UPLOAD_EXPIRED', 'Upload has expired.', 409);
                if (input.digest !== upload.expected_digest.toString('hex')) throw apiError('HASH_MISMATCH', 'Completion digest does not match the upload.', 409);
                if (!upload.artifact_id || upload.received_bytes !== upload.expected_bytes) throw apiError('INCOMPLETE_UPLOAD', 'Upload content is incomplete.', 409);
                const artifactScope = { ...scope, projectId: upload.project_id };
                let artifact = await artifacts.inspect(tx, artifactScope, upload.artifact_id);
                if (artifact.status === 'quarantined') {
                    const bytes = await artifacts.candidateContent(tx, artifactScope, artifact.id);
                    // This is a narrow UTF-8 text release policy, not a malware scanner or execution approval.
                    if (releasableText(bytes, upload.media_type)) artifact = await artifacts.release(tx, artifactScope, artifact.id);
                }
                await tx.query('UPDATE product.uploads SET state=$2,version=version+1,updated_at=clock_timestamp() WHERE id=$1', [id, artifact.status === 'available' ? 'available' : 'quarantined']);
                const operation = await operations.uploadResult(tx, artifactScope, artifact, { uploadId: id, ...input });
                return { status: 202, projectId: upload.project_id, data: operation };
            });
        },
    };
}
