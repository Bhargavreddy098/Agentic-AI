// @ts-check
import { randomUUID } from 'node:crypto';
import { executeCommand } from '../../platform/database/commands.js';
import { captureRepository } from '../../platform/repository/index.js';
import { canonicalJson, commandDigest } from '../../shared/canonicalization.js';
import { apiError } from '../../../middlewares/error-handler.js';

/** Snapshot capture is bounded local read-only work; no task dispatcher or model call. */
export function createSnapshots({ pool, projects, artifacts, capture = captureRepository }) {
    return {
        async create(scope, projectId, key, input) {
            return executeCommand(pool, scope, 'POST /projects/' + projectId + '/snapshots', key, input, async tx => {
                const project = await projects.requireActive(tx, projectId);
                if (!project.workspaceRootRef) throw apiError('ROOT_NOT_AUTHORIZED', 'Project has no authorized repository root.', 403);
                // Hold the root lock through capture and commit so revocation cannot race acceptance.
                const root = (await tx.query('SELECT canonical_path FROM identity.workspace_roots WHERE id=$1 AND revoked_at IS NULL FOR SHARE', [project.workspaceRootRef])).rows[0];
                if (!root) throw apiError('ROOT_NOT_AUTHORIZED', 'Repository root authorization was revoked.', 403);
                const captured = await capture(root.canonical_path, input.includeUncommitted);
                const document = { schemaVersion: 1, commitSha: captured.commitSha,
                    removedPaths: captured.removedPaths.slice().sort(),
                    files: captured.files.map(file => ({ path: file.path, mode: file.mode, digest: file.digest, content: file.bytes.toString('base64') })) };
                const bytes = Buffer.from(canonicalJson(document));
                if (bytes.length > 16 * 1024 * 1024) throw apiError('QUOTA_EXCEEDED', 'Snapshot exceeds the bounded artifact size.', 409);
                const artifact = await artifacts.store(tx, { ...scope, projectId }, bytes, 'application/json', 'quarantined');
                const id = randomUUID();
                await tx.query(`INSERT INTO product.repository_snapshots (id,workspace_id,project_id,commit_sha,tree_digest,artifact_id)
                    VALUES ($1,$2,$3,$4,$5,$6)`, [id, scope.workspaceId, projectId, captured.commitSha, Buffer.from(commandDigest(document), 'hex'), artifact.id]);
                const row = (await tx.query(`INSERT INTO control.operations
                    (id,workspace_id,project_id,kind,state,request_digest,input_ref,result_type,result_id,deadline_at)
                    VALUES ($1,$2,$3,'snapshot.create','succeeded',$4,$5,'repository_snapshot',$6,clock_timestamp()+interval '30 seconds') RETURNING *`,
                [randomUUID(), scope.workspaceId, projectId, Buffer.from(commandDigest(input), 'hex'), artifact.id, id])).rows[0];
                return { status: 202, projectId, data: { id: row.id, kind: row.kind, state: row.state, resourceType: row.result_type, resourceId: row.result_id,
                    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() } };
            });
        },
    };
}
