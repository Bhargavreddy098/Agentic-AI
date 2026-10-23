// @ts-check
import { randomUUID } from 'node:crypto';
import { executeCommand } from '../../platform/database/commands.js';
import { withScopedTransaction } from '../../platform/database/transaction.js';
import { apiError } from '../../../middlewares/error-handler.js';

const MAX_MICRO_USD = 9223372036854775807n;

function amount(value, label) {
    if (typeof value !== 'string' || !/^\d{1,19}$/.test(value)) throw apiError('INVALID_INPUT', 'Invalid ' + label + '.');
    const parsed = BigInt(value);
    if (parsed > MAX_MICRO_USD) throw apiError('INVALID_INPUT', 'Invalid ' + label + '.');
    return parsed;
}

const accountView = (row, reservations = []) => ({
    id: row.id,
    scopeKind: row.scope_kind,
    scopeId: row.scope_id,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    limitMicroUsd: String(row.limit_micro_usd),
    spentMicroUsd: String(row.spent_micro_usd),
    reservedMicroUsd: String(row.reserved_micro_usd),
    version: String(row.version),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    reservations,
});

const reservationView = row => ({
    id: row.id,
    budgetAccountId: row.budget_account_id,
    operationKey: row.operation_key,
    ceilingMicroUsd: String(row.ceiling_micro_usd),
    ...(row.actual_micro_usd === null ? {} : { actualMicroUsd: String(row.actual_micro_usd) }),
    state: row.state,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
});

const usageView = row => ({
    id: row.id,
    operationKey: row.operation_key,
    ...(row.provider_request_id ? { providerRequestId: row.provider_request_id } : {}),
    category: row.category,
    units: String(row.units),
    ...(row.pricing_revision ? { pricingRevision: row.pricing_revision } : {}),
    estimatedMicroUsd: String(row.estimated_micro_usd),
    ...(row.actual_micro_usd === null ? {} : { actualMicroUsd: String(row.actual_micro_usd) }),
    state: row.state,
    reconciliationVersion: row.reconciliation_version,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.run_id ? { runId: row.run_id } : {}),
    createdAt: row.created_at.toISOString(),
});

function available(row) {
    return BigInt(row.limit_micro_usd) - BigInt(row.spent_micro_usd) - BigInt(row.reserved_micro_usd);
}

