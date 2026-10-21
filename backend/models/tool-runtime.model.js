import { ToolManifestRegistrationSchema, ToolExecutionRequestSchema } from '../schemas/tool-runtime.schema.js';
import { ModelDomainError, validateContext, parseSchema, createScopedStore } from './_shared.js';

export function createToolRuntimeModel(options = {}) {
    const manifestStore = createScopedStore(options.manifestStore);
    const executionStore = createScopedStore(options.executionStore);

    return {
        async registerToolManifest(input, context) {
            const ctx = validateContext(context);
            const parsed = parseSchema(ToolManifestRegistrationSchema, input, 'Invalid tool manifest');
            if (!parsed.signatureVerified) {
                throw new ModelDomainError('POLICY_DENIED', 'Unsigned tool manifest cannot be registered.', 403);
            }
            const key = `${parsed.toolId}@${parsed.version}`;
            const existing = manifestStore.get(ctx.tenantId, key);
            if (existing) {
                if (existing.manifestDigest === parsed.manifestDigest) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Tool manifest digest conflict.', 409);
            }
            return { status: 'created', record: manifestStore.set(ctx.tenantId, key, { ...parsed, tenantId: ctx.tenantId }) };
        },
        async listToolManifests(context) {
            const ctx = validateContext(context);
            return manifestStore.list(ctx.tenantId);
        },
        async executeGovernedTool(input, context) {
            const ctx = validateContext(context);
            if (input?.arguments?.DATABASE_URL || input?.arguments?.signingKey || input?.arguments?.providerApiKey) {
                throw new ModelDomainError('POLICY_DENIED', 'Host database, signing, or provider credentials must never enter tool task payloads.', 403);
            }
            const parsed = parseSchema(ToolExecutionRequestSchema, input, 'Invalid tool execution request');
            const nowMs = ctx.now ? Date.parse(ctx.now) : Date.now();
            if (Date.parse(parsed.expiresAt) <= nowMs) {
                throw new ModelDomainError('POLICY_DENIED', 'Tool execution grant has expired.', 403);
            }
            const existing = executionStore.get(ctx.tenantId, parsed.executionId);
            if (existing) {
                if (existing.inputDigest === parsed.inputDigest) {
                    return existing;
                }
                throw new ModelDomainError('CONFLICT', 'Execution ID reused with different inputDigest.', 409);
            }
            if (!parsed.sandboxQualified) {
                const unavailableRecord = {
                    executionId: parsed.executionId,
                    toolId: parsed.toolId,
                    version: parsed.version,
                    inputDigest: parsed.inputDigest,
                    status: 'unavailable',
                    reason: 'Windows VM isolation backend is not yet qualified; executable handler remains disabled.',
                };
                return executionStore.set(ctx.tenantId, parsed.executionId, unavailableRecord);
            }
            const completedRecord = {
                executionId: parsed.executionId,
                toolId: parsed.toolId,
                version: parsed.version,
                inputDigest: parsed.inputDigest,
                status: 'completed',
                outputDigest: parsed.inputDigest,
            };
            return executionStore.set(ctx.tenantId, parsed.executionId, completedRecord);
        },
        async getExecutionStatus(executionId, context) {
            const ctx = validateContext(context);
            return executionStore.get(ctx.tenantId, executionId);
        },
    };
}
