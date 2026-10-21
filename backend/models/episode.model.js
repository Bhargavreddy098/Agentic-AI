import { EpisodeAppendInputSchema, EpisodeSearchQuerySchema, EpisodeCompressionLineageSchema } from '../schemas/episode.schema.js';
import { ModelDomainError, validateContext, parseSchema, paginateItems, createScopedStore } from './_shared.js';

export function createEpisodeModel(options = {}) {
    const episodeStore = createScopedStore(options.episodeStore);
    const lineageStore = createScopedStore(options.lineageStore);

    return {
        async appendEpisode(input, context) {
            const ctx = validateContext(context);
            const parsed = parseSchema(EpisodeAppendInputSchema, input, 'Invalid episode append input');
            const existing = episodeStore.get(ctx.tenantId, parsed.episodeId);
            if (existing) {
                if (existing.payloadDigest === parsed.payloadDigest && existing.sessionId === parsed.sessionId) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Episode ID already exists with altered payloadDigest.', 409);
            }
            const sessionEpisodes = episodeStore.list(ctx.tenantId, e => e.sessionId === parsed.sessionId);
            const seqConflict = sessionEpisodes.find(e => e.sequence === parsed.sequence);
            if (seqConflict) {
                throw new ModelDomainError('CONFLICT', `Sequence ${parsed.sequence} already exists in session '${parsed.sessionId}'.`, 409);
            }
            const stored = episodeStore.set(ctx.tenantId, parsed.episodeId, { ...parsed, tenantId: ctx.tenantId });
            return { status: 'created', record: stored };
        },
        async searchEpisodes(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(EpisodeSearchQuerySchema, query, 'Invalid episode search query');
            const needle = q.query.trim().toLowerCase();
            const matches = episodeStore
                .list(ctx.tenantId, e => {
                    if (q.sessionId && e.sessionId !== q.sessionId) return false;
                    if (q.conversationId && e.conversationId !== q.conversationId) return false;
                    if (needle && !e.content.toLowerCase().includes(needle)) return false;
                    return true;
                })
                .sort((a, b) => a.sequence - b.sequence);
            return paginateItems(matches, q, 'episodeId');
        },
        async replaySession(sessionId, context) {
            const ctx = validateContext(context);
            const items = episodeStore
                .list(ctx.tenantId, e => e.sessionId === sessionId)
                .sort((a, b) => a.sequence - b.sequence);
            const gaps = [];
            for (let i = 1; i < items.length; i++) {
                if (items[i].sequence !== items[i - 1].sequence + 1) {
                    gaps.push({ afterSequence: items[i - 1].sequence, beforeSequence: items[i].sequence });
                }
            }
            return { sessionId, episodes: items, sequenceGaps: gaps };
        },
        async appendCompressionLineage(input, context) {
            const ctx = validateContext(context);
            const parsed = parseSchema(EpisodeCompressionLineageSchema, input, 'Invalid episode compression lineage');
            for (const epId of parsed.sourceEpisodeIds) {
                if (!episodeStore.get(ctx.tenantId, epId)) {
                    throw new ModelDomainError('NOT_FOUND', `Source episode '${epId}' not found in tenant.`, 404);
                }
            }
            return { status: 'created', record: lineageStore.set(ctx.tenantId, parsed.lineageId, { ...parsed, tenantId: ctx.tenantId }) };
        },
        async getCompressionLineage(lineageId, context) {
            const ctx = validateContext(context);
            return lineageStore.get(ctx.tenantId, lineageId);
        },
    };
}
