import { z } from "zod";
import {
  ModeSchema,
  OpaqueIdSchema,
  SchemaVersionSchema,
  Sha256HexSchema,
  SignatureSchema,
  UtcTimestampSchema,
} from "./primitives.js";

export const AuditReceiptSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  receiptId: OpaqueIdSchema,
  tenantId: OpaqueIdSchema,
  sessionId: OpaqueIdSchema,
  runId: OpaqueIdSchema,
  effectId: OpaqueIdSchema,
  sequence: z.number().int().min(1),
  previousHash: Sha256HexSchema,
  inputHash: Sha256HexSchema,
  outputHash: Sha256HexSchema,
  status: z.enum(["succeeded", "failed", "unknown"]),
  mode: ModeSchema,
  policyVersion: OpaqueIdSchema,
  timestamp: UtcTimestampSchema,
  keyId: OpaqueIdSchema,
  signature: SignatureSchema,
});

export type AuditReceipt = z.infer<typeof AuditReceiptSchema>;
