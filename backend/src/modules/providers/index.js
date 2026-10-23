// @ts-check
import { randomUUID } from 'node:crypto';
import { executeCommand } from '../../platform/database/commands.js';
import { withScopedTransaction } from '../../platform/database/transaction.js';
import { commandDigest } from '../../shared/canonicalization.js';
import { apiError } from '../../../middlewares/error-handler.js';
import { evaluatePolicy } from '../governance/policy.js';
import { estimateMicroUsd, estimateFromUsage, knownPricing, profileFor } from './catalog.js';
import { buildRoutingDecision } from './router.js';
import { createOpenAIAdapter, ProviderError } from './openai.js';
import { createOpenAICompatibleAdapter, normalizeCompatibleBaseUrl } from './compatible.js';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

const providerView = (row, credentialConfigured) => ({
    id: row.id,
    kind: row.kind,
    displayName: row.display_name,
    status: row.status,
    endpointSummary: row.endpoint_policy?.baseUrl ?? OPENAI_BASE_URL,
    authMethod: row.auth_method,
    credentialConfigured,
    privacyPolicy: row.privacy_policy,
    health: row.health,
    enabled: row.enabled,
    version: String(row.version),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.last_checked_at ? { lastCheckedAt: row.last_checked_at.toISOString() } : {}),
});

const modelView = row => ({
    id: row.id,
    providerId: row.provider_connection_id,
    externalModelId: row.external_model_id,
    revision: row.revision,
    capabilities: row.capabilities,
    contextLimit: row.context_limit,
    maxOutputTokens: row.max_output_tokens,
    pricingRevision: row.pricing_revision,
    availability: row.availability,
    ...(row.qualification_ref ? { qualificationRef: row.qualification_ref } : {}),
    discoveredAt: row.discovered_at.toISOString(),
});

