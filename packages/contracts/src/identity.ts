import { z } from "zod/v4";
import { FutureUtcTimestampSchema, OpaqueIdSchema } from "./primitives.js";

export const PrincipalSchema = z.strictObject({
  tenantId: OpaqueIdSchema,
  subjectId: OpaqueIdSchema,
  agentId: OpaqueIdSchema.optional(),
  roles: z.array(OpaqueIdSchema).min(1).max(64),
  capabilities: z.array(OpaqueIdSchema).min(1).max(128),
  audience: OpaqueIdSchema,
  expiresAt: FutureUtcTimestampSchema,
  authenticatedSource: OpaqueIdSchema,
});

export type Principal = z.infer<typeof PrincipalSchema>;
