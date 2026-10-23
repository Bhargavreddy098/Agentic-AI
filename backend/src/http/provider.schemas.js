// @ts-check
import { z } from 'zod/v4';

const id = z.string().uuid();
const amount = z.string().regex(/^(0|[1-9]\d{0,18})$/);
const version = z.string().regex(/^[1-9]\d*$/);
const timestamp = z.string().datetime();
const capability = z.string().regex(/^[a-z][a-z0-9_.:-]{2,127}$/);
const privacyPolicy = z.object({ allowedClassifications: z.array(z.enum(['public', 'internal'])).min(1).max(2),
    providerTraining: z.literal(false), retention: z.literal('none'), dataResidency: z.string().trim().min(1).max(64).optional() }).strict();
const endpointPolicy = z.object({ baseUrl: z.string().trim().url().max(512).startsWith('https://') }).strict();

export const providerInputSchemas = {
    CreateProvider: z.object({ kind: z.enum(['openai', 'openai_compatible']), displayName: z.string().trim().min(1).max(200), endpointPolicy,
        secretReferenceId: id.optional(), privacyPolicy }).strict(),
    PatchProvider: z.object({ displayName: z.string().trim().min(1).max(200).optional(), secretReferenceId: id.optional(), privacyPolicy: privacyPolicy.optional(),
        enabled: z.boolean().optional() }).strict().refine(value => Object.keys(value).length > 0),
    Discovery: z.object({ probe: z.boolean(), budgetCeilingMicroUsd: amount.optional() }).strict(),
    RoutingPreview: z.object({ taskType: z.string().trim().min(1).max(64), capabilities: z.array(capability).max(32),
        estimatedInputTokens: z.number().int().min(1).max(10000000), maxOutputTokens: z.number().int().min(1).max(1000000),
        classification: z.enum(['public', 'internal']), budgetCeilingMicroUsd: amount }).strict(),
};

const meta = z.object({ requestId: z.string(), version: version.optional(), nextCursor: z.string().nullable().optional() }).strict();
const provider = z.object({ id, kind: z.enum(['openai', 'openai_compatible']), displayName: z.string().min(1).max(200),
    status: z.enum(['unavailable', 'healthy', 'degraded', 'disabled']), endpointSummary: z.string().url(), authMethod: z.literal('api_key'),
    credentialConfigured: z.boolean(), privacyPolicy, enabled: z.boolean(), version, createdAt: timestamp, updatedAt: timestamp,
    lastCheckedAt: timestamp.optional(), health: z.object({ state: z.enum(['unconfigured', 'configured', 'healthy', 'degraded']),
        checkedAt: timestamp.nullable(), modelCount: z.number().int().min(0).optional(), qualifiedModelCount: z.number().int().min(0).optional() }).strict() }).strict();
const model = z.object({ id, providerId: id, externalModelId: z.string(), revision: z.string(),
    capabilities: z.record(z.string(), z.union([z.boolean(), z.number()])), contextLimit: z.number().int().positive(),
    maxOutputTokens: z.number().int().positive(), pricingRevision: z.string(), availability: z.enum(['available', 'unavailable', 'unknown']),
    qualificationRef: z.string().optional(), discoveredAt: timestamp }).strict();
const operation = z.object({ id, kind: z.literal('provider.discovery'), state: z.enum(['queued', 'running', 'blocked', 'succeeded', 'failed', 'cancelled']),
    resourceType: z.enum(['provider', 'model']).optional(), resourceId: id.optional(),
    safeError: z.object({ code: z.string(), detail: z.string() }).strict().optional(), createdAt: timestamp, updatedAt: timestamp }).strict();
const routing = z.object({ eligible: z.array(z.object({ modelId: id, score: z.number(), reasons: z.array(z.string()), estimatedCeilingMicroUsd: amount }).strict()),
    rejected: z.array(z.object({ modelId: id, reasons: z.array(z.string()) }).strict()), selectedModelId: id.optional(),
    estimatedCeilingMicroUsd: amount, policyRevisionId: id }).strict();
export const providerOutputSchemas = {
    Provider: provider, Model: model, Operation: operation, RoutingDecision: routing,
    ProviderResponse: z.object({ data: provider, meta }).strict(),
    ProviderListResponse: z.object({ data: z.array(provider).max(100), meta }).strict(),
    ModelListResponse: z.object({ data: z.array(model).max(100), meta }).strict(),
    OperationResponse: z.object({ data: operation, meta }).strict(),
    RoutingResponse: z.object({ data: routing, meta }).strict(),
    Problem: z.object({ type: z.string().url(), title: z.string(), status: z.number().int().min(400).max(599), code: z.string(), detail: z.string(),
        requestId: z.string(), retryable: z.boolean() }).strict(),
};
