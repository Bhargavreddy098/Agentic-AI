import { z } from "zod/v4";
import { EffectRequestSchema } from "./effect.js";
import { RunContextSchema } from "./task.js";
import {
  BoundedTextSchema,
  MemoryScopeSchema,
  OpaqueIdSchema,
  SchemaVersionSchema,
  Sha256HexSchema,
  SensitivitySchema,
  UtcTimestampSchema,
} from "./primitives.js";

export const MemoryRecordSchema = z
  .strictObject({
    schemaVersion: SchemaVersionSchema,
    memoryId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema,
    scope: MemoryScopeSchema,
    roleId: OpaqueIdSchema.optional(),
    ownerAgentId: OpaqueIdSchema.optional(),
    version: z.number().int().min(1),
    value: BoundedTextSchema,
    confidence: z.number().min(0).max(1),
    sourceEpisodeIds: z.array(OpaqueIdSchema).min(1).max(1024),
    authority: OpaqueIdSchema,
    sensitivity: SensitivitySchema,
  })
  .superRefine((record, ctx) => {
    if (
      record.scope === "Global" &&
      (record.roleId !== undefined || record.ownerAgentId !== undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["scope"],
        message:
          "Global memory is tenant-global and must not carry roleId or ownerAgentId",
      });
    }
    if (record.scope === "Role" && record.roleId === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["roleId"],
        message: "Role memory requires roleId",
      });
    }
    if (record.scope === "Role" && record.ownerAgentId !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["ownerAgentId"],
        message: "Role memory must not carry ownerAgentId",
      });
    }
    if (record.scope === "Private" && record.ownerAgentId === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["ownerAgentId"],
        message: "Private memory requires ownerAgentId",
      });
    }
    if (record.scope === "Private" && record.roleId !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["roleId"],
        message: "Private memory must not carry roleId",
      });
    }
  });

export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;

export const CompressionRecordSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  compressionId: OpaqueIdSchema,
  sessionId: OpaqueIdSchema,
  parentGeneration: z.number().int().min(0),
  sourceRange: z
    .strictObject({
      startIndex: z.number().int().min(0),
      endIndex: z.number().int().min(0),
    })
    .superRefine((range, ctx) => {
      if (range.endIndex < range.startIndex) {
        ctx.addIssue({
          code: "custom",
          message: "sourceRange endIndex must not precede startIndex",
        });
      }
    }),
  sourceDigests: z.array(Sha256HexSchema).min(1).max(1024),
  prefixHash: Sha256HexSchema,
  summaryHash: Sha256HexSchema,
  modelVersion: OpaqueIdSchema,
  policyVersion: OpaqueIdSchema,
});

export type CompressionRecord = z.infer<typeof CompressionRecordSchema>;

export const MemoryQuerySchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  query: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("text"), text: BoundedTextSchema }),
    z.strictObject({
      type: z.literal("embedding"),
      embeddingRef: OpaqueIdSchema,
      dimension: z.number().int().min(1).max(32768),
    }),
  ]),
  requestedScopes: z.array(MemoryScopeSchema).min(1).max(3),
  limit: z.number().int().min(1).max(100),
  runContext: RunContextSchema,
});

export type MemoryQuery = z.infer<typeof MemoryQuerySchema>;

export const MemoryWriteSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  record: MemoryRecordSchema,
  runContext: RunContextSchema,
  effectRequest: EffectRequestSchema,
  sourceEpisodeIds: z.array(OpaqueIdSchema).min(1).max(1024),
});

export type MemoryWrite = z.infer<typeof MemoryWriteSchema>;

export const ObservationSchema = z.strictObject({
  tenantId: OpaqueIdSchema,
  scope: MemoryScopeSchema,
  ownerId: OpaqueIdSchema,
  entity: OpaqueIdSchema,
  relation: OpaqueIdSchema,
  value: BoundedTextSchema,
  observedAt: UtcTimestampSchema,
  validUntil: UtcTimestampSchema,
  sourceIds: z.array(OpaqueIdSchema).max(64),
  confidence: z.number().min(0).max(1),
  revision: z.number().int().min(1),
});

export type Observation = z.infer<typeof ObservationSchema>;

export const ConsolidationPlanSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  planId: OpaqueIdSchema,
  tenantId: OpaqueIdSchema,
  sourceEpisodeIds: z.array(OpaqueIdSchema).min(1).max(1024),
  sourceScopes: z.array(MemoryScopeSchema).min(1).max(3),
  expectedMemoryVersions: z.record(
    OpaqueIdSchema,
    z.number().int().min(1),
  ),
  proposedRevisions: z
    .array(
      z.strictObject({
        memoryId: OpaqueIdSchema,
        proposedVersion: z.number().int().min(1),
        value: BoundedTextSchema,
        confidence: z.number().min(0).max(1),
        links: z.array(OpaqueIdSchema).max(64),
      }),
    )
    .max(256),
  provenance: OpaqueIdSchema,
  sensitivity: SensitivitySchema,
  status: z.enum(["draft", "ready", "applied", "rejected"]),
});

export type ConsolidationPlan = z.infer<typeof ConsolidationPlanSchema>;
