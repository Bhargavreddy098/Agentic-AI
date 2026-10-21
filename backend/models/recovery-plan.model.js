import { RecoveryInputSchema, RecoveryPlanSchema } from '../schemas/recovery-plan.schema.js';
import { ModelDomainError, validateContext, parseSchema } from './_shared.js';

export function createRecoveryPlanModel() {
    return {
        async deriveRecoveryPlan(input, context) {
            validateContext(context);
            if (input?.relaxPrivacy === true || input?.forbiddenProviderFallback === true) {
                throw new ModelDomainError('POLICY_DENIED', 'Recovery plan cannot relax privacy or use forbidden provider fallback.', 403);
            }
            const parsed = parseSchema(RecoveryInputSchema, input, 'Invalid recovery input');
            const remaining = Math.max(0, parsed.maxAllowedAttempts - parsed.attemptsAlreadyUsed);

            if (parsed.normalizedError === 'UNKNOWN_EXTERNAL_OUTCOME') {
                return parseSchema(RecoveryPlanSchema, {
                    decision: 'reconcile',
                    reasonCode: 'UNKNOWN_EXTERNAL_EFFECT_REQUIRES_RECONCILIATION',
                    approvedAlternativeRefs: parsed.approvedAlternativeRefs,
                    maxRemainingAttempts: remaining,
                });
            }

            if (parsed.normalizedError === 'POLICY_DENIED' || parsed.normalizedError === 'QUOTA_EXCEEDED') {
                return parseSchema(RecoveryPlanSchema, {
                    decision: 'stop',
                    reasonCode: `TERMINAL_${parsed.normalizedError}`,
                    approvedAlternativeRefs: [],
                    maxRemainingAttempts: 0,
                });
            }

            if (remaining === 0) {
                return parseSchema(RecoveryPlanSchema, {
                    decision: parsed.approvedAlternativeRefs.length > 0 ? 'replan' : 'stop',
                    reasonCode: 'RETRY_BUDGET_EXHAUSTED',
                    approvedAlternativeRefs: parsed.approvedAlternativeRefs,
                    nextPlanRevision: parsed.approvedAlternativeRefs.length > 0 ? 2 : undefined,
                    maxRemainingAttempts: 0,
                });
            }

            return parseSchema(RecoveryPlanSchema, {
                decision: 'retry',
                reasonCode: 'BOUNDED_TRANSIENT_RETRY',
                approvedAlternativeRefs: parsed.approvedAlternativeRefs,
                maxRemainingAttempts: remaining - 1,
            });
        },
    };
}
