// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createPostgresFixture } from './fixtures/postgres.js';
import { createIdentity } from '../src/modules/identity/index.js';
import { createAudit, createPolicy, createGrants, createBudgets } from '../src/modules/governance/index.js';
import { createOperations } from '../src/modules/operations/index.js';
import { createProviders } from '../src/modules/providers/index.js';
import { createApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { defaultPolicyRules } from '../src/modules/governance/policy.js';
import { compatibleProfileFromEnv } from '../src/modules/providers/compatible.js';
import { providerOutputSchemas } from '../src/http/provider.schemas.js';

test('Stage 06 provider HTTP contracts enforce auth, validation, idempotency, and version preconditions', { timeout: 120000 }, async t => {
    const fixture = await createPostgresFixture({ poolMax: 4, stage06Only: true });
    const scope = { workspaceId: randomUUID(), principalId: randomUUID() };
    let server;
    t.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await fixture.close(); });
    await fixture.owner.query('INSERT INTO identity.principals (principal_id,kind,display_name) VALUES ($1,$2,$3)', [scope.principalId, 'local_user', 'Owner']);
    await fixture.owner.query('INSERT INTO identity.workspaces (workspace_id,owner_principal_id,slug,display_name) VALUES ($1,$2,$3,$4)',
        [scope.workspaceId, scope.principalId, 'provider-http', 'Provider HTTP']);
    const identity = createIdentity({ pool: fixture.db.pool });
    const audit = createAudit({ pool: fixture.db.pool });
    const policies = createPolicy({ pool: fixture.db.pool, audit });
    const grants = createGrants({ pool: fixture.db.pool, audit });
    const budgets = createBudgets({ pool: fixture.db.pool, audit });
    const operations = createOperations({ pool: fixture.db.pool });
    const compatibleBase = 'https://api.apinex.bond/v1';
    const secrets = { configured: kind => kind === 'openai_compatible', compatibleBaseUrl: () => compatibleBase, resolve: kind => kind === 'openai_compatible' ? 'test-compatible-key-not-a-real-secret' : undefined };
    let fetchCalls = 0;
    const compatibleProfile = compatibleProfileFromEnv({ OPENAI_COMPATIBLE_MODEL: 'test-model', OPENAI_COMPATIBLE_INPUT_MICRO_USD_PER_MILLION: '100', OPENAI_COMPATIBLE_OUTPUT_MICRO_USD_PER_MILLION: '100' });
    const providers = createProviders({ pool: fixture.db.pool, audit, policies, grants, budgets, operations, secrets, compatibleProfile,
        fetchImpl: async () => { fetchCalls++; return new Response(JSON.stringify({ data: [{ id: 'test-model' }, { id: 'unknown' }] }), { status: 200 }); } });
    const config = loadConfig({ DATABASE_URL: fixture.runtimeUrl.href });
    const origin = config.allowedOrigins[0];
    server = createApp({ config, services: { identity, audit, policies, grants, budgets, operations, providers } }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const challenge = await identity.issueChallenge(scope);
    const bootstrap = await fetch(base + '/session/bootstrap', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(challenge) });
    assert.equal(bootstrap.status, 200);
    const cookie = bootstrap.headers.get('set-cookie').split(';')[0];
    const session = (await bootstrap.json()).data;
    const headers = { cookie, origin, 'content-type': 'application/json', 'x-csrf-token': session.csrfToken, 'idempotency-key': randomUUID() };
    const call = (path, method = 'GET', body, extra = {}) => fetch(base + path, {
        method, headers: { ...headers, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const provider = {
        kind: 'openai', displayName: 'HTTP OpenAI',
        endpointPolicy: { baseUrl: 'https://api.openai.com/v1' },
        privacyPolicy: { allowedClassifications: ['internal'], providerTraining: false, retention: 'none' },
    };

    assert.equal((await call('/providers', 'POST', provider, { 'x-csrf-token': '' })).status, 403);
    assert.equal((await call('/providers', 'POST', { ...provider, endpointPolicy: { baseUrl: 'https://evil.example/v1' } })).status, 400);
    assert.equal((await call('/providers', 'POST', { ...provider, secretReferenceId: randomUUID() })).status, 400);
    const created = await call('/providers', 'POST', provider);
    assert.equal(created.status, 201);
    const createdBody = (await created.json()).data;
    providerOutputSchemas.Provider.parse(createdBody);
    assert.equal(created.headers.get('location'), '/api/v1/providers/' + createdBody.id);
    assert.equal(createdBody.credentialConfigured, false);
    const replay = await call('/providers', 'POST', provider, { 'idempotency-key': headers['idempotency-key'] });
    assert.equal(replay.status, 201);
    assert.equal((await replay.json()).data.id, createdBody.id);
    const listed = await call('/providers');
    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).data.length, 1);
    assert.equal((await call('/providers/' + createdBody.id)).status, 200);
    assert.equal((await call('/providers/' + randomUUID())).status, 404);
    assert.equal((await call('/providers/' + createdBody.id, 'PATCH', { displayName: 'Renamed' })).status, 428);
    assert.equal((await call('/providers/' + createdBody.id, 'PATCH', { displayName: 'Renamed' }, { 'if-match': '"9"' })).status, 412);
    const patched = await call('/providers/' + createdBody.id, 'PATCH', { displayName: 'Renamed' }, { 'if-match': '"1"' });
    assert.equal(patched.status, 200);
    const patchedBody = (await patched.json()).data;
    assert.equal(patchedBody.displayName, 'Renamed');
    assert.equal(patchedBody.version, '2');
    const compatible = await call('/providers', 'POST', {
        kind: 'openai_compatible', displayName: 'HTTP compatible',
        endpointPolicy: { baseUrl: compatibleBase },
        privacyPolicy: { allowedClassifications: ['internal'], providerTraining: false, retention: 'none' },
    }, { 'idempotency-key': randomUUID() });
    assert.equal(compatible.status, 201);
    const compatibleBody = (await compatible.json()).data;
    assert.equal(compatibleBody.kind, 'openai_compatible');
    assert.equal(compatibleBody.credentialConfigured, true);
    assert.equal(compatibleBody.endpointSummary, compatibleBase);
    const offAllowlist = await call('/providers', 'POST', {
        kind: 'openai_compatible', displayName: 'HTTP other',
        endpointPolicy: { baseUrl: 'https://evil.example/v1' },
        privacyPolicy: { allowedClassifications: ['internal'], providerTraining: false, retention: 'none' },
    }, { 'idempotency-key': randomUUID() });
    assert.equal(offAllowlist.status, 400);
    assert.equal((await offAllowlist.json()).code, 'ENDPOINT_NOT_ALLOWED');
    const discovery = await call('/providers/' + createdBody.id + '/discovery', 'POST', { probe: false });
    assert.equal(discovery.status, 503);
    assert.equal((await discovery.json()).code, 'CREDENTIAL_UNAVAILABLE');
    assert.equal((await call('/routing/preview', 'POST', {
        taskType: 'intent-extraction', capabilities: ['chat'], estimatedInputTokens: 10,
        maxOutputTokens: 10, classification: 'internal', budgetCeilingMicroUsd: '1',
    })).status, 409);

    await t.test('provider preflight supports exact Origins and version headers without granting access', async () => {
        const preflight = { origin, 'access-control-request-method': 'PATCH', 'access-control-request-headers': 'content-type,x-csrf-token,idempotency-key,if-match' };
        const response = await fetch(base + '/providers/' + createdBody.id, { method: 'OPTIONS', headers: preflight });
        assert.equal(response.status, 204);
        assert.equal(response.headers.get('access-control-allow-origin'), origin);
        assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
        assert.equal((await fetch(base + '/providers/' + createdBody.id, { method: 'OPTIONS', headers: { ...preflight, origin: 'https://attacker.invalid' } })).status, 403);
        assert.equal((await fetch(base + '/providers', { method: 'HEAD', headers: { origin } })).status, 401);
        assert.equal((await call('/providers/' + createdBody.id, 'PATCH', { enabled: false }, { 'if-match': '"2"', cookie: '' })).status, 401);
    });

    await t.test('PATCH replay binds If-Match and unknown fields cannot silently change provider configuration', async () => {
        const key = randomUUID();
        const response = await call('/providers/' + createdBody.id, 'PATCH', { displayName: 'Version replay' }, { 'if-match': '"2"', 'idempotency-key': key });
        assert.equal(response.status, 200);
        const result = await response.json();
        providerOutputSchemas.ProviderResponse.parse(result);
        const repeated = await call('/providers/' + createdBody.id, 'PATCH', { displayName: 'Version replay' }, { 'if-match': '"2"', 'idempotency-key': key });
        assert.deepEqual(await repeated.json().then(value => value.data), result.data);
        assert.equal((await call('/providers/' + createdBody.id, 'PATCH', { displayName: 'Version replay' }, { 'if-match': '"3"', 'idempotency-key': key })).status, 409);
        assert.equal((await call('/providers', 'POST', { ...provider, apiKey: 'must-not-be-accepted' })).status, 400);
        assert.equal((await call('/providers/' + createdBody.id, 'PATCH', {})).status, 428);
    });

    await t.test('discovery and routing return validated envelopes with durable replay and no inference', async () => {
        const discoveryKey = randomUUID();
        const response = await call('/providers/' + compatibleBody.id + '/discovery', 'POST', { probe: false }, { 'idempotency-key': discoveryKey });
        assert.equal(response.status, 202);
        const operation = await response.json();
        providerOutputSchemas.OperationResponse.parse(operation);
        assert.equal(response.headers.get('location'), '/api/v1/operations/' + operation.data.id);
        const repeated = await call('/providers/' + compatibleBody.id + '/discovery', 'POST', { probe: false }, { 'idempotency-key': discoveryKey });
        assert.deepEqual((await repeated.json()).data, operation.data);
        assert.equal(fetchCalls, 1);
        const models = await call('/models?providerId=' + compatibleBody.id);
        const catalog = await models.json();
        providerOutputSchemas.ModelListResponse.parse(catalog);
        assert.equal(catalog.data.length, 2);
        assert.equal(catalog.data.filter(row => row.availability === 'unknown').length, 1);
        const rules = defaultPolicyRules();
        rules.privacyRules = { denyEgress: false, allowedEgressHosts: [new URL(compatibleBase).hostname] };
        const policy = (await policies.createRevision(scope, randomUUID(), { rules, reason: 'HTTP routing qualification' })).data;
        await policies.activate(scope, policy.id, randomUUID(), { digest: policy.digest });
        const request = { taskType: 'intent-extraction', capabilities: ['chat'], estimatedInputTokens: 10, maxOutputTokens: 10, classification: 'internal', budgetCeilingMicroUsd: '1000' };
        const key = randomUUID();
        const routed = await call('/routing/preview', 'POST', request, { 'idempotency-key': key });
        assert.equal(routed.status, 200);
        const decision = await routed.json();
        providerOutputSchemas.RoutingResponse.parse(decision);
        assert.ok(decision.data.selectedModelId);
        assert.deepEqual((await (await call('/routing/preview', 'POST', request, { 'idempotency-key': key })).json()).data, decision.data);
        assert.equal((await call('/routing/preview', 'POST', { ...request, maxOutputTokens: 11 }, { 'idempotency-key': key })).status, 409);
        assert.equal((await call('/routing/preview', 'POST', request, { 'idempotency-key': '' })).status, 400);
        assert.equal((await call('/routing/preview', 'POST', { ...request, capabilities: ['embeddings'] }, { 'idempotency-key': randomUUID() })).status, 409);
        assert.equal((await call('/providers/' + compatibleBody.id + '/discovery', 'POST', { probe: true }, { 'idempotency-key': randomUUID() })).status, 409);
        assert.equal((await call('/providers/' + compatibleBody.id + '/discovery', 'POST', { probe: true, budgetCeilingMicroUsd: '1000' }, { 'idempotency-key': randomUUID() })).status, 503);
        assert.equal(fetchCalls, 1);
        assert.equal((await fixture.owner.query('SELECT count(*) FROM inference.model_calls')).rows[0].count, '0');
    });
});
