// @ts-check
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPostgresFixture } from '../backend/tests/fixtures/postgres.js';
import { createAudit, createPolicy, createGrants, createBudgets } from '../backend/src/modules/governance/index.js';
import { defaultPolicyRules } from '../backend/src/modules/governance/policy.js';
import { createOperations } from '../backend/src/modules/operations/index.js';
import { createProviders } from '../backend/src/modules/providers/index.js';
import { compatibleProfileFromEnv, normalizeCompatibleBaseUrl } from '../backend/src/modules/providers/compatible.js';
import { createEnvironmentSecrets } from '../backend/src/modules/providers/secrets.js';
import { createArtifactStore } from '../backend/src/platform/blob-store/index.js';
import { createArtifacts } from '../backend/src/modules/artifacts/index.js';
import { createProjects } from '../backend/src/modules/projects/index.js';
import { rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const BUDGET_CEILING_MICRO_USD = '10000';
let fixture;
let blobs, workspaceId;
let stage = 'configuration';

try {
    const compatibleRequested = Boolean(process.env.OPENAI_COMPATIBLE_BASE_URL || process.env.OPENAI_COMPATIBLE_API_KEY);
    const compatibleProfile = compatibleRequested ? compatibleProfileFromEnv() : null;
    if (compatibleRequested && !compatibleProfile) throw new Error('OpenAI-compatible credentials are configured but OPENAI_COMPATIBLE_MODEL and pricing are not configured; no provider request was made.');
    const kind = compatibleProfile ? 'openai_compatible' : 'openai';
    const baseUrl = compatibleProfile ? normalizeCompatibleBaseUrl(process.env.OPENAI_COMPATIBLE_BASE_URL) : OPENAI_BASE_URL;
    const host = new URL(baseUrl).hostname;
    const targetModel = compatibleProfile?.externalModelId ?? 'gpt-5-mini';
    if (kind === 'openai' && !process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured; no provider request was made.');
    if (kind === 'openai_compatible' && !process.env.OPENAI_COMPATIBLE_API_KEY) throw new Error('OPENAI_COMPATIBLE_API_KEY is not configured; no provider request was made.');

    fixture = await createPostgresFixture({ poolMax: 4, stage06Only: true });
    const scope = { workspaceId: randomUUID(), principalId: randomUUID() };
    workspaceId = scope.workspaceId;
    const projectId = randomUUID();
    stage = 'database seed';
    await fixture.owner.query('INSERT INTO identity.principals (principal_id,kind,display_name) VALUES ($1,$2,$3)', [scope.principalId, 'local_user', 'Provider verifier']);
    await fixture.owner.query('INSERT INTO identity.workspaces (workspace_id,owner_principal_id,slug,display_name) VALUES ($1,$2,$3,$4)',
        [scope.workspaceId, scope.principalId, 'provider-verify-' + scope.workspaceId.slice(0, 8), 'Provider verification']);
    await fixture.owner.query('INSERT INTO product.projects (project_id, workspace_id, slug, title) VALUES ($1,$2,$3,$4)',
        [projectId, scope.workspaceId, 'provider-verify', 'Provider verification']);
    const audit = createAudit({ pool: fixture.db.pool });
    const policies = createPolicy({ pool: fixture.db.pool, audit });
    const grants = createGrants({ pool: fixture.db.pool, audit });
    const budgets = createBudgets({ pool: fixture.db.pool, audit });
    const operations = createOperations({ pool: fixture.db.pool });
    blobs = await createArtifactStore();
    const artifacts = createArtifacts({ pool: fixture.db.pool, blobs, projects: createProjects({ pool: fixture.db.pool }) });
    const rules = defaultPolicyRules();
    rules.autonomyModes.autonomous_coding.allowedCapabilities.push('model.inference');
    rules.privacyRules = { denyEgress: false, allowedEgressHosts: [host] };
    const revision = (await policies.createRevision(scope, randomUUID(), { rules, reason: 'Stage 06 provider verification' })).data;
    await policies.activate(scope, revision.id, randomUUID(), { digest: revision.digest });
    await grants.create(scope, projectId, randomUUID(), {
        capability: 'model.inference',
        resourceScope: { provider: kind },
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    await budgets.create(scope, projectId, randomUUID(), { limitMicroUsd: '20000', scopeKind: 'project', reason: 'Stage 06 capped probe' });
    const providers = createProviders({
        pool: fixture.db.pool, audit, policies, grants, budgets, operations,
        secrets: createEnvironmentSecrets(), compatibleProfile, artifacts,
    });

    stage = 'provider creation';
    const created = await providers.create(scope, randomUUID(), {
        kind,
        displayName: compatibleProfile ? 'Stage 06 OpenAI-compatible' : 'Stage 06 OpenAI',
        endpointPolicy: { baseUrl },
        privacyPolicy: { allowedClassifications: ['public', 'internal'], providerTraining: false, retention: 'none' },
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.credentialConfigured, true);

    stage = 'live model discovery';
    await providers.discover(scope, created.data.id, randomUUID(), { probe: false });
    const models = await providers.models(scope, { limit: 100 });
    const model = models.data.find(item => item.externalModelId === targetModel);
    if (!model) throw new Error('The configured ' + targetModel + ' model profile was not returned by provider discovery.');

    stage = 'live capped inference probe';
    const operationKey = 'provider-verify-' + randomUUID();
    const result = await providers.probe(scope, {
        providerId: created.data.id,
        modelId: model.id,
        projectId,
        operationKey,
        prompt: 'Reply with exactly: ASI Stage 06 probe',
        maxOutputTokens: 16,
        estimatedInputTokens: 100,
        budgetCeilingMicroUsd: BUDGET_CEILING_MICRO_USD,
        classification: 'internal',
        mode: 'autonomous_coding',
        deadlineMs: 30000,
    });
    assert.equal(result.call.state, 'succeeded');
    assert.ok(BigInt(result.call.actualMicroUsd) <= BigInt(BUDGET_CEILING_MICRO_USD));
    assert.ok(result.call.usage.inputTokens > 0 && result.call.usage.outputTokens > 0);
    const usage = await budgets.usage(scope, { limit: 10, projectId, category: 'model.inference' });
    assert.equal(usage.data.length, 1);
    const account = (await budgets.list(scope, projectId)).data[0];
    assert.equal(account.spentMicroUsd, result.call.actualMicroUsd);
    assert.equal(account.reservedMicroUsd, '0');

    process.stdout.write(
        `STAGE06_PROVIDER_VERIFIED: ${kind} ${targetModel} live probe succeeded; provider request ${result.providerRequestId}; ` +
        `inputTokens=${result.call.usage.inputTokens}; outputTokens=${result.call.usage.outputTokens}; ` +
        `actualMicroUsd=${result.call.actualMicroUsd}; ceilingMicroUsd=${BUDGET_CEILING_MICRO_USD}.\n`
    );
} catch (error) {
    process.stderr.write(`STAGE06_PROVIDER_VERIFICATION_FAILED at ${stage}: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
} finally {
    if (blobs) await blobs.close();
    if (fixture) await fixture.close();
    if (workspaceId) { const target = resolve('data/artifacts', workspaceId); assert.ok(target.startsWith(resolve('data/artifacts') + sep)); await rm(target, { recursive: true, force: true }); }
}
