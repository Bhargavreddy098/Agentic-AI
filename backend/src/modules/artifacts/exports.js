// @ts-check
import { randomUUID } from 'node:crypto';
import { executeCommand } from '../../platform/database/commands.js';
import { withScopedTransaction } from '../../platform/database/transaction.js';
import { exportLocal } from '../../platform/repository/export.js';
import { commandDigest } from '../../shared/canonicalization.js';
import { apiError } from '../../../middlewares/error-handler.js';
export function createExports({ pool, artifacts }) {
    return { async create(scope, artifactId, key, input) {
        /** @type {{ value: { id: string, projectId: string } | null }} */
        const dispatch = { value: null };
        const response = await executeCommand(pool, scope, 'POST /artifacts/' + artifactId + '/export', key, input, async tx => {
            const artifact = await artifacts.inspect(tx, scope, artifactId);
            if (artifact.status !== 'available') throw apiError('ARTIFACT_UNAVAILABLE', 'Artifact is not released.', 409);
            const destination = (await tx.query('SELECT id FROM identity.export_destinations WHERE id=$1 AND project_id=$2 AND revoked_at IS NULL FOR SHARE', [input.destinationRef, artifact.projectId])).rows[0];
            if (!destination) throw apiError('DESTINATION_NOT_ALLOWED', 'Destination is not authorized for this project.', 403);
            const id = randomUUID(); dispatch.value = { id, projectId: artifact.projectId };
            const row = (await tx.query(`INSERT INTO control.operations (id,workspace_id,project_id,kind,state,request_digest,input_ref,input,deadline_at)
                VALUES ($1,$2,$3,'artifact.export','running',$4,$5,$6,clock_timestamp()+interval '30 seconds') RETURNING *`,
            [id,scope.workspaceId,artifact.projectId,Buffer.from(commandDigest(input),'hex'),artifactId,input])).rows[0];
            return { status: 202, projectId: artifact.projectId, data: { id, kind: row.kind, state: row.state, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() } };
        });
        // A replay never redispatches a potentially completed external write, including after a crash.
        const accepted = dispatch.value;
        if (!accepted) return response;
        let failed = false;
        try {
            await withScopedTransaction(pool, { ...scope, projectId: accepted.projectId }, async tx => {
                const destination = (await tx.query('SELECT canonical_path FROM identity.export_destinations WHERE id=$1 AND project_id=$2 AND revoked_at IS NULL FOR SHARE', [input.destinationRef,accepted.projectId])).rows[0];
                if (!destination) throw apiError('DESTINATION_NOT_ALLOWED','Destination authorization was revoked.',403);
                const bytes = await artifacts.content(tx,{...scope,projectId:accepted.projectId},artifactId);
                await exportLocal(destination.canonical_path,bytes);
                await tx.query("UPDATE control.operations SET state='succeeded',updated_at=clock_timestamp(),version=version+1 WHERE id=$1 AND state='running'",[accepted.id]);
            });
        } catch { failed = true; }
        if (failed) await withScopedTransaction(pool,scope,tx=>tx.query("UPDATE control.operations SET state='blocked',safe_error=$2,updated_at=clock_timestamp() WHERE id=$1",[accepted.id,{code:'EXPORT_OUTCOME_UNKNOWN',detail:'Export refused or outcome unknown. Reconcile the authorized destination before another export.'}]));
        // Durable polling owns the final state; initial response remains stable across retries.
        return response;
    } };
}
