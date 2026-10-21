import {
    createConsolidationCandidateModel,
    createObservationModel,
    createMemoryLifecycleModel,
    createMemoryBranchModel,
    searchVectors,
} from '../models/index.js';

export const MEMORY_OWNED_FAMILIES = [
    'consolidation-candidate',
    'observation',
    'memory-lifecycle',
    'memory-branch',
];

export function createMemoryService(owners = {}) {
    const models = {
        'consolidation-candidate': owners.consolidationCandidate ?? createConsolidationCandidateModel(owners),
        'observation': owners.observation ?? createObservationModel(owners),
        'memory-lifecycle': owners.memoryLifecycle ?? createMemoryLifecycleModel(owners),
        'memory-branch': owners.memoryBranch ?? createMemoryBranchModel(owners),
    };

    return {
        models,
        ownedFamilies: MEMORY_OWNED_FAMILIES,
        getModel(family) {
            return models[family] ?? null;
        },
        async searchVectors(input, context) {
            if (owners.vectorClient) {
                return searchVectors(owners.vectorClient, {
                    ...input,
                    tenantId: context.tenantId,
                    agentId: context.agentId ?? null,
                    roleIds: context.roleIds ?? [],
                    requestedScopes: context.requestedScopes ?? ['Global'],
                });
            }
            if (!Array.isArray(input?.embedding) || input.embedding.length !== 1536 || !input.embedding.every(Number.isFinite)) {
                throw new Error('Embedding must contain 1536 finite numbers.');
            }
            return [];
        },
    };
}
