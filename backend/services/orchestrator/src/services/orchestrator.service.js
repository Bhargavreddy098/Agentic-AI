import {
    createSkillSelectionModel,
    createRecoveryPlanModel,
    createContextBundleModel,
    createTrustLabelModel,
} from '../models/index.js';

export const ORCHESTRATOR_OWNED_FAMILIES = [
    'skill-selection',
    'recovery-plan',
    'context-bundle',
    'trust-label',
];

export function createOrchestratorService(owners = {}) {
    const models = {
        'skill-selection': owners.skillSelection ?? createSkillSelectionModel(),
        'recovery-plan': owners.recoveryPlan ?? createRecoveryPlanModel(),
        'context-bundle': owners.contextBundle ?? createContextBundleModel(),
        'trust-label': owners.trustLabel ?? createTrustLabelModel(),
    };

    return {
        ownedFamilies: ORCHESTRATOR_OWNED_FAMILIES,
        models,
        clients: owners.clients ?? {},
        getModel(family) {
            return models[family] ?? null;
        },
        selectSkills: (req, ctx) => models['skill-selection'].selectQualifiedSkills(req, ctx),
        deriveRecovery: (req, ctx) => models['recovery-plan'].deriveRecoveryPlan(req, ctx),
        compileContext: (req, ctx) => models['context-bundle'].compileContextBundle(req, ctx),
        labelInput: (req, ctx) => models['trust-label'].labelInput(req, ctx),
    };
}
