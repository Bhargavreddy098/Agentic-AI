import { z } from "zod/v4";
import { RunContextSchema } from "./task.js";
import {
  ArtifactReferenceSchema,
  BoundedTextSchema,
  OpaqueIdSchema,
  SchemaVersionSchema,
  Sha256HexSchema,
  UtcTimestampSchema,
} from "./primitives.js";
import { PrincipalSchema } from "./identity.js";

export const AttachmentReferenceSchema = z.strictObject({
  attachmentId: OpaqueIdSchema,
  name: z.string().min(1).max(255),
  mediaType: z.string().min(1).max(100),
  sizeBytes: z.number().int().min(0).max(16777216),
});

export const SessionContentPartSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), text: BoundedTextSchema }),
  z.strictObject({
    type: z.literal("attachment"),
    attachment: AttachmentReferenceSchema,
  }),
]);

export const SessionEventSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  eventId: OpaqueIdSchema,
  tenantId: OpaqueIdSchema,
  sessionId: OpaqueIdSchema,
  platform: OpaqueIdSchema,
  externalMessageId: OpaqueIdSchema.optional(),
  traceId: OpaqueIdSchema,
  correlationId: OpaqueIdSchema,
  causationId: OpaqueIdSchema,
  principal: PrincipalSchema,
  receivedAt: UtcTimestampSchema,
  content: z.array(SessionContentPartSchema).min(1).max(256),
  attachments: z.array(AttachmentReferenceSchema).max(64).optional(),
}).refine(event => event.tenantId === event.principal.tenantId, {
  message: "event tenant must match authenticated principal",
  path: ["tenantId"],
});

export type SessionEvent = z.infer<typeof SessionEventSchema>;

export const EpisodeKindSchema = z.enum([
  "user_message",
  "assistant_message",
  "tool_call",
  "tool_result",
  "system_event",
]);

export const EpisodeSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  tenantId: OpaqueIdSchema,
  sessionId: OpaqueIdSchema,
  episodeId: OpaqueIdSchema,
  sequence: z.number().int().min(0),
  kind: EpisodeKindSchema,
  content: BoundedTextSchema.optional(),
  artifactRefs: z.array(ArtifactReferenceSchema).max(64).optional(),
  sourceIds: z.array(OpaqueIdSchema).max(64),
  createdAt: UtcTimestampSchema,
});

export type Episode = z.infer<typeof EpisodeSchema>;

export const EpisodeCommandSchema = z
  .strictObject({
    schemaVersion: SchemaVersionSchema,
    commandId: OpaqueIdSchema,
    principal: PrincipalSchema,
    runContext: RunContextSchema.optional(),
    ingressAuthority: OpaqueIdSchema.optional(),
    episodeId: OpaqueIdSchema,
    kind: EpisodeKindSchema,
    content: BoundedTextSchema.optional(),
    artifactRefs: z.array(ArtifactReferenceSchema).max(64).optional(),
    sourceEventId: OpaqueIdSchema,
  })
  .superRefine((command, ctx) => {
    if (command.runContext === undefined && command.ingressAuthority === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["runContext"],
        message: "either an authenticated runContext or an ingressAuthority is required",
      });
    }
    if (command.runContext !== undefined && command.ingressAuthority !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["ingressAuthority"],
        message: "runContext and ingressAuthority are mutually exclusive",
      });
    }
  });

export type EpisodeCommand = z.infer<typeof EpisodeCommandSchema>;

export const AppendReceiptSchema = z.strictObject({
  episodeId: OpaqueIdSchema,
  commandId: OpaqueIdSchema,
  sequence: z.number().int().min(1),
  contentHash: Sha256HexSchema,
});

export type AppendReceipt = z.infer<typeof AppendReceiptSchema>;

export const WriterLeaseSchema = z.strictObject({
  sessionId: OpaqueIdSchema,
  runId: OpaqueIdSchema,
  writerEpoch: z.number().int().min(1),
  expiresAt: UtcTimestampSchema,
});

export type WriterLease = z.infer<typeof WriterLeaseSchema>;
