import { createWorkerScoreModel } from '../models/index.js';

export const SPECIALIST_OWNED_FAMILIES = ['worker-score'];

export function createSpecialistService(owners = {}) {
    const workerScoreModel = owners.workerScore ?? createWorkerScoreModel(owners);
    return {
        ownedFamilies: SPECIALIST_OWNED_FAMILIES,
        models: { 'worker-score': workerScoreModel },
        clients: owners.clients ?? {},
        getModel(family) {
            return family === 'worker-score' ? workerScoreModel : null;
        },
        recordWorkerScore: (input, ctx) => workerScoreModel.recordWorkerScore(input, ctx),
        getWorkerScore: (workerId, ctx) => workerScoreModel.getWorkerScore(workerId, ctx),
        rankEligibleWorkers: (candidates, ctx) => workerScoreModel.rankEligibleWorkers(candidates, ctx),
    };
}
