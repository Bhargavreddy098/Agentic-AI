import { BudgetAllocationPlanSchema } from '../schemas/budget-allocation.schema.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, createScopedStore } from './_shared.js';

export function createBudgetAllocationModel(options = {}) {
    const store = createScopedStore(options.store);
    const budgetAccounts = createScopedStore(options.budgetAccounts);

    return {
        async readBudget(budgetRef, context) {
            const ctx = validateContext(context);
            return budgetAccounts.get(ctx.tenantId, budgetRef) ?? {
                budgetRef,
                tenantId: ctx.tenantId,
                quotaTokens: 1000000,
                quotaMicroUsd: 50000000,
                reservedTokens: 0,
                reservedMicroUsd: 0,
                version: 1,
            };
        },
        async proposeAllocation(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const sumTokens = (input?.allocations ?? []).reduce((acc, item) => acc + Number(item?.reservedTokens ?? 0), 0);
            const sumMicroUsd = (input?.allocations ?? []).reduce((acc, item) => acc + Number(item?.reservedCostMicroUsd ?? 0), 0);
            if (!Number.isSafeInteger(sumTokens) || !Number.isSafeInteger(sumMicroUsd)) {
                throw new ModelDomainError('INVALID_INPUT', 'Integer overflow in budget allocation.', 400);
            }
            const parsed = parseSchema(BudgetAllocationPlanSchema, {
                ...input,
                tenantId: ctx.tenantId,
                totalReserved: input?.totalReserved ?? { tokens: sumTokens, costMicroUsd: sumMicroUsd },
            }, 'Invalid budget allocation plan');

            if (parsed.totalReserved.tokens !== sumTokens || parsed.totalReserved.costMicroUsd !== sumMicroUsd) {
                throw new ModelDomainError('INVALID_INPUT', 'totalReserved must equal exact integer sum of work allocations.', 400);
            }
            if (sumTokens > parsed.parentQuotaTokens || sumMicroUsd > parsed.parentQuotaMicroUsd) {
                throw new ModelDomainError('QUOTA_EXCEEDED', 'Budget allocation plan cannot exceed approved parent/tenant quotas.', 409);
            }

            const existing = store.get(ctx.tenantId, parsed.allocationId);
            if (existing) {
                if (existing.budgetRef === parsed.budgetRef && existing.version === parsed.version) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Budget allocation ID conflict.', 409);
            }
            return {
                status: 'created',
                record: store.set(ctx.tenantId, parsed.allocationId, { ...parsed, advisoryOnly: true }),
            };
        },
        async getAllocation(allocationId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, allocationId);
        },
    };
}
