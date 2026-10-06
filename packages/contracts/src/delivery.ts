import { z } from "zod";
import {
  OpaqueIdSchema,
  SchemaVersionSchema,
  Sha256HexSchema,
} from "./primitives.js";

export const DeliveryStatusSchema = z.enum([
  "pending",
  "sent",
  "failed",
  "unknown",
]);

export const DeliveryRecordSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  deliveryId: OpaqueIdSchema,
  sessionId: OpaqueIdSchema,
  runId: OpaqueIdSchema,
  channel: OpaqueIdSchema,
  destinationIdentity: OpaqueIdSchema,
  contentHash: Sha256HexSchema,
  status: DeliveryStatusSchema,
  remoteReceiptRef: OpaqueIdSchema.optional(),
});

export type DeliveryRecord = z.infer<typeof DeliveryRecordSchema>;
