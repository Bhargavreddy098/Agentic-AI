// @ts-check
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { withScopedTransaction } from '../../platform/database/transaction.js';
import { executeCommand } from '../../platform/database/commands.js';
import { commandDigest } from '../../shared/canonicalization.js';
import { apiError } from '../../../middlewares/error-handler.js';
import { evaluatePolicy } from '../governance/policy.js';
import { terminal, assertTransition, checkpointSchema, validateDag, effectKey } from './contracts.js';
const missing = () => apiError('NOT_FOUND', 'Execution record was not found.', 404);
const conflict = () => apiError('STALE_LEASE', 'Execution ownership was lost.', 409);
const jsonDigest = value => Buffer.from(commandDigest(value), 'hex');
const taskView = row => ({ id: row.id, runId: row.run_id, stepKey: row.step_key, state: row.state, attempt: row.attempt, maxAttempts: row.max_attempts, deadlineAt: row.deadline_at.toISOString(), leaseEpoch: row.lease_epoch, dependencies: row.dependencies ?? [], artifactIds: row.artifact_ids ?? [] });
const effectView = row => ({ id: row.id, runId: row.run_id, taskId: row.task_id, toolId: row.tool_id, inputDigest: row.input_digest.toString('hex'), targetSummary: row.target_ref, risk: row.risk, state: row.state, ...(row.approval_id ? { approvalId: row.approval_id } : {}), ...(row.receipt_ref ? { receiptRef: row.receipt_ref } : {}), ...(row.external_operation_id ? { externalOperationId: row.external_operation_id } : {}) });
const checkpointView = row => ({ id: row.id, runId: row.run_id, sequence: row.sequence, epoch: row.epoch, stateDigest: row.state_digest.toString('hex'), createdAt: row.created_at.toISOString() });
const eventView = row => ({ schemaVersion: 1, eventId: row.event_id, runId: row.run_id, sequence: row.sequence, type: row.type, occurredAt: row.created_at.toISOString(), payload: row.safe_payload, traceId: row.trace_id });
/** Trusted control-plane port. No worker connection or host execution is exposed. */
export function createOrchestration({ pool, audit, artifacts = undefined, qualificationMode = false, fault = undefined }) {
    if (fault && !qualificationMode)
        throw new Error('Fault injection is qualification-only');
    const transaction = (scope, work) => withScopedTransaction(pool, scope, async (tx) => { const owner = (await tx.query(`SELECT 1 FROM identity.workspaces w JOIN identity.principals p ON p.principal_id=w.owner_principal_id WHERE w.workspace_id=$1 AND p.principal_id=$2 AND p.kind='local_user' AND p.status='active'`, [scope.workspaceId, scope.principalId])).rows[0]; if (!owner)
        throw apiError('FORBIDDEN', 'An active local owner is required.', 403); return work(tx); });
    const run = async (tx, scope, id, lock = true) => { const row = (await tx.query('SELECT * FROM control.runs WHERE id=$1 AND owner_principal_id=$2' + (lock ? ' FOR UPDATE' : ''), [id, scope.principalId])).rows[0]; if (!row)
        throw missing(); return row; };
    const append = async (tx, scope, r, type, payload) => { const allocated = (await tx.query('UPDATE control.runs SET next_event_sequence=next_event_sequence+1,version=version+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING next_event_sequence-1 AS sequence', [r.id])).rows[0]; const id = randomUUID(); const event = (await tx.query(`INSERT INTO control.run_events(workspace_id,project_id,run_id,sequence,event_id,type,safe_payload,trace_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [scope.workspaceId, r.project_id, r.id, allocated.sequence, id, type, payload, scope.requestId ?? 'dispatcher'])).rows[0]; const projection = eventView(event); await tx.query(`INSERT INTO control.outbox(event_id,workspace_id,project_id,topic,payload,payload_digest) VALUES($1,$2,$3,'run.event',$4,$5)`, [id, scope.workspaceId, r.project_id, projection, commandDigest(projection)]); return projection; };
    const transition = async (tx, scope, r, state, blockers = []) => { assertTransition(r.state, state); await tx.query('UPDATE control.runs SET state=$2,blockers=$3 WHERE id=$1', [r.id, state, JSON.stringify(blockers)]); r.state = state; await append(tx, scope, r, state === 'blocked' ? 'run.blocked' : 'run.state_changed', { state, blockers }); await audit.append(tx, scope, { action: 'run.' + state, targetRef: r.id, metadata: { projectId: r.project_id } }); };
    const budget = async (tx, r) => { const row = (await tx.query("SELECT * FROM control.budget_accounts WHERE scope_kind='run' AND scope_id=$1", [r.id])).rows[0]; if (!row)
        throw apiError('BUDGET_REQUIRED', 'Run spending account is missing.', 409); return { limit: row.limit_micro_usd, reserved: row.reserved_micro_usd, spent: row.spent_micro_usd }; };
    const projection = async (tx, r) => { const counts = (await tx.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE state='succeeded')::int AS completed FROM control.tasks WHERE run_id=$1", [r.id])).rows[0]; return { id: r.id, goalId: r.goal_id, contractRevisionId: r.contract_revision_id, planRevisionId: r.plan_revision_id, repositorySnapshotId: r.repository_snapshot_id, state: r.state, autonomyMode: r.autonomy_mode, epoch: r.epoch, progress: { completedTasks: counts.completed, totalTasks: counts.total }, budget: await budget(tx, r), blockers: r.blockers, version: (await tx.query('SELECT version FROM control.runs WHERE id=$1', [r.id])).rows[0].version }; };
    const authorize = async (tx, scope, r) => {
        const active = (await tx.query(`SELECT 1 FROM product.projects p WHERE p.project_id=$3 AND p.workspace_id=$2 AND p.status='active' AND control.session_valid($1::uuid) AND $4::uuid IS NOT NULL AND $5::timestamptz>clock_timestamp()`, [r.owner_session_id, scope.workspaceId, r.project_id, scope.principalId, r.deadline_at])).rows[0];
        if (!active)
            throw apiError('AUTHORIZATION_EXPIRED', 'Run session, project, or deadline is no longer valid.', 403);
        const policy = (await tx.query('SELECT * FROM control.policy_revisions WHERE id=$1 AND activated_at IS NOT NULL AND superseded_at IS NULL FOR SHARE', [r.policy_revision_id])).rows[0];
        if (!policy)
            throw apiError('POLICY_CHANGED', 'Pinned policy is no longer active.', 409);
        const approved = (await tx.query(`SELECT 1 FROM control.approvals a JOIN planning.contract_revisions c ON c.id=a.contract_revision_id JOIN planning.build_contracts b ON b.id=c.contract_id WHERE a.contract_revision_id=$1 AND a.kind='contract' AND a.policy_revision_id=$2 AND a.state='approved' AND a.expires_at>clock_timestamp() AND a.approver_principal_id=$3 AND a.input_digest=c.digest AND c.plan_revision_id=$4 AND b.current_revision_id=c.id AND b.goal_id=$5 FOR SHARE OF a,c,b`, [r.contract_revision_id, r.policy_revision_id, scope.principalId, r.plan_revision_id, r.goal_id])).rows[0];
        if (!approved)
            throw apiError('APPROVAL_REQUIRED', 'Current approval of the exact pinned contract is required.', 409);
        return policy;
    };
    const fencedTask = async (tx, scope, input) => { const r = await run(tx, scope, input.runId); const t = (await tx.query(`SELECT * FROM control.tasks WHERE id=$1 AND run_id=$2 AND state='running' AND lease_owner=$3 AND lease_epoch=$4 AND lease_expires_at>clock_timestamp() AND deadline_at>clock_timestamp() FOR UPDATE`, [input.taskId, r.id, input.owner, input.taskEpoch])).rows[0]; if (!t || r.epoch !== String(input.runEpoch) || r.state !== 'executing')
        throw conflict(); return { r, t }; };
    const makeCheckpoint = async (tx, scope, r) => {
        const tasks = (await tx.query('SELECT * FROM control.tasks WHERE run_id=$1 ORDER BY id', [r.id])).rows;
        if (tasks.some(t => t.state === 'running' || t.state === 'cancelling'))
            throw apiError('WORK_NOT_QUIESCENT', 'A safe checkpoint requires quiescent work.', 409);
        const effects = (await tx.query('SELECT * FROM control.effects WHERE run_id=$1 ORDER BY id', [r.id])).rows;
        const snapshot = (await tx.query('SELECT tree_digest FROM product.repository_snapshots WHERE id=$1', [r.repository_snapshot_id])).rows[0];
        const contexts = (await tx.query('SELECT id FROM knowledge.context_bundles WHERE run_id=$1 ORDER BY id', [r.id])).rows;
        const failures = (await tx.query('SELECT fingerprint FROM control.failures WHERE run_id=$1 ORDER BY id LIMIT 1000', [r.id])).rows;
        const state = checkpointSchema.parse({ schemaVersion: 1, runId: r.id, contractRevisionId: r.contract_revision_id, planRevisionId: r.plan_revision_id, policyRevisionId: r.policy_revision_id, repositorySnapshotId: r.repository_snapshot_id, workspaceTreeDigest: snapshot.tree_digest.toString('hex'), epoch: r.epoch, tasks: tasks.map(t => ({ id: t.id, state: t.state, attempt: t.attempt, leaseEpoch: t.lease_epoch })), completedEffectIds: effects.filter(e => e.state === 'succeeded' || e.state === 'reconciled').map(e => e.id), unresolvedApprovalIds: effects.filter(e => e.approval_id && e.state === 'prepared').map(e => e.approval_id), contextBundleRefs: contexts.map(c => c.id), budget: await budget(tx, r), failureFingerprints: failures.map(f => f.fingerprint.toString('hex')) });
        const sequence = (await tx.query('SELECT COALESCE(max(sequence),0)+1 AS sequence FROM control.checkpoints WHERE run_id=$1', [r.id])).rows[0].sequence;
        const cp = (await tx.query(`INSERT INTO control.checkpoints(id,workspace_id,project_id,run_id,epoch,sequence,schema_version,state_digest,state_ref) VALUES($1,$2,$3,$4,$5,$6,1,$7,$8) RETURNING *`, [randomUUID(), scope.workspaceId, r.project_id, r.id, r.epoch, sequence, jsonDigest(state), state])).rows[0];
        await tx.query('UPDATE control.runs SET last_checkpoint_id=$2 WHERE id=$1', [r.id, cp.id]);
        return cp;
    };
    const settleRun = async (tx, scope, r) => {
        const states = (await tx.query('SELECT state FROM control.tasks WHERE run_id=$1', [r.id])).rows;
        const unknown = (await tx.query("SELECT 1 FROM control.effects WHERE run_id=$1 AND state IN ('dispatched','unknown') LIMIT 1", [r.id])).rows.length > 0;
        if (r.state === 'cancelling') {
            if (unknown) {
                await transition(tx, scope, r, 'blocked', ['EFFECT_UNCERTAIN']);
                return;
            }
            await tx.query("UPDATE control.tasks SET state='cancelled',lease_owner=NULL,lease_expires_at=NULL,lease_epoch=lease_epoch+1 WHERE run_id=$1 AND state IN ('queued','blocked','failed','unknown')", [r.id]);
            if (states.some(t => ['running', 'cancelling'].includes(t.state)))
                return;
            await makeCheckpoint(tx, scope, r);
            await transition(tx, scope, r, 'cancelled');
            return;
        }
        if (unknown) {
            if (r.state === 'executing')
                await transition(tx, scope, r, 'blocked', ['EFFECT_UNCERTAIN']);
            return;
        }
        if (r.pause_requested_at && r.state === 'executing' && !states.some(t => t.state === 'running')) {
            await makeCheckpoint(tx, scope, r);
            await transition(tx, scope, r, 'paused');
            return;
        }
        if (r.state === 'executing' && states.length && states.every(t => t.state === 'succeeded')) {
            await makeCheckpoint(tx, scope, r);
            await transition(tx, scope, r, 'verifying');
        }
    };
    const streams = new Set();
    let draining = false;
    const service = {
        registerStream(response) { if (draining) {
            response.end();
            return () => { };
        } streams.add(response); return () => streams.delete(response); },
        async drain() { draining = true; for (const response of streams)
            response.end(); streams.clear(); },
        async close() { await service.drain(); },
        async admitFixture(scope, key, input) {
            if (!qualificationMode)
                throw apiError('ROADMAP_STAGE_NOT_QUALIFIED', 'Public execution start requires Stages 09–12.', 503);
            return executeCommand(pool, scope, 'internal.stage07.fixture', key, input, async (tx) => {
                const project = (await tx.query('SELECT status FROM product.projects WHERE project_id=$1 FOR UPDATE', [input.projectId])).rows[0];
                if (!project || project.status !== 'active')
                    throw missing();
                const contract = (await tx.query(`SELECT c.*,b.goal_id FROM planning.contract_revisions c JOIN planning.build_contracts b ON b.id=c.contract_id WHERE c.id=$1 AND c.project_id=$2`, [input.contractRevisionId, input.projectId])).rows[0];
                if (!contract)
                    throw missing();
                const snapshot = (await tx.query('SELECT id FROM product.repository_snapshots WHERE id=$1 AND project_id=$2', [input.repositorySnapshotId, input.projectId])).rows[0];
                if (!snapshot)
                    throw missing();
                const policy = (await tx.query('SELECT id FROM control.policy_revisions WHERE activated_at IS NOT NULL AND superseded_at IS NULL')).rows[0];
                if (!policy)
                    throw apiError('POLICY_NOT_CONFIGURED', 'An active policy is required.', 409);
                const steps = (await tx.query('SELECT * FROM planning.plan_steps WHERE plan_revision_id=$1 ORDER BY id LIMIT 1001', [contract.plan_revision_id])).rows;
                const edges = (await tx.query('SELECT * FROM planning.step_dependencies WHERE plan_revision_id=$1 LIMIT 10001', [contract.plan_revision_id])).rows;
                validateDag(steps, edges);
                const r = (await tx.query(`INSERT INTO control.runs(id,workspace_id,project_id,goal_id,contract_revision_id,plan_revision_id,policy_revision_id,repository_snapshot_id,owner_principal_id,owner_session_id,state,autonomy_mode,deadline_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'queued','plan_only',clock_timestamp()+interval '1 hour') RETURNING *`, [randomUUID(), scope.workspaceId, input.projectId, contract.goal_id, contract.id, contract.plan_revision_id, policy.id, snapshot.id, scope.principalId, scope.sessionId])).rows[0];
                await authorize(tx, scope, r);
                await tx.query(`INSERT INTO control.budget_accounts(id,workspace_id,project_id,scope_kind,scope_id,limit_micro_usd,created_by) VALUES($1,$2,$3,'run',$4,0,$5)`, [randomUUID(), scope.workspaceId, r.project_id, r.id, scope.principalId]);
                const ids = new Map(steps.map(s => [s.id, randomUUID()]));
                for (const step of steps) {
                    await tx.query(`INSERT INTO control.tasks(id,workspace_id,project_id,run_id,plan_revision_id,plan_step_id,step_key,deadline_at,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [ids.get(step.id), scope.workspaceId, r.project_id, r.id, r.plan_revision_id, step.id, step.step_key, r.deadline_at, `task:${r.id}:${step.id}`]);
                }
                for (const edge of edges)
                    await tx.query('INSERT INTO control.task_dependencies(workspace_id,project_id,run_id,task_id,requires_task_id) VALUES($1,$2,$3,$4,$5)', [scope.workspaceId, r.project_id, r.id, ids.get(edge.step_id), ids.get(edge.requires_step_id)]);
                await append(tx, scope, r, 'run.state_changed', { state: 'queued' });
                await fault?.('before-admission-commit', { runId: r.id });
                return { status: 202, projectId: r.project_id, data: await projection(tx, r) };
            });
        },
        async read(scope, id) { return transaction(scope, async (tx) => { const r = await run(tx, scope, id); return { data: await projection(tx, r), currentSequence: (BigInt(r.next_event_sequence) - 1n).toString() }; }); },
        async list(scope, projectId, { limit, after, state }) { return transaction(scope, async (tx) => { const p = (await tx.query('SELECT 1 FROM product.projects WHERE project_id=$1', [projectId])).rows[0]; if (!p)
            throw missing(); const rows = (await tx.query('SELECT * FROM control.runs WHERE project_id=$1 AND owner_principal_id=$2 AND ($3::uuid IS NULL OR id>$3) AND ($4::text IS NULL OR state=$4) ORDER BY id LIMIT $5 FOR SHARE', [projectId, scope.principalId, after, state ?? null, limit + 1])).rows; const items = rows.slice(0, limit); const data = []; for (const item of items)
            data.push(await projection(tx, item)); return { data, nextCursor: rows.length > limit ? Buffer.from(items.at(-1).id).toString('base64url') : null }; }); },
        async children(scope, id, kind, { limit, after, state }) {
            return transaction(scope, async (tx) => {
                await run(tx, scope, id);
                const table = { tasks: 'control.tasks', effects: 'control.effects', checkpoints: 'control.checkpoints', agents: 'control.agent_sessions' }[kind];
                if (!table)
                    throw apiError('INVALID_INPUT', 'Unknown projection.');
                const filter = ['tasks', 'effects'].includes(kind) ? ' AND ($4::text IS NULL OR state=$4)' : '';
                const rows = (await tx.query(`SELECT * FROM ${table} WHERE run_id=$1 AND ($2::uuid IS NULL OR id>$2)${filter} ORDER BY id LIMIT $3`, filter ? [id, after, limit + 1, state ?? null] : [id, after, limit + 1])).rows;
                const items = rows.slice(0, limit);
                for (const t of kind === 'tasks' ? items : []) {
                    t.dependencies = (await tx.query('SELECT requires_task_id FROM control.task_dependencies WHERE task_id=$1', [t.id])).rows.map(d => d.requires_task_id);
                    t.artifact_ids = (await tx.query("SELECT receipt_ref FROM control.effects WHERE task_id=$1 AND state IN ('succeeded','reconciled') AND receipt_ref IS NOT NULL", [t.id])).rows.map(e => e.receipt_ref);
                }
                for (const agent of kind === 'agents' ? items : []) {
                    const grant = (await tx.query('SELECT capability FROM control.capability_grants WHERE id=$1', [agent.capability_grant_id])).rows[0];
                    agent.capabilities = grant ? [grant.capability] : [];
                }
                return { data: items.map(kind === 'tasks' ? taskView : kind === 'effects' ? effectView : kind === 'checkpoints' ? checkpointView : row => ({ id: row.id, runId: row.run_id, taskId: row.task_id, role: row.role, state: row.state, capabilities: row.capabilities, deadlineAt: row.deadline_at.toISOString(), usageSummary: row.usage_summary })), nextCursor: rows.length > limit ? Buffer.from(items.at(-1).id).toString('base64url') : null };
            });
        },
        async control(scope, id, action, key, input) {
            return executeCommand(pool, scope, `POST /runs/${id}/${action}`, key, input, async (tx) => {
                const r = await run(tx, scope, id);
                if (terminal.has(r.state)) {
                    if (action === 'cancel' && r.state === 'cancelled')
                        return { status: 202, projectId: r.project_id, data: await projection(tx, r) };
                    throw apiError('TERMINAL_RUN', 'Run is terminal.', 409);
                }
                if (action === 'pause') {
                    if (r.state === 'paused')
                        return { status: 202, projectId: r.project_id, data: await projection(tx, r) };
                    if (r.state !== 'executing')
                        throw apiError('STATE_CONFLICT', 'Only executing work can pause.', 409);
                    await tx.query('UPDATE control.runs SET pause_requested_at=clock_timestamp() WHERE id=$1', [id]);
                    r.pause_requested_at = new Date();
                    await settleRun(tx, scope, r);
                }
                else if (action === 'cancel') {
                    if (r.state !== 'cancelling')
                        await transition(tx, scope, r, 'cancelling');
                    await tx.query('UPDATE control.runs SET cancel_requested_at=clock_timestamp(),pause_requested_at=NULL,epoch=epoch+1 WHERE id=$1', [id]);
                    r.epoch = (BigInt(r.epoch) + 1n).toString();
                    await tx.query("UPDATE control.tasks SET state='cancelled',lease_owner=NULL,lease_expires_at=NULL,lease_epoch=lease_epoch+1 WHERE run_id=$1 AND state IN ('queued','blocked','failed')", [id]);
                    await tx.query("UPDATE control.effects SET state='unknown' WHERE run_id=$1 AND state='dispatched'", [id]);
                    await settleRun(tx, scope, r);
                }
                else if (action === 'resume') {
                    if (r.cancel_requested_at)
                        throw apiError('STATE_CONFLICT', 'Cancellation must be reconciled before any successor work.', 409);
                    if (!['paused', 'blocked'].includes(r.state) || input.expectedEpoch !== r.epoch || input.checkpointId !== r.last_checkpoint_id)
                        throw apiError('STALE_CHECKPOINT', 'Resume requires the current checkpoint and epoch.', 409);
                    const cp = (await tx.query('SELECT * FROM control.checkpoints WHERE id=$1 AND run_id=$2', [input.checkpointId, id])).rows[0];
                    if (!cp || !jsonDigest(checkpointSchema.parse(cp.state_ref)).equals(cp.state_digest) || cp.epoch !== r.epoch)
                        throw apiError('STALE_CHECKPOINT', 'Checkpoint integrity or epoch is invalid.', 409);
                    await authorize(tx, scope, r);
                    if ((await tx.query("SELECT 1 FROM control.effects WHERE run_id=$1 AND state IN ('dispatched','unknown') LIMIT 1", [id])).rows.length)
                        throw apiError('EFFECT_UNCERTAIN', 'Reconcile effects before resuming.', 409);
                    await tx.query('UPDATE control.runs SET epoch=epoch+1,pause_requested_at=NULL WHERE id=$1', [id]);
                    r.epoch = (BigInt(r.epoch) + 1n).toString();
                    await transition(tx, scope, r, 'executing');
                }
                else
                    throw apiError('INVALID_INPUT', 'Unknown run command.');
                return { status: 202, projectId: r.project_id, data: await projection(tx, r) };
            });
        },
        async claim(scope, owner, leaseMs = 60000) {
            if (!Number.isInteger(leaseMs) || leaseMs < 100 || leaseMs > 60000)
                throw new Error('Invalid lease interval');
            return transaction(scope, async (tx) => {
                const candidates = (await tx.query(`SELECT * FROM control.runs WHERE owner_principal_id=$1 AND state IN ('queued','executing') AND pause_requested_at IS NULL AND cancel_requested_at IS NULL AND EXISTS(SELECT 1 FROM control.tasks candidate WHERE candidate.run_id=control.runs.id AND candidate.state='queued' AND candidate.available_at<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM control.task_dependencies dependency JOIN control.tasks predecessor ON predecessor.id=dependency.requires_task_id WHERE dependency.task_id=candidate.id AND predecessor.state<>'succeeded')) ORDER BY updated_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`, [scope.principalId])).rows;
                const r = candidates[0];
                if (!r)
                    return null;
                try {
                    await authorize(tx, scope, r);
                }
                catch (error) {
                    await transition(tx, scope, r, 'blocked', [error.code ?? 'AUTHORIZATION_EXPIRED']);
                    return null;
                }
                const t = (await tx.query(`SELECT t.* FROM control.tasks t WHERE t.run_id=$1 AND t.state='queued' AND t.available_at<=clock_timestamp() AND t.deadline_at>clock_timestamp() AND t.attempt<t.max_attempts AND NOT EXISTS(SELECT 1 FROM control.task_dependencies d JOIN control.tasks parent ON parent.id=d.requires_task_id WHERE d.task_id=t.id AND parent.state<>'succeeded') ORDER BY t.priority DESC,t.available_at,t.id LIMIT 1 FOR UPDATE SKIP LOCKED`, [r.id])).rows[0];
                if (!t) {
                    await settleRun(tx, scope, r);
                    return null;
                }
                if (r.state === 'queued')
                    await transition(tx, scope, r, 'executing');
                const claimed = (await tx.query(`UPDATE control.tasks SET state='running',attempt=attempt+1,lease_epoch=lease_epoch+1,lease_owner=$2,lease_expires_at=LEAST(deadline_at,clock_timestamp()+$3::integer*interval '1 millisecond'),updated_at=clock_timestamp() WHERE id=$1 RETURNING *`, [t.id, owner, leaseMs])).rows[0];
                await append(tx, scope, r, 'task.state_changed', { taskId: t.id, state: 'running' });
                return { runId: r.id, taskId: t.id, owner, runEpoch: r.epoch, taskEpoch: claimed.lease_epoch, stepKey: t.step_key, attempt: claimed.attempt };
            });
        },
        async fail(scope, assignment, { failureClass = 'permanent', retrySafe = false } = {}) { if (!['transient', 'permanent', 'timeout', 'unavailable'].includes(failureClass))
            throw new Error('Invalid failure class'); return transaction(scope, async (tx) => { const { r, t } = await fencedTask(tx, scope, assignment); const uncertain = (await tx.query("SELECT 1 FROM control.effects WHERE task_id=$1 AND state IN ('dispatched','unknown') LIMIT 1", [t.id])).rows.length > 0; const state = uncertain ? 'unknown' : retrySafe && failureClass === 'transient' && t.attempt < t.max_attempts ? 'queued' : failureClass === 'unavailable' ? 'blocked' : 'failed'; await tx.query('INSERT INTO control.failures(id,workspace_id,project_id,run_id,task_id,class,fingerprint,safe_detail) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [randomUUID(), scope.workspaceId, r.project_id, r.id, t.id, failureClass, jsonDigest({ stepId: t.plan_step_id, failureClass }), 'Bounded activity did not produce a committed outcome.']); await tx.query("UPDATE control.tasks SET state=$2,lease_owner=NULL,lease_expires_at=NULL,available_at=clock_timestamp()+((100+floor(random()*900))::integer*interval '1 millisecond') WHERE id=$1", [t.id, state]); await append(tx, scope, r, 'task.state_changed', { taskId: t.id, state }); if (uncertain) {
            await tx.query("UPDATE control.effects SET state='unknown' WHERE task_id=$1 AND state='dispatched'", [t.id]);
            await transition(tx, scope, r, 'blocked', ['EFFECT_UNCERTAIN']);
        }
        else if (state === 'blocked')
            await transition(tx, scope, r, 'blocked', ['ACTIVITY_UNAVAILABLE']);
        else if (state === 'failed')
            await transition(tx, scope, r, 'failed'); return state; }); },
        async heartbeat(scope, assignment, leaseMs = 60000) { return transaction(scope, async (tx) => { const { r, t } = await fencedTask(tx, scope, assignment); await authorize(tx, scope, r); await tx.query(`UPDATE control.tasks SET lease_expires_at=LEAST(deadline_at,clock_timestamp()+$2::integer*interval '1 millisecond') WHERE id=$1`, [t.id, Math.min(60000, Math.max(100, leaseMs))]); return true; }); },
        async finish(scope, assignment, { state = 'succeeded' } = {}) { return transaction(scope, async (tx) => { const { r, t } = await fencedTask(tx, scope, assignment); await authorize(tx, scope, r); if (!['succeeded', 'failed', 'blocked'].includes(state))
            throw apiError('INVALID_INPUT', 'Invalid activity outcome.'); if ((await tx.query("SELECT 1 FROM control.effects WHERE task_id=$1 AND state NOT IN ('succeeded','reconciled') LIMIT 1", [t.id])).rows.length)
            throw apiError('EFFECT_UNCERTAIN', 'An effect has no committed successful outcome.', 409); await tx.query('UPDATE control.tasks SET state=$2,lease_owner=NULL,lease_expires_at=NULL WHERE id=$1', [t.id, state]); await append(tx, scope, r, 'task.state_changed', { taskId: t.id, state }); if (state === 'failed')
            await transition(tx, scope, r, 'failed');
        else if (state === 'blocked')
            await transition(tx, scope, r, 'blocked', ['ACTIVITY_BLOCKED']);
        else
            await settleRun(tx, scope, r); return taskView({ ...t, state }); }); },
        async prepareEffect(scope, assignment, input) {
            return transaction(scope, async (tx) => {
                const { r, t } = await fencedTask(tx, scope, assignment);
                await authorize(tx, scope, r);
                if (!z.object({ index: z.number().int().min(0).max(2), toolId: z.string().uuid(), targetRef: z.string().min(1).max(1024), argumentsDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict().safeParse(input).success)
                    throw apiError('INVALID_INPUT', 'Invalid prepared effect.');
                const operationKey = effectKey(r, t, input.index);
                const digest = jsonDigest({ schemaVersion: 1, toolId: input.toolId, targetRef: input.targetRef, argumentsDigest: input.argumentsDigest, snapshotId: r.repository_snapshot_id, contractRevisionId: r.contract_revision_id });
                const existing = (await tx.query('SELECT * FROM control.effects WHERE operation_key=$1', [operationKey])).rows[0];
                if (existing) {
                    if (!existing.input_digest.equals(digest))
                        throw apiError('EFFECT_INPUT_CONFLICT', 'Permanent effect identity has different input.', 409);
                    return effectView(existing);
                }
                const tool = (await tx.query('SELECT * FROM inference.tool_definitions WHERE id=$1 AND qualified_at IS NOT NULL AND revoked_at IS NULL', [input.toolId])).rows[0];
                if (!tool)
                    throw apiError('CAPABILITY_UNAVAILABLE', 'Tool revision is not qualified.', 503);
                if (!jsonDigest(tool.manifest).equals(tool.digest))
                    throw apiError('QUALIFICATION_INVALID', 'Tool revision integrity failed.', 409);
                if (tool.manifest.risk !== 'read' || tool.manifest.egress !== false)
                    throw apiError('ROADMAP_STAGE_NOT_QUALIFIED', 'Only bounded read-only qualification activities are enabled before isolation and broker qualification.', 503);
                const effect = (await tx.query(`INSERT INTO control.effects(id,workspace_id,project_id,run_id,task_id,tool_id,operation_key,input_digest,target_ref,risk,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'read','prepared') RETURNING *`, [randomUUID(), scope.workspaceId, r.project_id, r.id, t.id, tool.id, operationKey, digest, input.targetRef])).rows[0];
                return effectView(effect);
            });
        },
        async dispatchEffect(scope, assignment, effectId) {
            return transaction(scope, async (tx) => {
                const { r, t } = await fencedTask(tx, scope, assignment);
                if (r.pause_requested_at)
                    throw apiError('RUN_PAUSING', 'New effects are stopped while pausing.', 409);
                const policy = await authorize(tx, scope, r);
                const effect = (await tx.query('SELECT e.*,d.manifest,d.qualified_at,d.revoked_at FROM control.effects e JOIN inference.tool_definitions d ON d.id=e.tool_id WHERE e.id=$1 AND e.task_id=$2 FOR UPDATE OF e', [effectId, t.id])).rows[0];
                if (!effect || effect.state !== 'prepared' || !effect.qualified_at || effect.revoked_at)
                    throw apiError('EFFECT_UNCERTAIN', 'Effect cannot be dispatched again.', 409);
                const capabilities = effect.manifest.capabilities;
                if (!Array.isArray(capabilities) || !capabilities.length || capabilities.length > 16 || effect.risk !== 'read' || effect.manifest.egress !== false)
                    throw apiError('POLICY_DENIED', 'Activity manifest cannot authorize an effect.', 403);
                for (const capability of capabilities) {
                    const grant = (await tx.query(`SELECT * FROM control.capability_grants WHERE project_id=$1 AND principal_id=$2 AND capability=$3 AND revoked_at IS NULL AND expires_at>clock_timestamp() AND (contract_revision_id IS NULL OR contract_revision_id=$4) FOR SHARE`, [r.project_id, scope.principalId, capability, r.contract_revision_id])).rows.find(g => Object.keys(g.resource_scope).length === 0 || g.resource_scope.target === effect.target_ref);
                    if (!grant)
                        throw apiError('POLICY_DENIED', 'A current effect grant is required.', 403);
                    const step = (await tx.query('SELECT capabilities FROM planning.plan_steps WHERE id=$1', [t.plan_step_id])).rows[0];
                    if (!step.capabilities.includes(capability))
                        throw apiError('POLICY_DENIED', 'Capability is outside the pinned plan step.', 403);
                    const decision = evaluatePolicy({ policy: policy.rules, principal: { kind: 'local_user', workspaceId: scope.workspaceId, id: scope.principalId }, inputDigest: effect.input_digest.toString('hex'), mode: r.autonomy_mode, capability, action: capability, target: effect.target_ref, mutating: false, egress: false, grant: grant ? { ...grant, expiresAt: grant.expires_at.toISOString(), revokedAt: grant.revoked_at } : null, budget: { costMicroUsd: '0', limitMicroUsd: '0', spentMicroUsd: '0', reservedMicroUsd: '0', reservationId: 'qualification-read-only' } });
                    if (decision.decision !== 'allow')
                        throw apiError('POLICY_DENIED', 'Effect does not have current scoped permission.', 403);
                }
                await tx.query("UPDATE control.effects SET state='dispatched',dispatch_epoch=$2,task_epoch=$3,updated_at=clock_timestamp() WHERE id=$1", [effectId, r.epoch, t.lease_epoch]);
                return { id: effectId, operationKey: effect.operation_key, inputDigest: effect.input_digest.toString('hex') };
            });
        },
        async receipt(scope, assignment, input) { return transaction(scope, async (tx) => { const { r, t } = await fencedTask(tx, scope, assignment); const effect = (await tx.query('SELECT * FROM control.effects WHERE id=$1 AND task_id=$2 FOR UPDATE', [input.effectId, t.id])).rows[0]; if (!effect || effect.input_digest.toString('hex') !== input.inputDigest || effect.dispatch_epoch !== r.epoch || effect.task_epoch !== t.lease_epoch)
            throw conflict(); if (effect.state === 'succeeded') {
            if (effect.receipt_ref !== input.receiptRef)
                throw apiError('RECEIPT_CONFLICT', 'Committed receipt differs.', 409);
            return effectView(effect);
        } if (effect.state !== 'dispatched')
            throw apiError('EFFECT_UNCERTAIN', 'Effect requires trusted reconciliation.', 409); const artifact = (await tx.query("SELECT id,bytes FROM product.artifacts WHERE id=$1 AND project_id=$2 AND status='available'", [input.receiptRef, r.project_id])).rows[0]; if (!artifact || BigInt(artifact.bytes) > 8192n || !artifacts)
            throw apiError('RECEIPT_INVALID', 'A bounded receipt artifact must be available in this project.', 409); const bytes = await artifacts.content(tx, { ...scope, projectId: r.project_id }, artifact.id); let proof; try {
            proof = JSON.parse(bytes.toString('utf8'));
        }
        catch {
            throw apiError('RECEIPT_INVALID', 'Receipt encoding was rejected.', 409);
        } const receiptSchema = z.object({ schemaVersion: z.literal(1), effectId: z.literal(effect.id), inputDigest: z.literal(effect.input_digest.toString('hex')), runEpoch: z.literal(effect.dispatch_epoch), taskEpoch: z.literal(effect.task_epoch), outcome: z.literal('succeeded') }).strict(); if (!receiptSchema.safeParse(proof).success)
            throw apiError('RECEIPT_INVALID', 'Receipt does not bind the dispatched effect and epochs.', 409); const row = (await tx.query("UPDATE control.effects SET state='succeeded',receipt_ref=$2,updated_at=clock_timestamp() WHERE id=$1 RETURNING *", [effect.id, artifact.id])).rows[0]; await append(tx, scope, r, 'artifact.available', { artifactId: artifact.id, taskId: t.id, effectId: effect.id }); await audit.append(tx, scope, { action: 'effect.receipt', targetRef: effect.id, metadata: { projectId: r.project_id } }); await fault?.('before-receipt-commit', { effectId: row.id }); return effectView(row); }); },
        async recover(scope) {
            return transaction(scope, async (tx) => {
                const runs = (await tx.query(`SELECT * FROM control.runs WHERE owner_principal_id=$1 AND state NOT IN ('verified','failed','cancelled') AND (state='cancelling' OR EXISTS(SELECT 1 FROM control.tasks t WHERE t.run_id=control.runs.id AND t.state='running' AND t.lease_expires_at<=clock_timestamp())) ORDER BY updated_at,id LIMIT 100 FOR UPDATE SKIP LOCKED`, [scope.principalId])).rows;
                let recovered = 0;
                for (const r of runs) {
                    const expired = (await tx.query(`SELECT * FROM control.tasks WHERE run_id=$1 AND state='running' AND lease_expires_at<=clock_timestamp() FOR UPDATE`, [r.id])).rows;
                    for (const t of expired) {
                        const uncertain = (await tx.query("UPDATE control.effects SET state='unknown',updated_at=clock_timestamp() WHERE task_id=$1 AND state='dispatched' RETURNING id", [t.id])).rows;
                        const unresolved = uncertain.length || (await tx.query("SELECT 1 FROM control.effects WHERE task_id=$1 AND state='unknown'", [t.id])).rows.length;
                        const state = unresolved ? 'unknown' : r.state === 'cancelling' ? 'cancelled' : t.attempt >= t.max_attempts ? 'failed' : 'queued';
                        await tx.query('UPDATE control.tasks SET state=$2,lease_owner=NULL,lease_expires_at=NULL,lease_epoch=lease_epoch+1,available_at=clock_timestamp() WHERE id=$1', [t.id, state]);
                        await append(tx, scope, r, 'task.state_changed', { taskId: t.id, state });
                        recovered++;
                        if (unresolved && r.state !== 'blocked')
                            await transition(tx, scope, r, 'blocked', ['EFFECT_UNCERTAIN']);
                        else if (state === 'failed' && r.state === 'executing')
                            await transition(tx, scope, r, 'failed');
                    }
                    if (!terminal.has(r.state)) {
                        await settleRun(tx, scope, r);
                        if (r.state === 'blocked' && expired.length && !(await tx.query("SELECT 1 FROM control.tasks WHERE run_id=$1 AND state='running'", [r.id])).rows.length)
                            await makeCheckpoint(tx, scope, r);
                    }
                }
                return recovered;
            });
        },
        async events(scope, id, after, limit = 100) { return transaction(scope, async (tx) => { const r = await run(tx, scope, id); if (BigInt(after) < BigInt(r.retained_after))
            throw apiError('EVENT_CURSOR_EXPIRED', 'Reload /api/v1/runs/' + id + ' before reconnecting.', 410); if (BigInt(after) >= BigInt(r.next_event_sequence))
            throw apiError('INVALID_INPUT', 'Event cursor is ahead of this run.'); const rows = (await tx.query('SELECT * FROM control.run_events WHERE run_id=$1 AND sequence>$2 ORDER BY sequence LIMIT $3', [id, after, limit])).rows; return rows.map(eventView); }); },
        async requestReconciliation(scope, effectId, key, input) {
            return executeCommand(pool, scope, 'POST /effects/' + effectId + '/reconcile', key, input, async (tx) => {
                const reference = (await tx.query('SELECT run_id FROM control.effects WHERE id=$1', [effectId])).rows[0];
                if (!reference)
                    throw missing();
                await run(tx, scope, reference.run_id);
                const effect = (await tx.query('SELECT * FROM control.effects WHERE id=$1 FOR UPDATE', [effectId])).rows[0];
                if (!effect)
                    throw missing();
                if (!['unknown', 'dispatched'].includes(effect.state))
                    throw apiError('STATE_CONFLICT', 'Effect does not require reconciliation.', 409);
                if (input.externalReceiptRef) {
                    const artifact = (await tx.query('SELECT id FROM product.artifacts WHERE id=$1 AND project_id=$2', [input.externalReceiptRef, effect.project_id])).rows[0];
                    if (!artifact)
                        throw apiError('RECEIPT_INVALID', 'Evidence reference is not in this project.', 409);
                }
                const id = randomUUID();
                await tx.query(`INSERT INTO control.operations(id,workspace_id,project_id,kind,state,request_digest,input,effect_id,deadline_at,safe_error) VALUES($1,$2,$3,'effect.reconcile','blocked',$4,$5,$6,clock_timestamp()+interval '1 hour',$7)`, [id, scope.workspaceId, effect.project_id, jsonDigest(input), { effectId, ...input }, effectId, { code: 'OUTCOME_UNKNOWN', detail: 'Awaiting a qualified trusted reconciliation adapter; owner input does not assert success.' }]);
                return { status: 202, projectId: effect.project_id, data: { id, kind: 'effect.reconcile', state: 'blocked' } };
            });
        },
        async publishOutbox(scope, consumer = 'stage07.events') { return transaction(scope, async (tx) => { const rows = (await tx.query("SELECT * FROM control.outbox WHERE status='pending' AND topic='run.event' AND available_at<=clock_timestamp() ORDER BY outbox_seq LIMIT 100 FOR UPDATE SKIP LOCKED")).rows; for (const row of rows) {
            if (commandDigest(row.payload) !== row.payload_digest)
                throw new Error('Outbox integrity failed');
            await tx.query('INSERT INTO control.consumer_receipts(workspace_id,consumer_name,event_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [scope.workspaceId, consumer, row.event_id]);
            await tx.query("UPDATE control.outbox SET status='dispatched',dispatched_at=clock_timestamp(),attempt_count=attempt_count+1 WHERE event_id=$1", [row.event_id]);
        } return rows.length; }); },
        async checkpointQuiescent(scope) { return transaction(scope, async (tx) => { const runs = (await tx.query("SELECT * FROM control.runs r WHERE owner_principal_id=$1 AND state NOT IN ('verified','failed','cancelled') AND NOT EXISTS(SELECT 1 FROM control.tasks t WHERE t.run_id=r.id AND t.state IN ('running','cancelling')) ORDER BY id LIMIT 100 FOR UPDATE", [scope.principalId])).rows; for (const r of runs) {
            const cp = await makeCheckpoint(tx, scope, r);
            await append(tx, scope, r, 'run.state_changed', { state: r.state, checkpointId: cp.id });
        } return runs.length; }); },
        async expireEvents(scope, id, days = 30) { if (!Number.isInteger(days) || days < 1 || days > 3650)
            throw new Error('Invalid retention'); return transaction(scope, async (tx) => { await run(tx, scope, id); const last = (await tx.query("SELECT max(sequence) AS sequence FROM control.run_events WHERE run_id=$1 AND created_at<clock_timestamp()-$2::integer*interval '1 day' AND sequence<COALESCE((SELECT min(sequence) FROM control.run_events WHERE run_id=$1 AND created_at>=clock_timestamp()-$2::integer*interval '1 day'),9223372036854775807)", [id, days])).rows[0].sequence; if (!last)
            return 0; const deleted = await tx.query('DELETE FROM control.run_events WHERE run_id=$1 AND sequence<=$2', [id, last]); await tx.query('UPDATE control.runs SET retained_after=GREATEST(retained_after,$2) WHERE id=$1', [id, last]); return deleted.rowCount; }); },
    };
    return service;
}
