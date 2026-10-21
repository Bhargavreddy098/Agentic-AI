import { AgentReleaseReportSchema } from '../schemas/agent-release.schema.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, createScopedStore } from './_shared.js';

export function createAgentReleaseModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async appendReleaseEvaluation(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            if (input?.deployed === true || input?.promoted === true) {
                throw new ModelDomainError('POLICY_DENIED', 'Agent release evaluation is evidence only and never deploys or promotes.', 403);
            }
            const parsed = parseSchema(AgentReleaseReportSchema, { ...input, tenantId: ctx.tenantId, deployed: false }, 'Invalid agent release report');
            const existing = store.get(ctx.tenantId, parsed.releaseId);
            if (existing) {
                if (existing.candidateManifestRef === parsed.candidateManifestRef && existing.protectedBaselineDigest === parsed.protectedBaselineDigest) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Agent release report ID conflict.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.releaseId, parsed) };
        },
        async getReleaseEvaluation(releaseId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, releaseId);
        },
    };
}
