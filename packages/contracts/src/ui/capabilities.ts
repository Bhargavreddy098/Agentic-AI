import { z } from "zod";
import { OpaqueIdSchema, SchemaVersionSchema } from "../primitives.js";

/**
 * Operation-level capability projection (Task 1).
 *
 * A capability describes a single operation the backend may support, not a
 * role. States are explicit and fail closed: anything that is not a verified
 * live adapter is reported as synthetic, unconfigured or unavailable, and the
 * frontend never promotes a synthetic or unconfigured operation to live.
 */

export const UiOperationSchema = z.enum([
  "conversation.read",
  "conversation.create",
  "conversation.update",
  "message.send",
  "run.cancel",
  "clarification.answer",
  "approval.decide",
  "upload.create",
  "artifact.read",
  "provider.read",
  "provider.write",
  "model.read",
  "model.write",
  "skill.read",
  "skill.write",
  "connection.read",
  "connection.write",
  "memory.read",
  "memory.write",
  "activity.read",
  "usage.read",
  "settings.read",
  "settings.write",
]);

export type UiOperation = z.infer<typeof UiOperationSchema>;

export const UiCapabilityStateSchema = z.enum(["live", "synthetic", "unconfigured", "unavailable"]);

export type UiCapabilityState = z.infer<typeof UiCapabilityStateSchema>;

export const UiCapabilityEntrySchema = z.strictObject({
  operation: UiOperationSchema,
  state: UiCapabilityStateSchema,
});

export const UiCapabilitiesSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  revision: z.number().int().nonnegative(),
  operations: z.array(UiCapabilityEntrySchema).max(23),
}).refine(
  (value) => new Set(value.operations.map(entry => entry.operation)).size === value.operations.length,
  "capability operations must be unique",
);

export type UiCapabilities = z.infer<typeof UiCapabilitiesSchema>;
export type UiCapabilityEntry = z.infer<typeof UiCapabilityEntrySchema>;

/**
 * Internal binding. Qualification references are trusted-owner records, never
 * request values or client-provided declarations.
 */
export interface UiCapabilityBinding {
  readonly operation: UiOperation;
  readonly adapterId: string;
  readonly source: "live" | "synthetic";
  readonly qualificationRef?: string;
  readonly readiness: () => Promise<boolean>;
}

interface CachedProjection {
  revision: number;
  operations: UiCapabilityEntry[];
}

function entry(operation: UiOperation, state: UiCapabilityState): UiCapabilityEntry {
  return { operation, state };
}

/**
 * Build a capability provider from trusted bindings. Synthetic bindings stay
 * synthetic regardless of readiness; a missing qualification or binding can
 * never become live; readiness errors become unavailable. Revisions only
 * advance when the projected state of at least one operation changes.
 */
export function createUiCapabilityProvider(bindings: readonly UiCapabilityBinding[]): { read(): Promise<UiCapabilities> } {
  let cached: CachedProjection | null = null;

  function validate(): Map<UiOperation, UiCapabilityBinding> {
    const unique = new Map<UiOperation, UiCapabilityBinding>();
    for (const binding of bindings) {
      if (unique.has(binding.operation)) {
        throw new Error(`duplicate capability binding for operation ${binding.operation}`);
      }
      if (!UiOperationSchema.safeParse(binding.operation).success) {
        throw new Error(`unknown capability operation ${String(binding.operation)}`);
      }
      unique.set(binding.operation, binding);
    }
    return unique;
  }

  async function project(): Promise<CachedProjection> {
    const unique = validate();
    const entries: UiCapabilityEntry[] = [];
    for (const binding of unique.values()) {
      let state: UiCapabilityState;
      if (binding.source === "synthetic") {
        state = "synthetic";
      } else if (!binding.qualificationRef) {
        state = "unconfigured";
      } else {
        try {
          const ready = await binding.readiness();
          state = ready ? "live" : "unconfigured";
        } catch {
          state = "unavailable";
        }
      }
      entries.push(entry(binding.operation, state));
    }
    entries.sort((a, b) => a.operation.localeCompare(b.operation));
    return { revision: 0, operations: entries };
  }

  async function read(): Promise<UiCapabilities> {
    const next = await project();
    if (!cached) {
      cached = next;
    } else if (sameProjection(cached, next)) {
      return { schemaVersion: 1, revision: cached.revision, operations: cached.operations };
    } else {
      cached = { ...next, revision: cached.revision + 1 };
    }
    return { schemaVersion: 1, revision: cached.revision, operations: cached.operations };
  }

  return { read };
}

function sameProjection(a: CachedProjection, b: CachedProjection): boolean {
  if (a.operations.length !== b.operations.length) return false;
  const aKeys = a.operations.map(entry => `${entry.operation}:${entry.state}`);
  const bKeys = b.operations.map(entry => `${entry.operation}:${entry.state}`);
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
  }
  return true;
}

