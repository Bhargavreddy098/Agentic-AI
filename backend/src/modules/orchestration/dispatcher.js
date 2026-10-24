// @ts-check
import { randomUUID } from 'node:crypto';
/** Ephemeral process ownership only. PostgreSQL remains the only work queue. */
export function createDispatcher({ pool, orchestration, activities = {}, qualificationMode = false, intervalMs = 15000, logger }) {
    if (!qualificationMode && Object.keys(activities).length)
        throw new Error('Execution adapters require later-stage qualification');
    for (const adapter of Object.values(activities))
        if (adapter.kind !== 'safe-read' || typeof adapter.run !== 'function' || !Number.isInteger(adapter.timeoutMs) || adapter.timeoutMs < 1 || adapter.timeoutMs > 120000 || typeof adapter.retrySafe !== 'boolean')
            throw new Error('Invalid bounded activity adapter');
    const owned = new Set();
    let timer;
    let stopped = false;
    let ticking = false;
    async function tick() {
        if (stopped || ticking)
            return;
        ticking = true;
        try {
            const owners = (await pool.query(`SELECT w.workspace_id,w.owner_principal_id FROM identity.workspaces w JOIN identity.principals p ON p.principal_id=w.owner_principal_id WHERE p.kind='local_user' AND p.status='active' ORDER BY w.workspace_id LIMIT 16`)).rows;
            for (const owner of owners) {
                if (stopped)
                    break;
                const scope = { workspaceId: owner.workspace_id, principalId: owner.owner_principal_id };
                await orchestration.recover(scope);
                if (stopped)
                    break;
                await orchestration.publishOutbox(scope);
                if (stopped)
                    break;
                if (owned.size >= 3)
                    continue;
                const assignment = await orchestration.claim(scope, randomUUID());
                if (stopped)
                    break;
                if (!assignment)
                    continue;
                const controller = new AbortController();
                const entry = { controller, promise: undefined };
                const adapter = activities[assignment.stepKey];
                entry.promise = (async () => {
                    let heartbeat;
                    let deadline;
                    let heartbeatBusy = false;
                    try {
                        if (!adapter) {
                            await orchestration.fail(scope, assignment, { failureClass: 'unavailable' });
                            return;
                        }
                        heartbeat = setInterval(() => { if (heartbeatBusy)
                            return; heartbeatBusy = true; void orchestration.heartbeat(scope, assignment).catch(() => controller.abort()).finally(() => { heartbeatBusy = false; }); }, 15000);
                        heartbeat.unref();
                        deadline = setTimeout(() => controller.abort(), adapter.timeoutMs);
                        deadline.unref();
                        await adapter.run({ scope, assignment, signal: controller.signal, orchestration });
                        if (controller.signal.aborted)
                            await orchestration.fail(scope, assignment, { failureClass: 'timeout' });
                        else
                            await orchestration.finish(scope, assignment);
                    }
                    catch (error) {
                        try {
                            await orchestration.fail(scope, assignment, { failureClass: error?.retryable === true ? 'transient' : 'permanent', retrySafe: adapter?.retrySafe === true });
                        }
                        catch {
                            logger?.warn({ code: 'ACTIVITY_FENCED_OR_UNAVAILABLE' }, 'Activity outcome awaits durable recovery');
                        }
                    }
                    finally {
                        clearInterval(heartbeat);
                        clearTimeout(deadline);
                        owned.delete(entry);
                    }
                })();
                owned.add(entry);
            }
        }
        catch {
            logger?.warn({ code: 'EXECUTION_DATABASE_UNAVAILABLE' }, 'Durable execution scan paused');
        }
        finally {
            ticking = false;
        }
    }
    function start() { if (timer || stopped)
        return; timer = setInterval(() => { void tick(); }, intervalMs); timer.unref(); void tick(); }
    async function drain() { if (stopped)
        return; stopped = true; clearInterval(timer); for (const entry of owned)
        entry.controller.abort(); let timeout; try {
        await Promise.race([Promise.all([...owned].map(e => e.promise)), new Promise(resolve => { timeout = setTimeout(resolve, 5000); timeout.unref(); })]);
    }
    finally {
        clearTimeout(timeout);
    } try {
        const owners = (await pool.query("SELECT workspace_id,owner_principal_id FROM identity.workspaces ORDER BY workspace_id LIMIT 16")).rows;
        for (const owner of owners)
            await orchestration.checkpointQuiescent({ workspaceId: owner.workspace_id, principalId: owner.owner_principal_id });
    }
    catch {
        logger?.warn({ code: 'SHUTDOWN_CHECKPOINT_DEFERRED' }, 'Restart scanner will reconcile remaining leases');
    } }
    return { tick, start, drain, async close() { await drain(); }, get activeCount() { return owned.size; } };
}
