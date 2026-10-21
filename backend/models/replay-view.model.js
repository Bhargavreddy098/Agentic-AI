import { ReplayQuerySchema, ReplayViewSchema, ReplayEntrySchema } from '../schemas/replay-view.schema.js';
import { ModelDomainError, validateContext, parseSchema, createScopedStore } from './_shared.js';

export function createReplayViewModel(options = {}) {
    const runEntriesStore = createScopedStore(options.store);

    return {
        async recordRunEntries(runId, entries, context) {
            const ctx = validateContext(context);
            const validated = entries.map(e => parseSchema(ReplayEntrySchema, e, 'Invalid replay entry'));
            return runEntriesStore.set(ctx.tenantId, runId, validated);
        },
        async readReplay(query, context) {
            const ctx = validateContext(context);
            if (query?.mode && query.mode !== 'read_only') {
                throw new ModelDomainError('POLICY_DENIED', 'ReplayView only supports mode=read_only and never re-executes external effects.', 403);
            }
            const q = parseSchema(ReplayQuerySchema, query, 'Invalid replay query');
            if (q.toSequence < q.fromSequence) {
                throw new ModelDomainError('INVALID_INPUT', 'toSequence must be >= fromSequence.', 400);
            }
            const allEntries = runEntriesStore.get(ctx.tenantId, q.runId) ?? [];
            const filtered = allEntries
                .filter(e => e.sequence >= q.fromSequence && e.sequence <= q.toSequence)
                .sort((a, b) => a.sequence - b.sequence)
                .slice(0, q.limit);

            const unknownOutcomeRefs = filtered.filter(e => e.outcome === 'unknown').map(e => e.refId);
            return parseSchema(ReplayViewSchema, {
                runId: q.runId,
                fromSequence: q.fromSequence,
                toSequence: q.toSequence,
                limit: q.limit,
                mode: 'read_only',
                entries: filtered,
                unknownOutcomeRefs,
            });
        },
    };
}
