// @ts-check
import { randomUUID } from 'node:crypto';
import { withScopedTransaction } from '../../platform/database/transaction.js';
import { commandDigest } from '../../shared/canonicalization.js';
import { apiError } from '../../../middlewares/error-handler.js';

const view = row => ({ id: row.id, kind: row.kind, state: row.state,
    ...(row.result_id ? { resourceType: row.result_type, resourceId: row.result_id } : {}),
    ...(row.safe_error ? { safeError: row.safe_error } : {}), createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() });
export function createOperations({ pool }) {
    return {
        async uploadResult(tx, scope, artifact, input) {
            const blocked = artifact.status !== 'available';
            const row = (await tx.query(`INSERT INTO control.operations
                (id,workspace_id,project_id,kind,state,request_digest,input_ref,result_type,result_id,deadline_at,safe_error)
                VALUES ($1,$2,$3,'upload.complete',$4,$5,$6,$7,$8,clock_timestamp()+interval '30 seconds',$9) RETURNING *`,
            [randomUUID(), scope.workspaceId, scope.projectId, blocked ? 'blocked' : 'succeeded', Buffer.from(commandDigest(input), 'hex'), artifact.id,
                blocked ? null : 'artifact', blocked ? null : artifact.id,
                blocked ? { code: 'QUARANTINED', detail: 'This content has not passed an available release policy.' } : null])).rows[0];
            return view(row);
        },
        async providerDiscovery(tx, scope, providerId, input) {
            const row = (await tx.query(`INSERT INTO control.operations
                (id,workspace_id,project_id,kind,state,request_digest,input,result_type,result_id,deadline_at)
                VALUES ($1,$2,$3,'provider.discovery','succeeded',$4,$5,'provider',$6,clock_timestamp()+interval '30 seconds') RETURNING *`,
            [randomUUID(), scope.workspaceId, scope.projectId ?? null, Buffer.from(commandDigest(input), 'hex'), input, providerId])).rows[0];
            return view(row);
        },
        async read(scope, id) {
            return withScopedTransaction(pool, scope, async tx => {
                const row = (await tx.query('SELECT * FROM control.operations WHERE id=$1', [id])).rows[0];
                if (!row) throw apiError('NOT_FOUND', 'Operation was not found.', 404);
                return view(row);
            });
        },
    };
}
