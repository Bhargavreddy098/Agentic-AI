import { z } from "zod";
import { NormalizedErrorSchema, UsageSchema } from "./task.js";
import {
  ArtifactReferenceSchema,
  BoundedInlineSchema,
  OpaqueIdSchema,
  SchemaVersionSchema,
  Sha256HexSchema,
  SignatureSchema,
} from "./primitives.js";

export const ExecutionClassSchema = z.enum(["isolated", "in_process"]);

export const ToolManifestSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  toolId: OpaqueIdSchema,
  toolVersion: OpaqueIdSchema,
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()),
  artifactDigest: Sha256HexSchema,
  publisherSignature: SignatureSchema,
  requiredCapabilities: z.array(OpaqueIdSchema).min(1).max(128),
  executionClass: ExecutionClassSchema,
});

export type ToolManifest = z.infer<typeof ToolManifestSchema>;

export const ToolResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    schemaVersion: SchemaVersionSchema,
    toolId: OpaqueIdSchema,
    status: z.literal("succeeded"),
    content: BoundedInlineSchema,
    artifactRefs: z.array(ArtifactReferenceSchema).max(64).optional(),
    receiptId: OpaqueIdSchema,
    usage: UsageSchema,
    error: z.never().optional(),
  }),
  z.strictObject({
    schemaVersion: SchemaVersionSchema,
    toolId: OpaqueIdSchema,
    status: z.literal("failed"),
    content: z.never().optional(),
    artifactRefs: z.array(ArtifactReferenceSchema).max(64).optional(),
    receiptId: OpaqueIdSchema,
    usage: UsageSchema,
    error: NormalizedErrorSchema,
  }),
  z.strictObject({
    schemaVersion: SchemaVersionSchema,
    toolId: OpaqueIdSchema,
    status: z.literal("unknown"),
    content: z.never().optional(),
    artifactRefs: z.array(ArtifactReferenceSchema).max(64).optional(),
    receiptId: OpaqueIdSchema,
    usage: UsageSchema,
    error: z.never().optional(),
  }),
]);

export type ToolResult = z.infer<typeof ToolResultSchema>;

export const SkillManifestSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  skillId: OpaqueIdSchema,
  skillVersion: OpaqueIdSchema,
  publisherId: OpaqueIdSchema,
  publisherSignature: SignatureSchema,
  artifactHash: Sha256HexSchema,
  requiredCapabilities: z.array(OpaqueIdSchema).min(1).max(128),
  applicableTaskTypes: z.array(OpaqueIdSchema).min(1).max(128),
  scriptManifests: z.array(ToolManifestSchema).min(1).max(64),
  trustStatus: z.enum(["trusted", "pending", "revoked"]),
});

export type SkillManifest = z.infer<typeof SkillManifestSchema>;
