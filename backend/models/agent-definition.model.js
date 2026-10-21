import { AgentDefinitionProposalSchema } from '../schemas/agent-definition.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

export function createAgentDefinitionModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async createProposal(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            if (input?.deployed === true || input?.issuedAuthority === true) {
                throw new ModelDomainError('POLICY_DENIED', 'Agent definition proposal cannot deploy or issue authority.', 403);
            }
            const parsed = parseSchema(AgentDefinitionProposalSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid agent definition proposal');
            const existing = store.get(ctx.tenantId, parsed.proposalId);
            if (existing) {
                if (existing.candidateDigest === parsed.candidateDigest) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Agent definition proposal ID already exists with different candidateDigest.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.proposalId, parsed) };
        },
        async getProposal(proposalId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, proposalId);
        },
        async listProposals(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query, 'Invalid agent definition proposal list query');
            return paginateItems(store.list(ctx.tenantId), q, 'proposalId');
        },
    };
}
