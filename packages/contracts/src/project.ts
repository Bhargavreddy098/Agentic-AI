import { z } from "zod";
import { OpaqueIdSchema, Sha256HexSchema } from "./primitives.js";
import { BudgetRefSchema } from "./task.js";

export const ProjectSchemaVersionSchema = z.literal(1);

export const ProjectStatusSchema = z.enum(["active", "suspended", "completed", "cancelled"]);

export const ProjectRecordSchema = z.strictObject({
  schemaVersion: ProjectSchemaVersionSchema,
  projectId: OpaqueIdSchema,
  tenantId: OpaqueIdSchema,
  conversationId: OpaqueIdSchema,
  goalIds: z.array(OpaqueIdSchema).max(256).default([]),
  version: z.number().int().min(1).default(1),
  budgetRef: BudgetRefSchema,
  status: ProjectStatusSchema,
  artifactRefs: z.array(z.strictObject({
    artifactId: OpaqueIdSchema,
    contentHash: Sha256HexSchema,
  })).max(1024).default([]),
  blockerRefs: z.array(OpaqueIdSchema).max(256).default([]),
});

export type ProjectRecord = z.infer<typeof ProjectRecordSchema>;

export const ProjectArtifactRefSchema = z.strictObject({
  artifactId: OpaqueIdSchema,
  contentHash: Sha256HexSchema,
});

export type ProjectArtifactRef = z.infer<typeof ProjectArtifactRefSchema>;

export const ProjectBlockerRefSchema = z.strictObject({
  blockerId: OpaqueIdSchema,
  description: z.string().min(1).max(2048),
  blockedGoalIds: z.array(OpaqueIdSchema).max(256).default([]),
  blockedSince: z.iso.datetime({ offset: false }),
});

export type ProjectBlockerRef = z.infer<typeof ProjectBlockerRefSchema>;