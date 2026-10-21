/**
 * Operation-level capability validation for the OpenClaw-derived frontend.
 *
 * This module is the single gate between the presentation layer and the ASI
 * backend. It never interprets a route, catalog or session as authorization:
 * it only answers "is this operation currently advertised as live by the
 * server-owned capability projection?" A missing, malformed or revoked entry
 * denies the operation; the caller must not fall back to another mechanism.
 */

import {
  type UiCapabilities,
  type UiCapabilityState,
  UiCapabilitiesSchema,
  UiOperationSchema,
  type UiOperation,
} from "@asi/contracts";

export { type UiCapabilities, type UiOperation };

/** Operations the ASI HTTP contract exposes. Unknown operations never match. */
export const SUPPORTED_OPERATIONS: readonly UiOperation[] = UiOperationSchema.options;

export type OperationState = UiCapabilityState;

export interface CapabilityGate {
  /**
   * Returns true only when `operation` is advertised with state "live" in the
   * most recently accepted projection. Any other state denies.
   */
  canUseOperation(capabilities: UiCapabilities | null, operation: string): boolean;
  /** Validate a projection returned by the transport. Throws on malformed data. */
  parseCapabilities(raw: unknown): UiCapabilities;
  /** The set of operations currently live in a projection. */
  liveOperations(capabilities: UiCapabilities | null): UiOperation[];
}

/**
 * Parse and validate a capability projection. The schema is strict: unknown
 * keys, duplicate operations, oversized arrays or an unsupported revision all
 * reject. Callers treat a rejected projection as "no live operations".
 */
export function parseCapabilities(raw: unknown): UiCapabilities {
  return UiCapabilitiesSchema.parse(raw);
}

export function canUseOperation(capabilities: UiCapabilities | null, operation: string): boolean {
  if (!capabilities) return false;
  if (!UiOperationSchema.safeParse(operation).success) return false;
  return capabilities.operations.some(
    entry => entry.operation === operation && entry.state === "live",
  );
}

export function liveOperations(capabilities: UiCapabilities | null): UiOperation[] {
  if (!capabilities) return [];
  return capabilities.operations
    .filter(entry => entry.state === "live")
    .map(entry => entry.operation);
}

export const capabilityGate: CapabilityGate = { canUseOperation, parseCapabilities, liveOperations };