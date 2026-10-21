import { z } from 'zod';
import { OpaqueIdSchema, IsoTimestampSchema } from './_shared.js';

export const SecuritySignalBatchSchema = z.object({
    tenantId: OpaqueIdSchema.optional(),
    signalRefs: z.array(OpaqueIdSchema).min(1).max(100),
    windowStart: IsoTimestampSchema,
    windowEnd: IsoTimestampSchema,
    detectorVersion: z.string().min(1).max(64),
});

export const SecurityAlertSchema = z.object({
    alertId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    observedAt: IsoTimestampSchema,
    detectorVersion: z.string().min(1).max(64),
    signedReceiptRef: OpaqueIdSchema,
    evidenceRefs: z.array(OpaqueIdSchema).min(1).max(100),
    safeRecommendation: z.string().min(1).max(1024),
});