const callView = row => ({
    id: row.id,
    operationKey: row.operation_key,
    providerId: row.provider_connection_id,
    modelId: row.model_id,
    state: row.state,
    ...(row.external_request_id ? { externalRequestId: row.external_request_id } : {}),
    ...(row.latency_ms === null ? {} : { latencyMs: row.latency_ms }),
    estimatedMicroUsd: String(row.estimated_micro_usd),
    ...(row.actual_micro_usd === null ? {} : { actualMicroUsd: String(row.actual_micro_usd) }),
    ...(row.usage ? { usage: row.usage } : {}),
    ...(row.output_artifact_id ? { outputArtifactId: row.output_artifact_id } : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
});

function adapterFor(provider, apiKey, options) {
    if (provider.kind === 'openai_compatible') {
        return createOpenAICompatibleAdapter({ apiKey, baseUrl: provider.endpoint_policy.baseUrl, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs });
    }
    return createOpenAIAdapter({ apiKey, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs });
}

function safeProviderError(error) {
    if (error instanceof ProviderError) return apiError(error.code, error.message, error.status);
    return apiError('PROVIDER_UNAVAILABLE', 'Provider request could not be completed.', 503);
}

export function createProviders({ pool, audit, policies, grants, budgets, operations, secrets, artifacts = undefined, compatibleProfile = null, fetchImpl = globalThis.fetch, timeoutMs = 30000 }) {
    // Bounded ephemeral transport/circuit state, never a substitute for SQL authority.
    const transports = new Map();
    const dependency = name => {
        const value = { audit, policies, grants, budgets, operations, secrets, artifacts }[name];
        if (!value) throw apiError('CAPABILITY_UNAVAILABLE', 'Provider dependencies are not configured.', 503);
        return value;
    };
    const transport = provider => {
        const apiKey = dependency('secrets').resolve(provider.kind, provider.secret_reference_id);
        const key = commandDigest({ id: provider.id, endpoint: provider.endpoint_policy.baseUrl, apiKey: apiKey ?? null });
        if (!transports.has(key)) {
            if (transports.size >= 128) transports.delete(transports.keys().next().value);
            transports.set(key, adapterFor(provider, apiKey, { fetchImpl, timeoutMs }));
        }
        return transports.get(key);
    };
    const providerRow = async (tx, scope, providerId, lock = false) => {
        const row = (await tx.query('SELECT * FROM inference.provider_connections WHERE workspace_id=$1 AND id=$2' + (lock ? ' FOR UPDATE' : ''), [scope.workspaceId, providerId])).rows[0];
        if (!row) throw apiError('NOT_FOUND', 'Provider was not found.', 404);
        return row;
    };
    const modelRow = async (tx, scope, modelId) => {
        const row = (await tx.query(`SELECT m.*,p.enabled AS provider_enabled,p.status AS provider_status,p.privacy_policy,p.kind,p.endpoint_policy
            FROM inference.models m JOIN inference.provider_connections p
            ON p.workspace_id=m.workspace_id AND p.id=m.provider_connection_id
            WHERE m.workspace_id=$1 AND m.id=$2`, [scope.workspaceId, modelId])).rows[0];
        if (!row) throw apiError('NOT_FOUND', 'Model was not found.', 404);
        return row;
    };
    const replay = async (scope, route, key, input) => {
        if (typeof key !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(key)) throw apiError('INVALID_INPUT', 'An Idempotency-Key is required.');
        return withScopedTransaction(pool, scope, async tx => {
            const row = (await tx.query(`SELECT * FROM control.idempotency_records WHERE workspace_id=$1 AND principal_id=$2
                AND operation_key=$3 AND idempotency_key=$4`, [scope.workspaceId, scope.principalId, route, key])).rows[0];
            if (row && row.request_digest !== commandDigest(input)) throw apiError('IDEMPOTENCY_CONFLICT', 'Idempotency-Key was used with different input.', 409);
            return row?.status === 'completed' ? { ...row.response_body, status: row.response_status } : null;
        });
    };
    const routingRows = rows => rows.map(row => ({ ...row, max_input_tokens:
        (row.kind === 'openai' ? profileFor(row.external_model_id) : compatibleProfile)?.maxInputTokens ?? row.context_limit }));
    const preview = async (tx, scope, input) => {
        const policy = await dependency('policies').activeInTransaction(tx, scope.workspaceId);
        if (!policy) throw apiError('POLICY_NOT_CONFIGURED', 'No active policy revision exists.', 409);
        const rows = (await tx.query(`SELECT m.*,p.enabled AS provider_enabled,p.status AS provider_status,p.privacy_policy,p.kind,p.endpoint_policy
            FROM inference.models m JOIN inference.provider_connections p
            ON p.workspace_id=m.workspace_id AND p.id=m.provider_connection_id
            WHERE m.workspace_id=$1 ORDER BY m.id`, [scope.workspaceId])).rows;
        const decision = buildRoutingDecision({ models: routingRows(rows), input, policyRevisionId: policy.id, policyPrivacy: policy.rules.privacyRules });
        if (!decision.selectedModelId) throw apiError('NO_ELIGIBLE_MODEL', 'No model satisfies the requested capability, privacy, health, context, and budget constraints.', 409);
        return decision;
    };

    return {
        async create(scope, key, input) {
            if (!['openai', 'openai_compatible'].includes(input.kind)) throw apiError('AUTH_METHOD_UNSUPPORTED', 'This provider adapter is not qualified.', 400);
            if (input.secretReferenceId) throw apiError('AUTH_METHOD_UNSUPPORTED', 'This installation has no qualified provider secret reference store.', 400);
            const configuredSecrets = dependency('secrets');
            let endpoint;
            if (input.kind === 'openai') {
                endpoint = OPENAI_BASE_URL;
            } else {
                const configured = configuredSecrets.compatibleBaseUrl();
                if (!configured) throw apiError('CAPABILITY_UNAVAILABLE', 'No OpenAI-compatible endpoint is configured for this installation.', 503);
                try { endpoint = normalizeCompatibleBaseUrl(configured); }
                catch (error) { throw safeProviderError(error); }
            }
            if (input.endpointPolicy?.baseUrl !== endpoint) throw apiError('ENDPOINT_NOT_ALLOWED', 'The endpoint is not in the installation allowlist.', 400);
            const endpointPolicy = { ...input.endpointPolicy, baseUrl: endpoint };
            const endpointHost = new URL(endpoint).hostname;
            return executeCommand(pool, scope, 'POST /providers', key, input, async tx => {
                const id = randomUUID();
                const credentialConfigured = configuredSecrets.configured(input.kind);
                const row = (await tx.query(`INSERT INTO inference.provider_connections
                    (id,workspace_id,kind,display_name,endpoint_policy,auth_method,status,enabled,privacy_policy,health,created_by)
                    VALUES ($1,$2,$3,$4,$5,'api_key','unavailable',true,$6,$7,$8) RETURNING *`,
                [id, scope.workspaceId, input.kind, input.displayName, endpointPolicy, input.privacyPolicy,
                    credentialConfigured ? { state: 'configured', checkedAt: null } : { state: 'unconfigured', checkedAt: null }, scope.principalId])).rows[0];
                await dependency('audit').append(tx, scope, {
                    action: 'provider.created',
                    targetRef: id,
                    metadata: { kind: input.kind, endpoint: endpointHost, authAvailable: credentialConfigured },
                });
                return { status: 201, data: providerView(row, credentialConfigured) };
            });
        },
        async list(scope, { limit, after }) {
            return withScopedTransaction(pool, scope, async tx => {
                const rows = (await tx.query(`SELECT * FROM inference.provider_connections
                    WHERE ($1::uuid IS NULL OR id<$1::uuid) ORDER BY id DESC LIMIT $2`, [after, limit + 1])).rows;
                const items = rows.slice(0, limit);
                const configured = dependency('secrets');
                return { data: items.map(row => providerView(row, configured.configured(row.kind))), nextCursor: rows.length > limit ? Buffer.from(items.at(-1).id).toString('base64url') : null };
            });
        },
        async get(scope, providerId) {
            return withScopedTransaction(pool, scope, async tx => {
                const row = await providerRow(tx, scope, providerId);
                return providerView(row, dependency('secrets').configured(row.kind));
            });
        },
        async update(scope, providerId, key, expectedVersion, input) {
            return executeCommand(pool, scope, 'PATCH /providers/' + providerId, key, { expectedVersion, ...input }, async tx => {
                const existing = await providerRow(tx, scope, providerId, true);
                if (String(existing.version) !== expectedVersion) throw apiError('VERSION_MISMATCH', 'Provider version does not match If-Match.', 412);
                if (input.secretReferenceId) throw apiError('AUTH_METHOD_UNSUPPORTED', 'This installation has no qualified provider secret reference store.', 400);
                if (input.enabled === false) {
                    const active = (await tx.query(`SELECT 1 FROM inference.model_calls
                        WHERE workspace_id=$1 AND provider_connection_id=$2 AND state='running' LIMIT 1`, [scope.workspaceId, providerId])).rows[0];
                    if (active) throw apiError('ACTIVE_CALLS_EXIST', 'Provider has active inference calls.', 409);
                }
                const enabled = input.enabled ?? existing.enabled;
                const status = enabled ? (existing.status === 'disabled' ? 'unavailable' : existing.status) : 'disabled';
                const row = (await tx.query(`UPDATE inference.provider_connections SET
                    display_name=COALESCE($2,display_name),privacy_policy=COALESCE($3,privacy_policy),enabled=$4,status=$5,
                    version=version+1,updated_at=clock_timestamp() WHERE workspace_id=$6 AND id=$1 RETURNING *`,
                [providerId, input.displayName ?? null, input.privacyPolicy ?? null, enabled, status, scope.workspaceId])).rows[0];
                await dependency('audit').append(tx, scope, {
                    action: 'provider.updated', targetRef: providerId,
                    metadata: { enabled, status, displayName: row.display_name },
                });
                return { status: 200, data: providerView(row, dependency('secrets').configured(row.kind)) };
            });
        },
        async discover(scope, providerId, key, input) {
            const cached = await replay(scope, 'POST /providers/' + providerId + '/discovery', key, input);
            if (cached) return cached;
            if (input.probe) throw apiError('CAPABILITY_UNAVAILABLE', 'Paid probes require a project-scoped budget and grant; use the trusted qualification command until goal operations are available.', 503);
            const provider = await withScopedTransaction(pool, scope, async tx => providerRow(tx, scope, providerId));
            if (!provider.enabled) throw apiError('PROVIDER_DISABLED', 'Provider is disabled.', 409);
            const adapter = transport(provider);
            const endpointHost = new URL(provider.endpoint_policy.baseUrl).hostname;
            let discovered;
            try {
                discovered = await adapter.discoverModels({ deadlineMs: timeoutMs });
            } catch (error) {
                await withScopedTransaction(pool, scope, async tx => {
                    await tx.query(`UPDATE inference.provider_connections SET status='degraded',health=$2,last_checked_at=clock_timestamp(),
                        version=version+1,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$3`,
                    [scope.workspaceId, { state: 'degraded', checkedAt: new Date().toISOString() }, providerId]);
                });
                throw safeProviderError(error);
            }
            return executeCommand(pool, scope, 'POST /providers/' + providerId + '/discovery', key, input, async tx => {
                const current = await providerRow(tx, scope, providerId, true);
                if (!current.enabled) throw apiError('PROVIDER_DISABLED', 'Provider is disabled.', 409);
                let known = 0;
                const compatible = current.kind === 'openai_compatible' ? compatibleProfile : null;
                for (const model of discovered) {
                    const profile = current.kind === 'openai'
                        ? profileFor(model.externalModelId)
                        : (compatible?.externalModelId === model.externalModelId ? compatible : null);
                    const revision = profile?.revision ?? ('discovered-' + new Date().toISOString().slice(0, 10));
                    if (profile) known += 1;
                    await tx.query(`INSERT INTO inference.models
                        (id,workspace_id,provider_connection_id,external_model_id,revision,capabilities,context_limit,max_output_tokens,qualification_ref,pricing_revision,pricing,availability)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                        ON CONFLICT (provider_connection_id,external_model_id,revision) DO UPDATE
                        SET availability=EXCLUDED.availability,updated_at=clock_timestamp()`,
                    [randomUUID(), scope.workspaceId, providerId, profile?.externalModelId ?? model.externalModelId, revision,
                        profile?.capabilities ?? { known: false, chat: false },
                        profile?.contextLimit ?? 1, profile?.maxOutputTokens ?? 1, profile?.qualificationRef ?? null,
                        profile?.pricingRevision ?? 'unknown', profile?.pricing ?? { known: false },
                        profile ? 'available' : 'unknown']);
                }
                await tx.query(`UPDATE inference.provider_connections SET status='healthy',health=$2,last_checked_at=clock_timestamp(),
                    version=version+1,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$3`,
                [scope.workspaceId, { state: 'healthy', checkedAt: new Date().toISOString(), modelCount: discovered.length, qualifiedModelCount: known }, providerId]);
                const operation = await dependency('operations').providerDiscovery(tx, scope, providerId, {
                    probe: input.probe,
                    ...(input.budgetCeilingMicroUsd ? { budgetCeilingMicroUsd: input.budgetCeilingMicroUsd } : {}),
                    discovered: discovered.length,
                    qualified: known,
                });
                await dependency('audit').append(tx, scope, {
                    action: 'provider.models_discovered', targetRef: providerId,
                    metadata: { endpoint: endpointHost, discovered: discovered.length, qualified: known },
                });
                return { status: 202, data: operation };
            });
        },
        async models(scope, { limit, after, providerId, capability }) {
            return withScopedTransaction(pool, scope, async tx => {
                const rows = (await tx.query(`SELECT * FROM inference.models
                    WHERE ($1::uuid IS NULL OR provider_connection_id=$1)
                    AND ($2::text IS NULL OR capabilities->>$2 = 'true')
                    AND ($3::uuid IS NULL OR id<$3::uuid)
                    ORDER BY id DESC LIMIT $4`, [providerId ?? null, capability ?? null, after, limit + 1])).rows;
                const items = rows.slice(0, limit);
                return { data: items.map(modelView), nextCursor: rows.length > limit ? Buffer.from(items.at(-1).id).toString('base64url') : null };
            });
        },
        async routingPreview(scope, input, key = undefined) {
            if (key === undefined) return withScopedTransaction(pool, scope, tx => preview(tx, scope, input));
            return executeCommand(pool, scope, 'POST /routing/preview', key, input, async tx => ({ status: 200, data: await preview(tx, scope, input) }));
        },
        async probe(scope, input) {
            if (typeof input.operationKey !== 'string' || !/^[\x21-\x7e]{1,249}$/.test(input.operationKey)) throw apiError('INVALID_INPUT', 'Invalid operationKey.');
            if (typeof input.prompt !== 'string' || input.prompt.length < 1 || input.prompt.length > 32000
                || !Number.isSafeInteger(input.estimatedInputTokens) || input.estimatedInputTokens < 1
                || !Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens < 1
                || (input.deadlineMs !== undefined && (!Number.isInteger(input.deadlineMs) || input.deadlineMs < 1 || input.deadlineMs > 120000))
                || typeof input.budgetCeilingMicroUsd !== 'string' || !/^(0|[1-9]\d{0,18})$/.test(input.budgetCeilingMicroUsd)) {
                throw apiError('INVALID_INPUT', 'A bounded prompt, token estimates, and decimal budget ceiling are required.');
            }
            const artifactPort = dependency('artifacts');
            const inputTokens = Math.max(input.estimatedInputTokens, Buffer.byteLength(input.prompt, 'utf8') + 512);
            const inputDigest = commandDigest({ providerId: input.providerId, modelId: input.modelId, projectId: input.projectId,
                prompt: input.prompt, estimatedInputTokens: input.estimatedInputTokens, maxOutputTokens: input.maxOutputTokens,
                budgetCeilingMicroUsd: input.budgetCeilingMicroUsd, classification: input.classification ?? 'internal',
                mode: input.mode ?? 'autonomous_coding', deadlineMs: input.deadlineMs ?? timeoutMs });
            const existing = await withScopedTransaction(pool, scope, async tx => (await tx.query(
                'SELECT * FROM inference.model_calls WHERE workspace_id=$1 AND operation_key=$2', [scope.workspaceId, input.operationKey])).rows[0]);
            if (existing) {
                if (existing.input_digest.toString('hex') !== inputDigest) throw apiError('IDEMPOTENCY_CONFLICT', 'Probe operation key was used with different input.', 409);
                if (existing.state !== 'succeeded' || !existing.output_artifact_id) throw apiError('STATE_CONFLICT', 'The previous attempt requires review; it will not be dispatched again.', 409);
                const bytes = await withScopedTransaction(pool, scope, tx => artifactPort.content(tx, { ...scope, projectId: input.projectId }, existing.output_artifact_id));
                return { call: callView(existing), text: bytes.toString('utf8'), providerRequestId: existing.external_request_id };
            }
            const provider = await withScopedTransaction(pool, scope, async tx => providerRow(tx, scope, input.providerId));
            if (!provider.enabled) throw apiError('PROVIDER_DISABLED', 'Provider is disabled.', 409);
            const model = await withScopedTransaction(pool, scope, async tx => modelRow(tx, scope, input.modelId));
            if (model.provider_connection_id !== provider.id) throw apiError('INVALID_INPUT', 'Model does not belong to the provider.');
            if (model.availability !== 'available' || !knownPricing(model.pricing)) throw apiError('MODEL_UNAVAILABLE', 'Model is not qualified for inference.', 409);
            const estimated = estimateMicroUsd({ pricing: model.pricing, inputTokens, outputTokens: input.maxOutputTokens });
            const ceiling = BigInt(input.budgetCeilingMicroUsd);
            if (ceiling < estimated) throw apiError('BUDGET_REQUIRED', 'Budget ceiling cannot cover the reserved model call.', 409);
            const policy = await withScopedTransaction(pool, scope, async tx => dependency('policies').activeInTransaction(tx, scope.workspaceId));
            if (!policy) throw apiError('POLICY_NOT_CONFIGURED', 'No active policy revision exists.', 409);
            const filtered = buildRoutingDecision({ models: routingRows([model]), input: {
                capabilities: ['chat'], estimatedInputTokens: inputTokens, maxOutputTokens: input.maxOutputTokens,
                classification: input.classification ?? 'internal', budgetCeilingMicroUsd: input.budgetCeilingMicroUsd,
            }, policyRevisionId: policy.id, policyPrivacy: policy.rules.privacyRules });
            if (!filtered.selectedModelId) throw apiError('NO_ELIGIBLE_MODEL', 'The selected model fails privacy, health, context, capability, or budget constraints.', 409);
            const adapter = transport(provider);
            const budgetAccount = await withScopedTransaction(pool, scope, async tx => {
                const row = (await tx.query(`SELECT * FROM control.budget_accounts WHERE scope_kind='project' AND scope_id=$1`, [input.projectId])).rows[0];
                if (!row) throw apiError('BUDGET_REQUIRED', 'A project budget is required before inference.', 409);
                return row;
            });
            const endpointHost = new URL(provider.endpoint_policy.baseUrl).hostname;
            const grant = await dependency('grants').activeFor(scope, input.projectId, 'model.inference');
            const reservation = await dependency('budgets').reserve(scope, {
                projectId: input.projectId,
                ceilingMicroUsd: ceiling.toString(),
                operationKey: input.operationKey,
            });
            const decision = evaluatePolicy({
                policy: policy.rules,
                principal: { id: scope.principalId, kind: scope.principalKind ?? 'local_user', workspaceId: scope.workspaceId },
                mode: input.mode ?? 'autonomous_coding',
                action: 'model.inference',
                capability: 'model.inference',
                target: provider.kind + ':' + model.external_model_id,
                inputDigest,
                classification: input.classification ?? 'internal',
                egress: true,
                egressHost: endpointHost,
                grant,
                budget: {
                    reservationId: reservation.id,
                    costMicroUsd: estimated.toString(),
                    limitMicroUsd: String(budgetAccount.limit_micro_usd),
                    spentMicroUsd: String(budgetAccount.spent_micro_usd),
                    reservedMicroUsd: String(budgetAccount.reserved_micro_usd),
                },
            });
            if (decision.decision !== 'allow') {
                await dependency('budgets').release(scope, reservation.id, decision.reasonCode);
                throw apiError(decision.reasonCode === 'APPROVAL_REQUIRED' ? 'APPROVAL_REQUIRED' : 'POLICY_DENIED', 'Inference is not authorized by the active policy: ' + decision.reasonCode + '.', 403);
            }
            const callId = randomUUID();
            await withScopedTransaction(pool, scope, async tx => {
                const inserted = await tx.query(`INSERT INTO inference.model_calls
                    (id,workspace_id,project_id,operation_key,provider_connection_id,model_id,routing_decision,input_digest,state,estimated_micro_usd)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'running',$9) ON CONFLICT DO NOTHING RETURNING id`,
                [callId, scope.workspaceId, input.projectId, input.operationKey, provider.id, model.id,
                    { selectedModelId: model.id, policyRevisionId: policy.id, estimatedMicroUsd: estimated.toString() },
                    Buffer.from(inputDigest, 'hex'), estimated.toString()]);
                if (!inserted.rows.length) throw apiError('STATE_CONFLICT', 'This probe has already been accepted; concurrent dispatch was refused.', 409);
            });
            try {
                const result = await adapter.generate({
                    model: model.external_model_id,
                    prompt: input.prompt,
                    maxOutputTokens: input.maxOutputTokens,
                    deadlineMs: input.deadlineMs ?? timeoutMs,
                    classification: input.classification ?? 'internal',
                });
                const actual = estimateFromUsage(model.pricing, result.usage);
                if (actual > BigInt(reservation.ceilingMicroUsd)) {
                    await withScopedTransaction(pool, scope, async tx => {
                        await tx.query(`UPDATE inference.model_calls SET state='unknown',usage=$2,pricing_revision=$3,
                            actual_micro_usd=$4,external_request_id=$5,latency_ms=$6,updated_at=clock_timestamp(),version=version+1
                            WHERE workspace_id=$1 AND id=$7`,
                        [scope.workspaceId, result.usage, model.pricing_revision, actual.toString(), result.providerRequestId, result.latencyMs, callId]);
                    });
                    await dependency('budgets').markUnknown(scope, reservation.id);
                    throw Object.assign(apiError('ACTUAL_EXCEEDS_RESERVATION', 'Provider usage exceeded the reserved ceiling; the call is marked unknown.', 409), { handled: true });
                }
                await withScopedTransaction(pool, scope, async tx => {
                    const artifact = await artifactPort.store(tx, { ...scope, projectId: input.projectId }, Buffer.from(result.text, 'utf8'), 'text/plain');
                    await tx.query(`UPDATE inference.model_calls SET usage=$2,pricing_revision=$3,
                        actual_micro_usd=$4,external_request_id=$5,latency_ms=$6,output_artifact_id=$8,updated_at=clock_timestamp(),version=version+1
                        WHERE workspace_id=$1 AND id=$7`,
                    [scope.workspaceId, result.usage, model.pricing_revision, actual.toString(), result.providerRequestId, result.latencyMs, callId, artifact.id]);
                });
                await dependency('budgets').settle(scope, reservation.id, actual.toString());
                await dependency('budgets').recordUsage(scope, {
                    projectId: input.projectId,
                    operationKey: input.operationKey + ':model',
                    providerRequestId: result.providerRequestId,
                    category: 'model.inference',
                    units: result.usage.totalTokens,
                    pricingRevision: model.pricing_revision,
                    estimatedMicroUsd: estimated.toString(),
                    actualMicroUsd: actual.toString(),
                });
                await withScopedTransaction(pool, scope, async tx => {
                    await tx.query("UPDATE inference.model_calls SET state='succeeded',updated_at=clock_timestamp(),version=version+1 WHERE workspace_id=$1 AND id=$2 AND state='running'", [scope.workspaceId, callId]);
                    await dependency('audit').append(tx, scope, {
                        action: 'provider.inference_completed',
                        targetRef: callId,
                        metadata: { projectId: input.projectId, modelId: model.id, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, actualMicroUsd: actual.toString() },
                    });
                });
                const call = await withScopedTransaction(pool, scope, async tx => (await tx.query('SELECT * FROM inference.model_calls WHERE workspace_id=$1 AND id=$2', [scope.workspaceId, callId])).rows[0]);
                return { call: callView(call), text: result.text, providerRequestId: result.providerRequestId };
            } catch (error) {
                if (error?.handled) throw error;
                const providerError = error instanceof ProviderError ? error : null;
                const knownNoCharge = ['PROVIDER_AUTH_FAILED', 'PROVIDER_CIRCUIT_OPEN'].includes(providerError?.code);
                try { await withScopedTransaction(pool, scope, async tx => {
                    await tx.query(`UPDATE inference.model_calls SET state=$2,safe_error=$3,updated_at=clock_timestamp(),version=version+1
                        WHERE workspace_id=$1 AND id=$4 AND state='running'`,
                    [scope.workspaceId, knownNoCharge ? 'failed' : 'unknown',
                        { code: providerError?.code ?? 'PROVIDER_UNAVAILABLE', detail: providerError?.message ?? 'Provider request failed.' }, callId]);
                });
                if (!knownNoCharge) await dependency('budgets').markUnknown(scope, reservation.id);
                else await dependency('budgets').release(scope, reservation.id, providerError.code);
                } catch { throw apiError('PROVIDER_RECONCILIATION_REQUIRED', 'Provider attempt accounting could not be completed; review the existing operation before any retry.', 503); }
                throw safeProviderError(error);
            }
        },
    };
}
