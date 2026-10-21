import { SkillCatalogEntrySchema, SkillInstallProposalSchema, SkillCatalogQuerySchema } from '../schemas/skill.schema.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

export function createSkillModel(options = {}) {
    const catalogStore = createScopedStore(options.catalogStore);
    const proposalStore = createScopedStore(options.proposalStore);

    return {
        async registerCatalogSkill(entry, context) {
            const ctx = validateContext(context);
            const parsed = parseSchema(SkillCatalogEntrySchema, entry, 'Invalid skill catalog entry');
            if (!parsed.signatureVerified) {
                throw new ModelDomainError('POLICY_DENIED', 'Unsigned skill manifest cannot be registered.', 403);
            }
            return catalogStore.set(ctx.tenantId, parsed.skillId, { ...parsed, tenantId: ctx.tenantId });
        },
        async listSkills(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(SkillCatalogQuerySchema, query, 'Invalid skill catalog query');
            const all = catalogStore.list(ctx.tenantId, item => item.revocationState !== 'revoked');
            return paginateItems(all, q, 'skillId');
        },
        async getSkill(skillId, context) {
            const ctx = validateContext(context);
            return catalogStore.get(ctx.tenantId, skillId);
        },
        async proposeInstall(input, context) {
            const ctx = validateContext(context);
            assertSameTenant(input?.tenantId, ctx);
            const proposal = parseSchema(SkillInstallProposalSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid skill install proposal');
            if (proposal.revocationState === 'revoked') {
                throw new ModelDomainError('POLICY_DENIED', 'Revoked skill cannot be proposed for install.', 403);
            }
            const catalogEntry = catalogStore.get(ctx.tenantId, proposal.skillId);
            if (catalogEntry) {
                if (catalogEntry.revocationState === 'revoked' || !catalogEntry.signatureVerified) {
                    throw new ModelDomainError('POLICY_DENIED', 'Skill is revoked or unsigned in catalog.', 403);
                }
                if (catalogEntry.catalogRevision !== proposal.expectedCatalogRevision) {
                    throw new ModelDomainError('STALE_REVISION', 'Expected catalog revision does not match current catalog revision.', 409);
                }
                if (catalogEntry.manifestDigest !== proposal.manifestDigest) {
                    throw new ModelDomainError('CONFLICT', 'Proposal manifestDigest does not match catalog entry.', 409);
                }
            }
            const existing = proposalStore.get(ctx.tenantId, proposal.proposalId);
            if (existing) {
                if (existing.manifestDigest !== proposal.manifestDigest || existing.skillId !== proposal.skillId) {
                    throw new ModelDomainError('CONFLICT', 'Conflicting skill install proposal with same proposalId.', 409);
                }
                return { status: 'same_existing', record: existing };
            }
            const stored = proposalStore.set(ctx.tenantId, proposal.proposalId, {
                ...proposal,
                installed: false,
                executed: false,
            });
            return { status: 'created', record: stored };
        },
        async getInstallProposal(proposalId, context) {
            const ctx = validateContext(context);
            return proposalStore.get(ctx.tenantId, proposalId);
        },
    };
}
