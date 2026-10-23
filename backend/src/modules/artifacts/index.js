// @ts-check
import { randomUUID } from 'node:crypto';
import { withScopedTransaction } from '../../platform/database/transaction.js';
import { apiError } from '../../../middlewares/error-handler.js';

export const artifactView = row => ({ id: row.id, projectId: row.project_id, digest: row.digest.toString('hex'),
    bytes: row.bytes, mediaType: row.media_type, status: row.status, classification: row.classification,
    createdAt: row.created_at.toISOString(), provenanceRefs: [] });

/** Artifact port; encrypted bytes never become executable host paths. */
export function createArtifacts({ pool, blobs, projects }) {
    const lookup = async (tx, id, projectId) => {
        const row = (await tx.query('SELECT * FROM product.artifacts WHERE id=$1 AND ($2::uuid IS NULL OR project_id=$2)', [id, projectId ?? null])).rows[0];
        if (!row) throw apiError('NOT_FOUND', 'Artifact was not found.', 404);
        return row;
    };
    return {
        async inspect(tx, scope, id) { return artifactView(await lookup(tx, id, scope.projectId)); },
        async link(tx, scope, artifactId, kind, subjectId, purpose) {
            const table = { message: 'product.messages', conversation: 'product.conversations', upload: 'product.uploads' }[kind];
            if (!table) throw new Error('Unsupported artifact link subject');
            const subject = await tx.query(`SELECT id FROM ${table} WHERE id=$1 AND project_id=$2`, [subjectId, scope.projectId]);
            if (!subject.rows.length) throw apiError('NOT_FOUND', 'Artifact subject was not found.', 404);
            await tx.query(`INSERT INTO product.artifact_links (id,workspace_id,project_id,artifact_id,subject_kind,subject_id,purpose)
                VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`, [randomUUID(), scope.workspaceId, scope.projectId, artifactId, kind, subjectId, purpose]);
        },
        async candidateContent(tx, scope, id) {
            const row = await lookup(tx, id, scope.projectId);
            if (!['quarantined', 'available'].includes(row.status)) throw apiError('ARTIFACT_UNAVAILABLE', 'Artifact cannot be inspected.', 409);
            return blobs.read(scope, row.digest.toString('hex'), row.bytes);
        },
        async release(tx, scope, id) {
            const result = await tx.query("UPDATE product.artifacts SET status='available' WHERE id=$1 AND project_id=$2 AND status='quarantined' RETURNING *", [id, scope.projectId]);
            if (!result.rows[0]) throw apiError('STATE_CONFLICT', 'Artifact release state changed.', 409);
            return artifactView(result.rows[0]);
        },
        async store(tx, scope, bytes, mediaType, status = 'available') {
            await projects.requireActive(tx, scope.projectId);
            const used = (await tx.query('SELECT COALESCE(sum(bytes),0) AS bytes FROM product.artifacts WHERE project_id=$1', [scope.projectId])).rows[0].bytes;
            if (BigInt(used) + BigInt(bytes.length) > 512n * 1024n * 1024n) throw apiError('QUOTA_EXCEEDED', 'Project artifact quota has been reached.', 409);
            const stored = await blobs.write(scope, bytes);
            const row = (await tx.query(`INSERT INTO product.artifacts
                (id,workspace_id,project_id,digest,bytes,media_type,storage_key,status,classification)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'confidential') RETURNING *`,
            [randomUUID(), scope.workspaceId, scope.projectId, Buffer.from(stored.digest, 'hex'), stored.bytes, mediaType, stored.storageKey, status])).rows[0];
            return artifactView(row);
        },
        async content(tx, scope, id) {
            const row = await lookup(tx, id, scope.projectId);
            if (row.status !== 'available') throw apiError('ATTACHMENT_UNAVAILABLE', 'Artifact is not available.', 409);
            try { return await blobs.read({ ...scope, projectId: row.project_id }, row.digest.toString('hex'), row.bytes); }
            catch { throw apiError('ARTIFACT_INTEGRITY_FAILED', 'Artifact content could not be verified.', 503); }
        },
        async validateAttachments(tx, projectId, ids) {
            if (!ids.length) return;
            const result = await tx.query("SELECT id FROM product.artifacts WHERE project_id=$1 AND id=ANY($2::uuid[]) AND status='available'", [projectId, ids]);
            if (result.rows.length !== ids.length) throw apiError('ATTACHMENT_UNAVAILABLE', 'One or more attachments are unavailable in this project.', 409);
        },
        async read(scope, id) { return withScopedTransaction(pool, scope, async tx => {
            const artifact = artifactView(await lookup(tx, id));
            const links = await tx.query('SELECT id FROM product.artifact_links WHERE artifact_id=$1 ORDER BY id', [id]);
            return { ...artifact, provenanceRefs: links.rows.map(row => row.id) };
        }); },
        async download(scope, id) {
            return withScopedTransaction(pool, scope, async tx => {
                const row = await lookup(tx, id);
                if (row.status !== 'available') throw apiError('ATTACHMENT_UNAVAILABLE', 'Artifact is not released for download.', 409);
                return { artifact: artifactView(row), bytes: await this.content(tx, { ...scope, projectId: row.project_id }, id) };
            });
        },
        async list(scope, projectId, { limit, after }) {
            return withScopedTransaction(pool, scope, async tx => {
                await projects.readInTransaction(tx, projectId);
                const result = await tx.query('SELECT * FROM product.artifacts WHERE project_id=$1 AND ($2::uuid IS NULL OR id>$2::uuid) ORDER BY id LIMIT $3', [projectId, after, limit + 1]);
                const rows = result.rows.slice(0, limit);
                return { data: rows.map(artifactView), nextCursor: result.rows.length > limit ? Buffer.from(rows.at(-1).id).toString('base64url') : null };
            });
        },
    };
}
