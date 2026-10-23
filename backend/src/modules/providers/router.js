// @ts-check
import { estimateMicroUsd, knownPricing } from './catalog.js';

const REQUIRED_CAPABILITY = /^[a-z][a-z0-9_.:-]{2,127}$/;

function rejection(row, reason, detail = undefined) {
    return { modelId: row.id, reasons: [reason, ...(detail ? [detail] : [])] };
}

function numeric(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

/**
 * Deterministic hard-filter router. It never invokes a model.
 * @param {{
 *   models: Array<any>,
 *   input: { capabilities: string[], estimatedInputTokens: number, maxOutputTokens: number, classification: string, budgetCeilingMicroUsd: string },
 *   policyRevisionId: string,
 *   policyPrivacy?: {denyEgress: boolean, allowedEgressHosts: string[]}
 * }} options
 */
export function buildRoutingDecision({ models, input, policyRevisionId, policyPrivacy = undefined }) {
    const ceiling = BigInt(input.budgetCeilingMicroUsd);
    const rejected = [];
    const candidates = [];
    for (const row of models) {
        const privacy = row.privacy_policy ?? {};
        if (row.provider_enabled !== true || row.provider_status !== 'healthy') {
            rejected.push(rejection(row, row.provider_enabled !== true || row.provider_status === 'disabled' ? 'PROVIDER_DISABLED' : 'PROVIDER_UNHEALTHY'));
            continue;
        }
        if (row.availability !== 'available') {
            rejected.push(rejection(row, 'MODEL_UNAVAILABLE'));
            continue;
        }
        if (!knownPricing(row.pricing)) {
            rejected.push(rejection(row, 'PRICING_UNKNOWN'));
            continue;
        }
        if (!Array.isArray(privacy.allowedClassifications) || !privacy.allowedClassifications.includes(input.classification)) {
            rejected.push(rejection(row, 'PRIVACY_DENIED'));
            continue;
        }
        if (policyPrivacy) {
            let host;
            try { host = new URL(row.endpoint_policy?.baseUrl).hostname; } catch { host = null; }
            if (policyPrivacy.denyEgress || !host || !policyPrivacy.allowedEgressHosts.includes(host)) {
                rejected.push(rejection(row, 'POLICY_EGRESS_DENIED'));
                continue;
            }
        }
        const missing = input.capabilities.find(capability => REQUIRED_CAPABILITY.test(capability) && row.capabilities?.[capability] !== true);
        if (missing) {
            rejected.push(rejection(row, 'CAPABILITY_MISSING', missing));
            continue;
        }
        if (input.estimatedInputTokens + input.maxOutputTokens > row.context_limit || input.maxOutputTokens > row.max_output_tokens
            || input.estimatedInputTokens > (row.max_input_tokens ?? row.context_limit)) {
            rejected.push(rejection(row, 'CONTEXT_EXCEEDED'));
            continue;
        }
        const estimated = estimateMicroUsd({ pricing: row.pricing, inputTokens: input.estimatedInputTokens, outputTokens: input.maxOutputTokens });
        if (estimated > ceiling) {
            rejected.push(rejection(row, 'BUDGET_EXCEEDED'));
            continue;
        }
        const quality = numeric(row.capabilities?.quality, 0.5);
        const latency = numeric(row.capabilities?.latency, 0.5);
        const costScore = ceiling === 0n ? 0 : Number(((ceiling - estimated) * 1000000n) / ceiling) / 1000000;
        const score = Math.round((quality * 0.6 + costScore * 0.25 + latency * 0.15) * 1000000) / 1000000;
        candidates.push({ row, estimated, score });
    }
    candidates.sort((left, right) => right.score - left.score || (left.estimated < right.estimated ? -1 : left.estimated > right.estimated ? 1 : 0) || left.row.id.localeCompare(right.row.id));
    const selected = candidates[0] ?? null;
    return {
        eligible: candidates.map(candidate => ({
            modelId: candidate.row.id,
            score: candidate.score,
            reasons: ['ELIGIBLE'],
            estimatedCeilingMicroUsd: candidate.estimated.toString(),
        })),
        rejected,
        ...(selected ? { selectedModelId: selected.row.id } : {}),
        estimatedCeilingMicroUsd: (selected?.estimated ?? 0n).toString(),
        policyRevisionId,
    };
}
