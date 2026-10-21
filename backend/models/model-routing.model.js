import { ModelRoutingRequestSchema, ModelRoutingDecisionSchema } from '../schemas/model-routing.schema.js';
import { validateContext, parseSchema } from './_shared.js';

const PRIVACY_RANK = { standard: 1, zero_retention: 2, local_only: 3 };

export function createModelRoutingModel() {
    return {
        async selectApprovedModel(request, context) {
            validateContext(context);
            const req = parseSchema(ModelRoutingRequestSchema, request, 'Invalid model routing request');
            const minRank = PRIVACY_RANK[req.requiredPrivacyTier];

            const privacyEligible = req.qualifiedCandidateModelRefs.filter(
                m => m.policyApproved && PRIVACY_RANK[m.privacyTier] >= minRank
            );

            if (privacyEligible.length === 0) {
                return parseSchema(ModelRoutingDecisionSchema, {
                    selectedModelRef: null,
                    privacyEligibility: 'rejected_by_privacy',
                    scoreBasis: null,
                    policyDecisionRef: req.policyDecisionRef,
                    budgetReservationRef: req.budgetReservationRef,
                    reason: 'No candidate model satisfied privacy tier and policy approval; forbidden fallback denied.',
                });
            }

            const scored = privacyEligible.map(m => ({
                modelRef: m.modelRef,
                score: Number((m.qualityScore * 100 - m.costMicroUsdPer1k * 0.001 - m.latencyMsP95 * 0.0005).toFixed(6)),
            }));
            scored.sort((a, b) => b.score - a.score || a.modelRef.localeCompare(b.modelRef));
            const best = scored[0];

            return parseSchema(ModelRoutingDecisionSchema, {
                selectedModelRef: best.modelRef,
                privacyEligibility: 'eligible',
                scoreBasis: best.score,
                policyDecisionRef: req.policyDecisionRef,
                budgetReservationRef: req.budgetReservationRef,
                reason: `Selected highest-scoring privacy-eligible model (${req.scoringPolicyVersion}).`,
            });
        },
    };
}
