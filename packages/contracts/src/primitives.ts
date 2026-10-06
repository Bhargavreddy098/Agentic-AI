import { z } from "zod";

export const SchemaVersionSchema = z.literal(1);

export const OpaqueIdSchema = z.string().min(1).max(128);

export const UtcTimestampSchema = z.iso.datetime({ offset: false });

export const FutureUtcTimestampSchema = UtcTimestampSchema.refine(
  (value) => new Date(value).getTime() > Date.now(),
  "timestamp must be in the future",
);

export const MicroUsdSchema = z.number().int().min(0);

export const TokenCountSchema = z.number().int().min(0);

export const Sha256HexSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "64-character lowercase hex SHA-256 required");

export const SignatureSchema = z.string().min(64).max(2048);

export const ErrorCodeSchema = z.enum([
  "INVALID_INPUT",
  "UNAUTHENTICATED",
  "POLICY_DENIED",
  "APPROVAL_REQUIRED",
  "STALE_WRITER",
  "BUDGET_EXCEEDED",
  "TIMEOUT",
  "CANCELLED",
  "DEPENDENCY_UNAVAILABLE",
  "UNKNOWN_OUTCOME",
]);

export const ModeSchema = z.enum(["observe", "assist", "execute"]);

export const SensitivitySchema = z.enum([
  "public",
  "internal",
  "confidential",
  "restricted",
]);

export const MemoryScopeSchema = z.enum(["Global", "Role", "Private"]);

export const ArtifactReferenceSchema = z.strictObject({
  artifactId: OpaqueIdSchema,
  contentHash: Sha256HexSchema,
});

export const BoundedTextSchema = z.string().max(1048576);

export const BoundedInlineSchema = z.string().max(65536);

export function boundedJsonObjectSchema(limitBytes: number) {
  return z.custom<Record<string, unknown>>((value) =>
    value !== null && typeof value === "object" && !Array.isArray(value),
    "JSON object required",
  ).superRefine((value, ctx) => {
    let serialized: string;
    try {
      // Validate the original value before JSON.stringify can discard or coerce it.
      const ancestors = new Set<object>();
      const visit = (entry: unknown): boolean => {
        if (entry === null || typeof entry === "string" || typeof entry === "boolean") return true;
        if (typeof entry === "number") return Number.isFinite(entry);
        if (typeof entry !== "object" || ancestors.has(entry)) return false;
        if (!Array.isArray(entry) && Object.getPrototypeOf(entry) !== Object.prototype && Object.getPrototypeOf(entry) !== null) return false;
        ancestors.add(entry);
        if (Array.isArray(entry) && (Object.keys(entry).length !== entry.length ||
          !Array.from({ length: entry.length }, (_, index) => Object.hasOwn(entry, index)).every(Boolean))) {
          ancestors.delete(entry);
          return false;
        }
        const valid = Reflect.ownKeys(entry).every(key => {
          if (Array.isArray(entry) && key === "length") return true;
          if (typeof key !== "string") return false;
          const property = Object.getOwnPropertyDescriptor(entry, key);
          return property !== undefined && property.enumerable && "value" in property && visit(property.value);
        }) && (!Array.isArray(entry) || Object.keys(entry).length === entry.length);
        ancestors.delete(entry);
        return valid;
      };
      if (!visit(value)) {
        ctx.addIssue({ code: "custom", message: "value must contain only lossless JSON data" });
        return;
      }
      serialized = JSON.stringify(value) ?? "";
    } catch {
      ctx.addIssue({ code: "custom", message: "value is not JSON-serializable" });
      return;
    }
    if (new TextEncoder().encode(serialized).byteLength > limitBytes) {
      ctx.addIssue({
        code: "custom",
        message: `value exceeds the ${limitBytes}-byte boundary limit`,
      });
    }
  });
}