export function createBudgets({ pool, audit }) {
    const requireAudit = () => {
        if (!audit) throw apiError('CAPABILITY_UNAVAILABLE', 'Audit is not configured.', 503);
        return audit;
    };
    const account = async (tx, id, lock = false) => {
        const row = (await tx.query('SELECT * FROM control.budget_accounts WHERE id=$1' + (lock ? ' FOR UPDATE' : ''), [id])).rows[0];
        if (!row) throw apiError('NOT_FOUND', 'Budget was not found.', 404);
        return row;
    };
    return {
        async create(scope, projectId, key, input) {
            return executeCommand(pool, scope, 'POST /projects/' + projectId + '/budgets', key, input, async tx => {
                const project = (await tx.query('SELECT status FROM product.projects WHERE project_id=$1 FOR UPDATE', [projectId])).rows[0];
                if (!project) throw apiError('NOT_FOUND', 'Project was not found.', 404);
                if (project.status !== 'active') throw apiError('PROJECT_ARCHIVED', 'Project is archived.', 409);
                const limit = amount(input.limitMicroUsd, 'limitMicroUsd');
                const scopeKind = input.scopeKind;
                if (!['project', 'run'].includes(scopeKind)) throw apiError('INVALID_INPUT', 'Invalid budget scope.');
                if (scopeKind === 'run' && !input.runId) throw apiError('INVALID_INPUT', 'runId is required for a run budget.');
                const scopeId = scopeKind === 'run' ? input.runId : projectId;
                const existing = (await tx.query('SELECT id FROM control.budget_accounts WHERE workspace_id=$1 AND scope_kind=$2 AND scope_id=$3',
                    [scope.workspaceId, scopeKind, scopeId])).rows[0];
                if (existing) throw apiError('BUDGET_EXISTS', 'A budget already exists for this scope.', 409);
                const id = randomUUID();
                const row = (await tx.query(`INSERT INTO control.budget_accounts
                    (id,workspace_id,project_id,scope_kind,scope_id,limit_micro_usd,created_by)
                    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
                [id, scope.workspaceId, projectId, scopeKind, scopeId, limit.toString(), scope.principalId])).rows[0];
                await requireAudit().append(tx, scope, {
                    action: 'budget.created',
                    targetRef: id,
                    metadata: { projectId, scopeKind, limitMicroUsd: limit.toString(), reason: input.reason ?? '' },
                });
                return { status: 201, projectId, data: accountView(row) };
            });
        },
        async list(scope, projectId) {
            return withScopedTransaction(pool, scope, async tx => {
                const accounts = (await tx.query(`SELECT * FROM control.budget_accounts
                    WHERE project_id=$1 AND scope_kind IN ('project','run') ORDER BY scope_kind,id`, [projectId])).rows;
                if (accounts.length === 0) return { data: [] };
                const reservations = (await tx.query(`SELECT * FROM control.budget_reservations
                    WHERE budget_account_id = ANY($1::uuid[]) ORDER BY created_at DESC`, [accounts.map(row => row.id)])).rows;
                const byAccount = new Map();
                for (const row of reservations) {
                    const list = byAccount.get(row.budget_account_id) ?? [];
                    list.push(reservationView(row));
                    byAccount.set(row.budget_account_id, list);
                }
                return { data: accounts.map(row => accountView(row, byAccount.get(row.id) ?? [])) };
            });
        },
        async update(scope, budgetId, key, expectedVersion, input) {
            return executeCommand(pool, scope, 'PATCH /budgets/' + budgetId, key, input, async tx => {
                const existing = await account(tx, budgetId, true);
                if (String(existing.version) !== expectedVersion) throw apiError('VERSION_CONFLICT', 'Budget version does not match If-Match.', 412);
                const limit = amount(input.limitMicroUsd, 'limitMicroUsd');
                if (limit < BigInt(existing.spent_micro_usd) + BigInt(existing.reserved_micro_usd)) throw apiError('BELOW_COMMITTED_SPEND', 'Limit is below committed spend and reservations.', 409);
                const row = (await tx.query(`UPDATE control.budget_accounts
                    SET limit_micro_usd=$2,version=version+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
                [budgetId, limit.toString()])).rows[0];
                await requireAudit().append(tx, scope, {
                    action: 'budget.updated',
                    targetRef: budgetId,
                    metadata: { projectId: row.project_id, previousLimitMicroUsd: String(existing.limit_micro_usd), limitMicroUsd: limit.toString(), reason: input.reason ?? '' },
                });
                return { status: 200, projectId: row.project_id, data: accountView(row) };
            });
        },
        async reserve(scope, input) {
            const ceiling = amount(input.ceilingMicroUsd, 'ceilingMicroUsd');
            if (typeof input.operationKey !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(input.operationKey)) throw apiError('INVALID_INPUT', 'Invalid operationKey.');
            return withScopedTransaction(pool, { ...scope, projectId: input.projectId }, async tx => {
                const projectAccount = (await tx.query(`SELECT * FROM control.budget_accounts
                    WHERE scope_kind='project' AND scope_id=$1 FOR UPDATE`, [input.projectId])).rows[0];
                if (!projectAccount) throw apiError('BUDGET_REQUIRED', 'A project budget is required before reserving spend.', 409);
                const workspaceAccount = (await tx.query(`SELECT * FROM control.budget_accounts
                    WHERE scope_kind='workspace' AND scope_id=$1 FOR UPDATE`, [scope.workspaceId])).rows[0];
                const existing = (await tx.query('SELECT * FROM control.budget_reservations WHERE budget_account_id=$1 AND operation_key=$2',
                    [projectAccount.id, input.operationKey])).rows[0];
                if (existing) {
                    if (BigInt(existing.ceiling_micro_usd) !== ceiling) throw apiError('IDEMPOTENCY_CONFLICT', 'Operation key was reserved with a different ceiling.', 409);
                    return reservationView(existing);
                }
                if (ceiling > available(projectAccount)) throw apiError('BUDGET_EXCEEDED', 'Project budget ceiling would be exceeded.', 409);
                if (workspaceAccount && ceiling > available(workspaceAccount)) throw apiError('BUDGET_EXCEEDED', 'Workspace budget ceiling would be exceeded.', 409);
                const id = randomUUID();
                const row = (await tx.query(`INSERT INTO control.budget_reservations
                    (id,workspace_id,project_id,budget_account_id,workspace_account_id,operation_key,ceiling_micro_usd,state)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,'held') RETURNING *`,
                [id, scope.workspaceId, input.projectId, projectAccount.id, workspaceAccount?.id ?? null, input.operationKey, ceiling.toString()])).rows[0];
                await tx.query('UPDATE control.budget_accounts SET reserved_micro_usd=reserved_micro_usd+$2,version=version+1,updated_at=clock_timestamp() WHERE id=$1',
                    [projectAccount.id, ceiling.toString()]);
                if (workspaceAccount) await tx.query('UPDATE control.budget_accounts SET reserved_micro_usd=reserved_micro_usd+$2,version=version+1,updated_at=clock_timestamp() WHERE id=$1',
                    [workspaceAccount.id, ceiling.toString()]);
                await requireAudit().append(tx, scope, {
                    action: 'budget.reserved',
                    targetRef: id,
                    metadata: { projectId: input.projectId, operationKey: input.operationKey, ceilingMicroUsd: ceiling.toString() },
                });
                return reservationView(row);
            });
        },
        async settle(scope, reservationId, actualMicroUsd) {
            const actual = amount(actualMicroUsd, 'actualMicroUsd');
            return withScopedTransaction(pool, scope, async tx => {
                const row = (await tx.query('SELECT * FROM control.budget_reservations WHERE id=$1 FOR UPDATE', [reservationId])).rows[0];
                if (!row) throw apiError('NOT_FOUND', 'Budget reservation was not found.', 404);
                if (row.state === 'settled') return reservationView(row);
                if (row.state === 'released') throw apiError('RESERVATION_RELEASED', 'Released reservations cannot be settled.', 409);
                if (actual > BigInt(row.ceiling_micro_usd)) throw apiError('ACTUAL_EXCEEDS_RESERVATION', 'Actual cost exceeds the reserved ceiling; reconcile the reservation first.', 409);
                const updated = (await tx.query(`UPDATE control.budget_reservations
                    SET state='settled',actual_micro_usd=$2,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
                [reservationId, actual.toString()])).rows[0];
                const projectUpdate = await tx.query(`UPDATE control.budget_accounts SET reserved_micro_usd=reserved_micro_usd-$2,
                    spent_micro_usd=spent_micro_usd+$3,version=version+1,updated_at=clock_timestamp()
                    WHERE id=$1 AND reserved_micro_usd >= $2`, [row.budget_account_id, row.ceiling_micro_usd, actual.toString()]);
                if (projectUpdate.rowCount !== 1) throw apiError('BUDGET_COUNTER_MISMATCH', 'Budget reservation counters are inconsistent.', 500);
                if (row.workspace_account_id) {
                    const workspaceUpdate = await tx.query(`UPDATE control.budget_accounts SET reserved_micro_usd=reserved_micro_usd-$2,
                        spent_micro_usd=spent_micro_usd+$3,version=version+1,updated_at=clock_timestamp()
                        WHERE id=$1 AND reserved_micro_usd >= $2`, [row.workspace_account_id, row.ceiling_micro_usd, actual.toString()]);
                    if (workspaceUpdate.rowCount !== 1) throw apiError('BUDGET_COUNTER_MISMATCH', 'Workspace budget reservation counters are inconsistent.', 500);
                }
                await tx.query(`INSERT INTO ops.usage_entries
                    (id,workspace_id,project_id,operation_key,category,units,estimated_micro_usd,actual_micro_usd,state)
                    VALUES ($1,$2,$3,$4,'budget.settlement',0,$5,$6,'actual')`,
                [randomUUID(), scope.workspaceId, row.project_id, row.operation_key, row.ceiling_micro_usd, actual.toString()]);
                await requireAudit().append(tx, scope, {
                    action: 'budget.settled',
                    targetRef: reservationId,
                    metadata: { projectId: row.project_id, operationKey: row.operation_key, actualMicroUsd: actual.toString() },
                });
                return reservationView(updated);
            });
        },
        async release(scope, reservationId, reason) {
            return withScopedTransaction(pool, scope, async tx => {
                const row = (await tx.query('SELECT * FROM control.budget_reservations WHERE id=$1 FOR UPDATE', [reservationId])).rows[0];
                if (!row) throw apiError('NOT_FOUND', 'Budget reservation was not found.', 404);
                if (row.state === 'released') return reservationView(row);
                if (row.state === 'settled') throw apiError('RESERVATION_SETTLED', 'Settled reservations cannot be released.', 409);
                const updated = (await tx.query(`UPDATE control.budget_reservations
                    SET state='released',updated_at=clock_timestamp() WHERE id=$1 RETURNING *`, [reservationId])).rows[0];
                const projectUpdate = await tx.query(`UPDATE control.budget_accounts SET reserved_micro_usd=reserved_micro_usd-$2,
                    version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND reserved_micro_usd >= $2`,
                [row.budget_account_id, row.ceiling_micro_usd]);
                if (projectUpdate.rowCount !== 1) throw apiError('BUDGET_COUNTER_MISMATCH', 'Budget reservation counters are inconsistent.', 500);
                if (row.workspace_account_id) {
                    const workspaceUpdate = await tx.query(`UPDATE control.budget_accounts SET reserved_micro_usd=reserved_micro_usd-$2,
                        version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND reserved_micro_usd >= $2`,
                    [row.workspace_account_id, row.ceiling_micro_usd]);
                    if (workspaceUpdate.rowCount !== 1) throw apiError('BUDGET_COUNTER_MISMATCH', 'Workspace budget reservation counters are inconsistent.', 500);
                }
                await requireAudit().append(tx, scope, {
                    action: 'budget.released',
                    targetRef: reservationId,
                    metadata: { projectId: row.project_id, operationKey: row.operation_key, reason: reason ?? '' },
                });
                return reservationView(updated);
            });
        },
        async markUnknown(scope, reservationId) {
            return withScopedTransaction(pool, scope, async tx => {
                const row = (await tx.query('SELECT * FROM control.budget_reservations WHERE id=$1 FOR UPDATE', [reservationId])).rows[0];
                if (!row) throw apiError('NOT_FOUND', 'Budget reservation was not found.', 404);
                if (row.state !== 'held') return reservationView(row);
                const updated = (await tx.query(`UPDATE control.budget_reservations SET state='unknown',updated_at=clock_timestamp()
                    WHERE id=$1 RETURNING *`, [reservationId])).rows[0];
                await requireAudit().append(tx, scope, { action: 'budget.unknown', targetRef: reservationId, metadata: { projectId: row.project_id, operationKey: row.operation_key } });
                return reservationView(updated);
            });
        },
        async recordUsage(scope, input) {
            if (typeof input.operationKey !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(input.operationKey)) throw apiError('INVALID_INPUT', 'Invalid operationKey.');
            if (typeof input.category !== 'string' || !/^[a-z][a-z0-9_.:-]{2,63}$/.test(input.category)) throw apiError('INVALID_INPUT', 'Invalid usage category.');
            const estimated = amount(input.estimatedMicroUsd, 'estimatedMicroUsd');
            const actual = input.actualMicroUsd === undefined ? null : amount(input.actualMicroUsd, 'actualMicroUsd');
            const units = input.units === undefined ? 0n : amount(String(input.units), 'units');
            if (actual === null) throw apiError('INVALID_INPUT', 'Actual usage is required for reconciliation.');
            return withScopedTransaction(pool, { ...scope, projectId: input.projectId }, async tx => {
                const existing = (await tx.query(`SELECT * FROM ops.usage_entries
                    WHERE workspace_id=$1 AND operation_key=$2 AND category=$3 AND reconciliation_version=0`,
                [scope.workspaceId, input.operationKey, input.category])).rows[0];
                if (existing) return usageView(existing);
                const row = (await tx.query(`INSERT INTO ops.usage_entries
                    (id,workspace_id,project_id,run_id,operation_key,provider_request_id,category,units,pricing_revision,estimated_micro_usd,actual_micro_usd,state)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'actual') RETURNING *`,
                [randomUUID(), scope.workspaceId, input.projectId, input.runId ?? null, input.operationKey,
                    input.providerRequestId ?? null, input.category, units.toString(), input.pricingRevision ?? null,
                    estimated.toString(), actual.toString()])).rows[0];
                await requireAudit().append(tx, scope, {
                    action: 'usage.recorded',
                    targetRef: row.id,
                    metadata: { projectId: input.projectId, operationKey: input.operationKey, category: input.category, actualMicroUsd: actual.toString() },
                });
                return usageView(row);
            });
        },
        async usage(scope, { limit, after, projectId, runId, category, from, to }) {
            return withScopedTransaction(pool, scope, async tx => {
                const rows = (await tx.query(`SELECT * FROM ops.usage_entries
                    WHERE ($1::uuid IS NULL OR project_id=$1) AND ($2::text IS NULL OR category=$2)
                    AND ($3::timestamptz IS NULL OR created_at >= $3) AND ($4::timestamptz IS NULL OR created_at <= $4)
                    AND ($5::uuid IS NULL OR id<$5::uuid)
                    AND ($6::uuid IS NULL OR run_id=$6)
                    ORDER BY id DESC LIMIT $7`,
                [projectId ?? null, category ?? null, from ?? null, to ?? null, after, runId ?? null, limit + 1])).rows;
                const items = rows.slice(0, limit);
                return { data: items.map(usageView), nextCursor: rows.length > limit ? Buffer.from(items.at(-1).id).toString('base64url') : null };
            });
        },
    };
}
