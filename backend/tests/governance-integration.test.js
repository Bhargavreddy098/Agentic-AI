// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createPostgresFixture } from './fixtures/postgres.js';
import { createIdentity } from '../src/modules/identity/index.js';
import { createProjects } from '../src/modules/projects/index.js';
import { createConversations } from '../src/modules/conversations/index.js';
import { createArtifactStore } from '../src/platform/blob-store/index.js';
import { createAudit, createPolicy, createGrants, createApprovals, createBudgets } from '../src/modules/governance/index.js';
import { defaultPolicyRules } from '../src/modules/governance/policy.js';
import { createApp } from '../app.js';
import { loadConfig } from '../config/env.js';

test('Stage 05 governance enforces policy, grants, approvals, budgets, and audit invariants on PostgreSQL', { timeout: 120000 }, async t => {
    const fixture = await createPostgresFixture({ poolMax: 6, stage05Only: true });
    const scope = { workspaceId: randomUUID(), principalId: randomUUID() };
    const workerId = randomUUID();
    let blobs;
    let server;
    try {
        blobs = await createArtifactStore();
        const identity = createIdentity({ pool: fixture.db.pool });
        const projects = createProjects({ pool: fixture.db.pool });
        const conversations = createConversations({ pool: fixture.db.pool, projects });
        const audit = createAudit({ pool: fixture.db.pool });
        const policies = createPolicy({ pool: fixture.db.pool, audit });
        const grants = createGrants({ pool: fixture.db.pool, audit });
        const approvals = createApprovals({ pool: fixture.db.pool, audit, policy: policies, approvalTtlMs: 60000 });
        const budgets = createBudgets({ pool: fixture.db.pool, audit });
        const config = loadConfig({ DATABASE_URL: fixture.runtimeUrl.href });
        const origin = config.allowedOrigins[0];
        server = createApp({ config, services: { identity, projects, conversations, audit, policies, grants, approvals, budgets } }).listen(0, '127.0.0.1');
        await once(server, 'listening');
        const base = `http://127.0.0.1:${server.address().port}/api/v1`;

        await fixture.owner.query('INSERT INTO identity.principals (principal_id,kind,display_name) VALUES ($1,$2,$3)', [scope.principalId, 'local_user', 'Owner']);
        await fixture.owner.query('INSERT INTO identity.workspaces (workspace_id,owner_principal_id,slug,display_name) VALUES ($1,$2,$3,$4)', [scope.workspaceId, scope.principalId, 'governance-workspace', 'Governance']);
        await fixture.owner.query('INSERT INTO identity.principals (principal_id,kind,display_name) VALUES ($1,$2,$3)', [workerId, 'worker', 'Worker']);
        const challenge = await identity.issueChallenge(scope);
        const bootstrap = await fetch(base + '/session/bootstrap', {
            method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(challenge),
        });
        assert.equal(bootstrap.status, 200);
        const cookie = bootstrap.headers.get('set-cookie').split(';')[0];
        const session = (await bootstrap.json()).data;
        const client = { cookie, origin, 'x-csrf-token': session.csrfToken };
        const call = (path, method = 'GET', body = undefined, headers = {}) => fetch(base + path, {
            method,
            headers: { ...client, 'content-type': 'application/json', 'idempotency-key': randomUUID(), ...headers },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const json = async response => ({ response, body: await response.json() });
        const errorCode = async response => (await response.json()).code;

        const project = (await (await call('/projects', 'POST', { name: 'Governed project', kind: 'greenfield' })).json()).data;
        const conversation = (await (await call('/projects/' + project.id + '/conversations', 'POST', { title: 'Governed conversation' })).json()).data;
        const goalId = randomUUID();
        const requirementRevisionId = randomUUID();
        const planRevisionId = randomUUID();
        const planId = randomUUID();
        const contractId = randomUUID();
        const contractRevisionId = randomUUID();
        const contractDigest = randomBytes(32);
        const createdBy = scope.principalId;
        await fixture.owner.query('INSERT INTO product.goals (id,workspace_id,project_id,conversation_id,intent) VALUES ($1,$2,$3,$4,$5)',
            [goalId, scope.workspaceId, project.id, conversation.id, 'Deliver a governed artifact']);
        await fixture.owner.query('INSERT INTO planning.requirement_revisions (id,workspace_id,project_id,goal_id,revision,schema_version,digest,document,created_by) VALUES ($1,$2,$3,$4,1,1,$5,$6,$7)',
            [requirementRevisionId, scope.workspaceId, project.id, goalId, randomBytes(32), {}, createdBy]);
        await fixture.owner.query('INSERT INTO planning.plans (id,workspace_id,project_id,goal_id) VALUES ($1,$2,$3,$4)', [planId, scope.workspaceId, project.id, goalId]);
        await fixture.owner.query('INSERT INTO planning.plan_revisions (id,workspace_id,project_id,plan_id,revision,requirement_revision_id,digest,layers,created_by) VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8)',
            [planRevisionId, scope.workspaceId, project.id, planId, requirementRevisionId, randomBytes(32), {}, createdBy]);
        await fixture.owner.query('INSERT INTO planning.build_contracts (id,workspace_id,project_id,goal_id) VALUES ($1,$2,$3,$4)', [contractId, scope.workspaceId, project.id, goalId]);
        await fixture.owner.query(`INSERT INTO planning.contract_revisions
            (id,workspace_id,project_id,contract_id,revision,plan_revision_id,requirement_revision_id,schema_version,canonicalizer_version,digest,document,created_by)
            VALUES ($1,$2,$3,$4,1,$5,$6,1,'test-v1',$7,$8,$9)`,
        [contractRevisionId, scope.workspaceId, project.id, contractId, planRevisionId, requirementRevisionId, contractDigest, {}, createdBy]);

        await t.test('policy revisions are immutable, digest-bound, and activation supersedes exactly one revision', async () => {
            assert.equal((await call('/policies/current')).status, 409);
            const first = await json(await call('/policies/revisions', 'POST', { rules: defaultPolicyRules(), reason: 'initial policy' }));
            assert.equal(first.response.status, 201);
            assert.equal(first.body.data.revision, '1');
            assert.equal((await call('/policies/' + first.body.data.id + '/activate', 'POST', { digest: '0'.repeat(64) })).status, 409);
            const active = await json(await call('/policies/' + first.body.data.id + '/activate', 'POST', { digest: first.body.data.digest }));
            assert.equal(active.response.status, 200);
            assert.equal(active.body.data.active, true);
            assert.equal((await call('/policies/revisions', 'POST', { rules: defaultPolicyRules(), reason: 'missing base' })).status, 409);
            const changed = defaultPolicyRules();
            changed.highImpactActions.push('workspace.write');
            const second = await json(await call('/policies/revisions', 'POST', { baseRevisionId: first.body.data.id, rules: changed, reason: 'tighten' }));
            assert.equal(second.response.status, 201);
            assert.equal(second.body.data.revision, '2');
            assert.notEqual(second.body.data.digest, first.body.data.digest);
            assert.equal((await call('/policies/' + second.body.data.id + '/activate', 'POST', { digest: second.body.data.digest })).status, 200);
            const current = await (await call('/policies/current')).json();
            assert.equal(current.data.id, second.body.data.id);
            assert.equal((await call('/policies/revisions', 'POST', { baseRevisionId: first.body.data.id, rules: changed, reason: 'stale' })).status, 409);
            assert.equal((await fixture.owner.query('SELECT count(*)::int AS count FROM control.policy_revisions WHERE activated_at IS NOT NULL AND superseded_at IS NULL')).rows[0].count, 1);
        });

        await t.test('grants are project-scoped, expire, and revocation is idempotent and audited', async () => {
            const expiresAt = new Date(Date.now() + 3600000).toISOString();
            const granted = await json(await call('/projects/' + project.id + '/grants', 'POST', {
                capability: 'workspace.write', resourceScope: { path: 'src' }, expiresAt,
            }));
            assert.equal(granted.response.status, 201);
            assert.equal(granted.body.data.capability, 'workspace.write');
            const listed = await (await call('/projects/' + project.id + '/grants')).json();
            assert.equal(listed.data.length, 1);
            assert.equal((await call('/projects/' + randomUUID() + '/grants', 'POST', {
                capability: 'workspace.write', resourceScope: {}, expiresAt,
            })).status, 404);
            assert.equal((await call('/projects/' + project.id + '/grants', 'POST', {
                capability: 'workspace.write', resourceScope: {}, expiresAt: new Date(Date.now() - 1000).toISOString(),
            })).status, 400);
            const revoked = await call('/grants/' + granted.body.data.id + '/revoke', 'POST', { reason: 'scope no longer needed' });
            assert.equal(revoked.status, 200);
            assert.equal((await revoked.json()).data.revokedAt !== undefined, true);
            assert.equal((await call('/grants/' + granted.body.data.id + '/revoke', 'POST', { reason: 'again' })).status, 200);
            assert.equal(await grants.activeFor(scope, project.id, 'workspace.write'), null);
        });

        let approval;
        let nonceOne;
        await t.test('approval requests bind the exact contract digest, reject nonce replay, and are decided once', async () => {
            assert.equal((await call('/contract-revisions/' + contractRevisionId + '/approval-requests', 'POST', { digest: 'f'.repeat(64) })).status, 409);
            const requested = await json(await call('/contract-revisions/' + contractRevisionId + '/approval-requests', 'POST', { digest: contractDigest.toString('hex') }));
            assert.equal(requested.response.status, 201);
            approval = requested.body.data;
            nonceOne = approval.nonce;
            assert.equal(approval.state, 'pending');
            assert.equal(approval.digest, contractDigest.toString('hex'));
            assert.equal((await call('/approvals/' + approval.id + '/decisions', 'POST', { decision: 'approve', nonce: 'A'.repeat(43), digest: approval.digest })).status, 403);
            assert.equal((await call('/approvals/' + approval.id + '/decisions', 'POST', { decision: 'approve', nonce: nonceOne, digest: '0'.repeat(64) })).status, 409);
            let forbidden;
            try {
                await approvals.decide({ workspaceId: scope.workspaceId, principalId: workerId }, approval.id, randomUUID(), { decision: 'approve', nonce: nonceOne, digest: approval.digest });
                assert.fail('Worker decision should be rejected');
            } catch (error) {
                forbidden = error;
            }
            assert.equal(forbidden.code, 'FORBIDDEN');
            const decided = await json(await call('/approvals/' + approval.id + '/decisions', 'POST', { decision: 'approve', nonce: nonceOne, digest: approval.digest, reason: 'looks correct' }));
            assert.equal(decided.response.status, 200);
            assert.equal(decided.body.data.state, 'approved');
            assert.equal((await call('/approvals/' + approval.id + '/decisions', 'POST', { decision: 'approve', nonce: nonceOne, digest: approval.digest })).status, 409);
            assert.equal((await call('/approvals/' + approval.id)).status, 200);
        });

        await t.test('a nonce from one approval cannot decide another', async () => {
            const second = await json(await call('/contract-revisions/' + contractRevisionId + '/approval-requests', 'POST', { digest: contractDigest.toString('hex') }));
            assert.equal(second.response.status, 201);
            assert.equal((await call('/approvals/' + second.body.data.id + '/decisions', 'POST', { decision: 'approve', nonce: nonceOne, digest: second.body.data.digest })).status, 403);
            assert.equal((await call('/approvals/' + second.body.data.id + '/decisions', 'POST', { decision: 'reject', nonce: second.body.data.nonce, digest: second.body.data.digest })).status, 200);
            const third = await json(await call('/contract-revisions/' + contractRevisionId + '/approval-requests', 'POST', { digest: contractDigest.toString('hex') }));
            assert.equal((await call('/approvals/' + third.body.data.id + '/decisions', 'POST', { decision: 'reject', nonce: third.body.data.nonce, digest: third.body.data.digest })).status, 200);
        });

        let expiredApproval;
        await t.test('expired approvals fail closed without consuming the decision', async () => {
            const policyRevision = (await fixture.owner.query('SELECT id FROM control.policy_revisions WHERE workspace_id=$1 AND activated_at IS NOT NULL AND superseded_at IS NULL', [scope.workspaceId])).rows[0];
            const id = randomUUID();
            const nonce = randomBytes(32).toString('base64url');
            const nonceHash = createHash('sha256').update(nonce).digest();
            await fixture.owner.query(`INSERT INTO control.approvals
                (id,workspace_id,project_id,kind,contract_revision_id,input_digest,policy_revision_id,approver_principal_id,requested_by,state,nonce_hash,expires_at,scope_summary,consequences,created_at)
                VALUES ($1,$2,$3,'contract',$4,$5,$6,$7,$8,'pending',$9,clock_timestamp()-interval '1 second',$10,$11,clock_timestamp()-interval '2 seconds')`,
            [id, scope.workspaceId, project.id, contractRevisionId, contractDigest, policyRevision.id, scope.principalId, scope.principalId, nonceHash, { projectId: project.id }, 'Expired exact contract approval.']);
            expiredApproval = { id, nonce, digest: contractDigest.toString('hex') };
            const response = await call('/approvals/' + expiredApproval.id + '/decisions', 'POST', { decision: 'approve', nonce: expiredApproval.nonce, digest: expiredApproval.digest });
            assert.equal(response.status, 409);
            assert.equal(await errorCode(response), 'APPROVAL_EXPIRED');
            assert.equal((await fixture.owner.query('SELECT state FROM control.approvals WHERE id=$1', [expiredApproval.id])).rows[0].state, 'pending');
        });

        await t.test('budgets reserve atomically, reject overspend, settle once, and record usage', async () => {
            const created = await json(await call('/projects/' + project.id + '/budgets', 'POST', { scopeKind: 'project', limitMicroUsd: '1000', reason: 'initial ceiling' }));
            assert.equal(created.response.status, 201);
            assert.equal(created.body.data.limitMicroUsd, '1000');
            assert.equal((await call('/projects/' + project.id + '/budgets', 'POST', { scopeKind: 'project', limitMicroUsd: '2000', reason: 'duplicate' })).status, 409);
            const results = await Promise.allSettled([
                budgets.reserve(scope, { projectId: project.id, operationKey: 'op-concurrent-1', ceilingMicroUsd: '600' }),
                budgets.reserve(scope, { projectId: project.id, operationKey: 'op-concurrent-2', ceilingMicroUsd: '600' }),
            ]);
            assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
            assert.equal(results.find(result => result.status === 'rejected').reason.code, 'BUDGET_EXCEEDED');
            const reservation = results.find(result => result.status === 'fulfilled').value;
            assert.equal((await budgets.reserve(scope, { projectId: project.id, operationKey: reservation.operationKey, ceilingMicroUsd: '600' })).id, reservation.id);
            assert.equal((await call('/projects/' + project.id + '/budgets')).status, 200);
            assert.equal((await fixture.owner.query('SELECT reserved_micro_usd::text AS reserved FROM control.budget_accounts WHERE project_id=$1', [project.id])).rows[0].reserved, '600');
            const settled = await budgets.settle(scope, reservation.id, '400');
            assert.equal(settled.state, 'settled');
            assert.equal((await budgets.settle(scope, reservation.id, '400')).state, 'settled');
            const account = (await fixture.owner.query('SELECT spent_micro_usd::text AS spent,reserved_micro_usd::text AS reserved,version::text AS version FROM control.budget_accounts WHERE project_id=$1', [project.id])).rows[0];
            assert.equal(account.spent, '400');
            assert.equal(account.reserved, '0');
            const usage = await (await call('/usage?projectId=' + project.id)).json();
            assert.equal(usage.data.length, 1);
            assert.equal(usage.data[0].actualMicroUsd, '400');
            const currentBudget = (await (await call('/projects/' + project.id + '/budgets')).json()).data[0];
            assert.equal((await call('/budgets/' + currentBudget.id, 'PATCH', { limitMicroUsd: '50', reason: 'too low' }, { 'if-match': '"' + currentBudget.version + '"' })).status, 409);
            assert.equal((await call('/budgets/' + currentBudget.id, 'PATCH', { limitMicroUsd: '2000', reason: 'raise' }, { 'if-match': '"' + currentBudget.version + '"' })).status, 200);
        });

        await t.test('audit is append-only, hash-chained, and never stores approval nonces', async () => {
            const rows = (await fixture.owner.query('SELECT sequence,digest,previous_digest,safe_metadata::text AS metadata FROM ops.audit_events ORDER BY sequence')).rows;
            assert.ok(rows.length >= 8);
            for (let index = 1; index < rows.length; index += 1) assert.equal(rows[index].previous_digest.toString('hex'), rows[index - 1].digest.toString('hex'));
            assert.equal(rows.some(row => row.metadata.includes(nonceOne)), false);
            assert.equal((await fixture.owner.query('SELECT count(*)::int AS count FROM ops.audit_heads')).rows[0].count, 1);
        });

        await t.test('approval consumption makes revocation impossible', async () => {
            await fixture.owner.query(`UPDATE control.approvals SET state='approved',consumed_at=clock_timestamp(),decided_at=clock_timestamp(),version=version+1 WHERE id=$1`, [expiredApproval.id]);
            const response = await call('/approvals/' + expiredApproval.id + '/revoke', 'POST', { reason: 'late' });
            assert.equal(response.status, 409);
            assert.equal(await errorCode(response), 'EFFECT_ALREADY_DISPATCHED');
        });
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await blobs?.close();
        await fixture.close();
    }
});
