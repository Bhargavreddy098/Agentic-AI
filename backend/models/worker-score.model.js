import { WorkerScoreSchema, RankedWorkerSchema } from '../schemas/worker-score.schema.js';
import { validateContext, parseSchema, createScopedStore } from './_shared.js';

export function createWorkerScoreModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async recordWorkerScore(input, context) {
            const ctx = validateContext(context);
            const parsed = parseSchema(WorkerScoreSchema, input, 'Invalid worker score');
            return store.set(ctx.tenantId, parsed.workerId, parsed);
        },
        async getWorkerScore(workerId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, workerId);
        },
        async rankEligibleWorkers(candidates, context) {
            const ctx = validateContext(context);
            const nowMs = ctx.now ? Date.parse(ctx.now) : Date.now();
            const parsedList = (Array.isArray(candidates) ? candidates : store.list(ctx.tenantId)).map(c =>
                parseSchema(WorkerScoreSchema, c, 'Invalid worker candidate')
            );

            const evaluated = parsedList.map(w => {
                let ineligibleReason = null;
                if (!w.healthy) ineligibleReason = 'unhealthy';
                else if (!w.hasCurrentGrant) ineligibleReason = 'missing_grant';
                else if (!w.hasCapacity) ineligibleReason = 'no_capacity';
                else if (!w.policyAllowed) ineligibleReason = 'policy_denied';
                else if (w.violationCount > 0) ineligibleReason = 'governance_violation';
                else if (Date.parse(w.validUntil) <= nowMs) ineligibleReason = 'stale_telemetry';

                const eligible = ineligibleReason === null;
                const scoreBasis = eligible
                    ? Number((w.qualityScore * 100 - w.latencyMsP95 * 0.001 - w.costMicroUsdAvg * 0.0001).toFixed(6))
                    : -1;
                return {
                    workerId: w.workerId,
                    eligibility: eligible ? 'eligible' : 'ineligible',
                    ineligibleReason,
                    scoreBasis,
                };
            });

            evaluated.sort((a, b) => {
                if (a.eligibility !== b.eligibility) return a.eligibility === 'eligible' ? -1 : 1;
                if (b.scoreBasis !== a.scoreBasis) return b.scoreBasis - a.scoreBasis;
                return a.workerId.localeCompare(b.workerId);
            });

            return evaluated.map((item, idx) =>
                parseSchema(RankedWorkerSchema, {
                    ...item,
                    deterministicRank: idx + 1,
                })
            );
        },
    };
}
