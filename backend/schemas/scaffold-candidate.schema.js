import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema } from './_shared.js';

const SafePathSchema = z.string().min(1).max(256).refine(
    val => !val.includes('..') && !/^(?:AGENTS\.md|docs\/architecture-baseline\.json|packages\/contracts|packages\/policy|packages\/identity|packages\/audit|backend\/modules\/policy|backend\/modules\/identity|backend\/modules\/audit|scripts\/verify-|evals\/held-out)/.test(val.replace(/^\/+/, '')),
    'Assigned path targets a protected or escaping path'
);

export const ScaffoldCandidateRecordSchema = z.object({
    candidateId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    baseVersionRef: OpaqueIdSchema,
    candidateDigest: DigestSchema,
    assignedPathRefs: z.array(SafePathSchema).min(1).max(64),
    evalReportRefs: z.array(OpaqueIdSchema).min(1).max(32),
    reviewState: z.enum(['staged', 'review_required', 'approved', 'rejected']).default('staged'),
});
