// @ts-check
import { randomUUID } from 'node:crypto';
import { withScopedTransaction } from './transaction.js';
import { commandDigest } from '../../shared/canonicalization.js';
import { apiError } from '../../../middlewares/error-handler.js';

/** Commit a scoped command, its replay response, and an outbox event atomically. */
export function executeCommand(pool, scope, operation, key, input, work) {
    if (typeof key !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(key)) throw apiError('INVALID_INPUT', 'An Idempotency-Key is required.');
    const digest = commandDigest(input);
    return withScopedTransaction(pool, scope, async tx => {
        await tx.query(`INSERT INTO control.idempotency_records
            (workspace_id,principal_id,operation_key,idempotency_key,request_digest,status,expires_at)
            VALUES ($1,$2,$3,$4,$5,'in_progress',clock_timestamp()+interval '7 days') ON CONFLICT DO NOTHING`,
        [scope.workspaceId, scope.principalId, operation, key, digest]);
        const record = (await tx.query(`SELECT request_digest,status,response_status,response_body FROM control.idempotency_records
            WHERE workspace_id=$1 AND principal_id=$2 AND operation_key=$3 AND idempotency_key=$4 FOR UPDATE`,
        [scope.workspaceId, scope.principalId, operation, key])).rows[0];
        if (record.request_digest !== digest) throw apiError('IDEMPOTENCY_CONFLICT', 'Idempotency-Key was used with different input.', 409);
        if (record.status === 'completed') return { ...record.response_body, status: record.response_status };
        const response = await work(tx);
        await tx.query(`UPDATE control.idempotency_records SET status='completed',response_status=$5,response_body=$6
            WHERE workspace_id=$1 AND principal_id=$2 AND operation_key=$3 AND idempotency_key=$4`,
        [scope.workspaceId, scope.principalId, operation, key, response.status, response]);
        const event = { kind: operation, ...(response.data.id ? { resourceId: response.data.id } : {}) };
        await tx.query(`INSERT INTO control.outbox (event_id,workspace_id,project_id,topic,payload,payload_digest)
            VALUES ($1,$2,$3,$4,$5,$6)`, [randomUUID(), scope.workspaceId, response.projectId ?? null, 'product.command', event, commandDigest(event)]);
        return response;
    });
}
