// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPostgresFixture } from './fixtures/postgres.js';
import { createAudit, createPolicy, createGrants, createBudgets } from '../src/modules/governance/index.js';
import { defaultPolicyRules } from '../src/modules/governance/policy.js';
import { createOperations } from '../src/modules/operations/index.js';
import { createProviders } from '../src/modules/providers/index.js';
import { createProjects } from '../src/modules/projects/index.js';
import { createArtifacts } from '../src/modules/artifacts/index.js';
import { createArtifactStore } from '../src/platform/blob-store/index.js';
import { rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

async function ownerFixture(t) {
    const fixture = await createPostgresFixture({ poolMax: 4, stage06Only: true });
    const scope = { workspaceId: randomUUID(), principalId: randomUUID() };
    const projectId = randomUUID();
    const blobs = await createArtifactStore();
    const artifacts = createArtifacts({ pool: fixture.db.pool, blobs, projects: createProjects({ pool: fixture.db.pool }) });
    t.after(async () => {
        try { await blobs.close(); await fixture.close(); }
        finally { const target = resolve('data/artifacts', scope.workspaceId); assert.ok(target.startsWith(resolve('data/artifacts') + sep)); await rm(target, { recursive: true, force: true }); }
    });
    await fixture.owner.query('INSERT INTO identity.principals (principal_id,kind,display_name) VALUES ($1,$2,$3)', [scope.principalId, 'local_user', 'Owner']);
    await fixture.owner.query('INSERT INTO identity.workspaces (workspace_id,owner_principal_id,slug,display_name) VALUES ($1,$2,$3,$4)',
        [scope.workspaceId, scope.principalId, 'provider-' + scope.workspaceId.slice(0, 8), 'Provider']);
    await fixture.owner.query('INSERT INTO product.projects (project_id, workspace_id, slug, title) VALUES ($1,$2,$3,$4)',
        [projectId, scope.workspaceId, 'provider-project', 'Provider project']);
    const audit = createAudit({ pool: fixture.db.pool });
    const policies = createPolicy({ pool: fixture.db.pool, audit });
    const grants = createGrants({ pool: fixture.db.pool, audit });
    const budgets = createBudgets({ pool: fixture.db.pool, audit });
    const operations = createOperations({ pool: fixture.db.pool });
    const rules = defaultPolicyRules();
    rules.autonomyModes.autonomous_coding.allowedCapabilities.push('model.inference');
    rules.privacyRules = { denyEgress: false, allowedEgressHosts: ['api.openai.com'] };
    const revision = (await policies.createRevision(scope, randomUUID(), { rules, reason: 'provider qualification' })).data;
    await policies.activate(scope, revision.id, randomUUID(), { digest: revision.digest });
    await grants.create(scope, projectId, randomUUID(), {
        capability: 'model.inference',
        resourceScope: { provider: 'openai' },
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    await budgets.create(scope, projectId, randomUUID(), { limitMicroUsd: '100000', scopeKind: 'project', reason: 'provider qualification' });
    const secrets = { configured: () => true, resolve: () => 'test-key-that-is-long-enough' };
    return { fixture, scope, projectId, audit, policies, grants, budgets, operations, secrets, artifacts };
}

const response = (body, status = 200, requestId = 'req_test') => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': requestId },
});

const fetchFor = prompt => async (url, options) => {
    const parsed = new URL(String(url));
    if (options.method === 'GET' && parsed.pathname === '/v1/models') {
        return response({ data: [{ id: 'gpt-5-mini' }, { id: 'unknown-model' }] });
    }
    if (options.method === 'POST' && parsed.pathname === '/v1/responses') {
        const body = JSON.parse(String(options.body));
        const overage = typeof body.input === 'string' && body.input.includes('overage');
        return response({
            id: 'resp_test', status: 'completed', output_text: 'done',
            usage: overage ? { input_tokens: 100000, output_tokens: 100000, total_tokens: 200000 } : { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        });
    }
    return response({ error: 'unexpected' }, 500);
};

test('Stage 06 providers discover models, reject unknown models, route, probe, and reconcile usage on PostgreSQL', { timeout: 120000 }, async t => {
    const f = await ownerFixture(t);
    let generateCalls = 0, discoveryCalls = 0, offline = false;
    const fetchImpl = async (url, options) => {
        if (offline) throw new Error('Test transport is offline');
        if (options.method === 'GET') discoveryCalls++; else generateCalls++;
        return fetchFor('')(url, options);
    };
    const deps = { pool: f.fixture.db.pool, audit: f.audit, policies: f.policies, grants: f.grants, budgets: f.budgets, operations: f.operations, secrets: f.secrets, artifacts: f.artifacts };
    const providers = createProviders({ ...deps, fetchImpl });
    const created = await providers.create(f.scope, randomUUID(), {
        kind: 'openai', displayName: 'Primary OpenAI',
        endpointPolicy: { baseUrl: OPENAI_BASE_URL },
        privacyPolicy: { allowedClassifications: ['public', 'internal'], providerTraining: false, retention: 'none' },
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.credentialConfigured, true);
    assert.equal(created.data.endpointSummary, OPENAI_BASE_URL);
    await assert.rejects(providers.create(f.scope, randomUUID(), {
        kind: 'openai', displayName: 'Bad endpoint',
        endpointPolicy: { baseUrl: 'https://example.com/v1' },
        privacyPolicy: { allowedClassifications: ['internal'], providerTraining: false, retention: 'none' },
    }), error => error.code === 'ENDPOINT_NOT_ALLOWED');

    const discoveryKey = randomUUID();
    const discovered = await providers.discover(f.scope, created.data.id, discoveryKey, { probe: false });
    assert.equal(discovered.status, 202);
    assert.equal(discovered.data.kind, 'provider.discovery');
    const models = await providers.models(f.scope, { limit: 20 });
    assert.equal(models.data.length, 2);
    const known = models.data.find(model => model.externalModelId === 'gpt-5-mini');
    assert.equal(known.availability, 'available');
    assert.equal(known.capabilities.chat, true);
    assert.equal(models.data.find(model => model.externalModelId === 'unknown-model').availability, 'unknown');
    const fetched = await providers.get(f.scope, created.data.id);
    assert.equal(fetched.health.state, 'healthy');
    assert.equal(fetched.health.modelCount, 2);

    const preview = await providers.routingPreview(f.scope, {
        taskType: 'intent-extraction', capabilities: ['chat', 'structuredOutput'],
        estimatedInputTokens: 1000, maxOutputTokens: 100, classification: 'internal', budgetCeilingMicroUsd: '10000',
    });
    assert.equal(preview.selectedModelId, known.id);
    assert.equal(preview.rejected.length, 1);
    assert.equal(preview.rejected[0].reasons[0], 'MODEL_UNAVAILABLE');

    const probeInput = {
        providerId: created.data.id, modelId: known.id, projectId: f.projectId,
        operationKey: 'provider-probe-ok', prompt: 'Say done', maxOutputTokens: 32,
        estimatedInputTokens: 10, budgetCeilingMicroUsd: '1000', classification: 'internal', mode: 'autonomous_coding',
    };
    const probed = await providers.probe(f.scope, probeInput);
    assert.equal(probed.text, 'done');
    assert.equal(probed.call.state, 'succeeded');
    assert.equal(probed.call.actualMicroUsd, '13');
    assert.equal(probed.call.usage.totalTokens, 15);
    const usage = await f.budgets.usage(f.scope, { limit: 10, category: 'model.inference' });
    assert.equal(usage.data.length, 1);
    assert.equal(usage.data[0].operationKey, 'provider-probe-ok:model');
    const budget = (await f.budgets.list(f.scope, f.projectId)).data[0];
    assert.equal(budget.spentMicroUsd, '13');
    assert.equal(budget.reservedMicroUsd, '0');
    const calls = (await f.fixture.owner.query('SELECT state, actual_micro_usd, external_request_id FROM inference.model_calls')).rows;
    assert.deepEqual(calls, [{ state: 'succeeded', actual_micro_usd: '13', external_request_id: 'req_test' }]);

    await t.test('durable encrypted outputs replay across service restart without another inference or charge', async () => {
        assert.ok(probed.call.outputArtifactId);
        const artifact = await f.artifacts.download(f.scope, probed.call.outputArtifactId);
        assert.equal(artifact.bytes.toString(), 'done');
        const restarted = createProviders({ ...deps, fetchImpl: async () => { throw new Error('Replay must not use transport'); } });
        const replayed = await restarted.probe(f.scope, probeInput);
        assert.deepEqual(replayed, probed);
        assert.equal(generateCalls, 1);
        assert.equal((await f.budgets.usage(f.scope, { limit: 10, category: 'model.inference' })).data.length, 1);
        await assert.rejects(restarted.probe(f.scope, { ...probeInput, prompt: 'different input' }), error => error.code === 'IDEMPOTENCY_CONFLICT');
        await assert.rejects(f.fixture.owner.query("UPDATE inference.model_calls SET usage='{}' WHERE id=$1", [probed.call.id]), /evidence is immutable/);
    });

    await t.test('output artifact foreign keys reject cross-project references', async () => {
        const other = randomUUID();
        await f.fixture.owner.query('INSERT INTO product.projects(project_id,workspace_id,slug,title) VALUES($1,$2,$3,$4)', [other, f.scope.workspaceId, 'other-output-project', 'Other']);
        await assert.rejects(f.fixture.owner.query(`INSERT INTO inference.model_calls
            (id,workspace_id,project_id,operation_key,provider_connection_id,model_id,routing_decision,input_digest,state,estimated_micro_usd,output_artifact_id)
            SELECT $1,workspace_id,$2,$3,provider_connection_id,model_id,routing_decision,input_digest,'running',estimated_micro_usd,output_artifact_id
            FROM inference.model_calls WHERE id=$4`, [randomUUID(), other, 'cross-project-output', probed.call.id]), error => error.code === '23503');
    });

    await t.test('discovery replay works offline and changed keys or unsupported paid discovery do not dispatch', async () => {
        offline = true;
        assert.deepEqual(await providers.discover(f.scope, created.data.id, discoveryKey, { probe: false }), discovered);
        await assert.rejects(providers.discover(f.scope, created.data.id, discoveryKey, { probe: true }), error => error.code === 'IDEMPOTENCY_CONFLICT');
        await assert.rejects(providers.discover(f.scope, created.data.id, randomUUID(), { probe: true, budgetCeilingMicroUsd: '1000' }), error => error.code === 'CAPABILITY_UNAVAILABLE');
        assert.equal(discoveryCalls, 1);
        offline = false;
    });

    await t.test('dispatch enforces provider privacy, health, and qualified input limits before reservation', async () => {
        await f.fixture.owner.query('UPDATE inference.provider_connections SET privacy_policy=$2 WHERE id=$1', [created.data.id,
            { allowedClassifications: ['public'], providerTraining: false, retention: 'none' }]);
        await assert.rejects(providers.probe(f.scope, { ...probeInput, operationKey: 'privacy-denied' }), error => error.code === 'NO_ELIGIBLE_MODEL');
        await f.fixture.owner.query('UPDATE inference.provider_connections SET privacy_policy=$2 WHERE id=$1', [created.data.id,
            { allowedClassifications: ['public', 'internal'], providerTraining: false, retention: 'none' }]);
        await assert.rejects(providers.probe(f.scope, { ...probeInput, operationKey: 'context-denied', estimatedInputTokens: 300000, maxOutputTokens: 1, budgetCeilingMicroUsd: '100000' }), error => error.code === 'NO_ELIGIBLE_MODEL');
        await f.fixture.owner.query("UPDATE inference.provider_connections SET status='degraded' WHERE id=$1", [created.data.id]);
        await assert.rejects(providers.probe(f.scope, { ...probeInput, operationKey: 'health-denied' }), error => error.code === 'NO_ELIGIBLE_MODEL');
        await f.fixture.owner.query("UPDATE inference.provider_connections SET status='healthy' WHERE id=$1", [created.data.id]);
        assert.equal(generateCalls, 1);
        assert.equal((await f.fixture.owner.query("SELECT count(*) FROM control.budget_reservations WHERE operation_key LIKE '%-denied'")).rows[0].count, '0');
    });

    await t.test('missing usage retains an unknown reservation and cannot be blindly retried', async () => {
        let attempts = 0;
        const malformed = createProviders({ ...deps, fetchImpl: async () => { attempts++; return response({ output_text: 'unaccounted output', usage: {} }); } });
        const input = { ...probeInput, operationKey: 'unknown-usage' };
        await assert.rejects(malformed.probe(f.scope, input), error => error.code === 'PROVIDER_USAGE_UNKNOWN');
        assert.equal((await f.fixture.owner.query('SELECT state FROM control.budget_reservations WHERE operation_key=$1', [input.operationKey])).rows[0].state, 'unknown');
        const call = (await f.fixture.owner.query('SELECT state,actual_micro_usd,output_artifact_id FROM inference.model_calls WHERE operation_key=$1', [input.operationKey])).rows[0];
        assert.deepEqual(call, { state: 'unknown', actual_micro_usd: null, output_artifact_id: null });
        await assert.rejects(malformed.probe(f.scope, input), error => error.code === 'STATE_CONFLICT');
        assert.equal(attempts, 1);
    });

    await t.test('service-level circuit breaker survives multiple calls for the same provider', async () => {
        let attempts = 0;
        const limited = createProviders({ ...deps, fetchImpl: async () => { attempts++; return response({}, 429); } });
        for (let i = 0; i < 3; i++) await assert.rejects(limited.probe(f.scope, { ...probeInput, operationKey: 'limited-' + i }), error => error.code === 'PROVIDER_RATE_LIMITED');
        await assert.rejects(limited.probe(f.scope, { ...probeInput, operationKey: 'limited-open' }), error => error.code === 'PROVIDER_CIRCUIT_OPEN');
        assert.equal(attempts, 3);
        assert.equal((await f.fixture.owner.query("SELECT state FROM control.budget_reservations WHERE operation_key='limited-open'")).rows[0].state, 'released');
    });

    const overageProviders = createProviders({ pool: f.fixture.db.pool, audit: f.audit, policies: f.policies, grants: f.grants, budgets: f.budgets, operations: f.operations, secrets: f.secrets, artifacts: f.artifacts, fetchImpl: fetchFor('overage') });
    await assert.rejects(overageProviders.probe(f.scope, {
        providerId: created.data.id, modelId: known.id, projectId: f.projectId,
        operationKey: 'provider-probe-overage', prompt: 'overage', maxOutputTokens: 32,
        estimatedInputTokens: 10, budgetCeilingMicroUsd: '1000', classification: 'internal', mode: 'autonomous_coding',
    }), error => error.code === 'ACTUAL_EXCEEDS_RESERVATION');
    const unknownCall = (await f.fixture.owner.query("SELECT state FROM inference.model_calls WHERE operation_key='provider-probe-overage'")).rows[0];
    assert.equal(unknownCall.state, 'unknown');
    const unknownReservation = (await f.fixture.owner.query("SELECT state FROM control.budget_reservations WHERE operation_key='provider-probe-overage'")).rows[0];
    assert.equal(unknownReservation.state, 'unknown');

    await assert.rejects(providers.get({ ...f.scope, workspaceId: randomUUID() }, created.data.id), error => error.code === 'NOT_FOUND');
});
