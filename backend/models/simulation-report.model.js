import { SimulationReportSchema } from '../schemas/simulation-report.schema.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, createScopedStore } from './_shared.js';

export function createSimulationReportModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async appendSimulation(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            if (input?.noLiveEffects === false || input?.modifiedHeldOutCases === true || input?.usedRealAccount === true) {
                throw new ModelDomainError('POLICY_DENIED', 'Simulation requires noLiveEffects=true and cannot write held-out cases or use real accounts.', 403);
            }
            const parsed = parseSchema(SimulationReportSchema, { ...input, tenantId: ctx.tenantId, noLiveEffects: true }, 'Invalid simulation report');
            const existing = store.get(ctx.tenantId, parsed.simulationId);
            if (existing) {
                if (existing.environmentDigest === parsed.environmentDigest && existing.candidateVersionRef === parsed.candidateVersionRef) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Simulation report ID conflict.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.simulationId, parsed) };
        },
        async getSimulation(simulationId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, simulationId);
        },
    };
}
