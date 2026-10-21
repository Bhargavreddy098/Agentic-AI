import { createUiCapabilityProvider, type UiCapabilityBinding, type UiCapabilities } from "@asi/contracts";

export type { UiCapabilityBinding, UiCapabilities };

/**
 * Trusted composition/readiness projection for the UI Gateway.
 *
 * No SQL, credentials, signing keys or exception details ever leave this
 * module. Bindings are composed by the server owner from trusted port
 * composition; the browser receives only the projected operation states.
 */

// Operations backed by the current memory-backed control/commands/uploads
// composition. They are real implementations but synthetic owners, so they
// must never advertise live support.
const SYNTHETIC_OPERATIONS: readonly UiCapabilityBinding["operation"][] = [
  "conversation.read",
  "conversation.create",
  "conversation.update",
  "message.send",
  "run.cancel",
  "clarification.answer",
  "approval.decide",
  "upload.create",
  "provider.write",
  "model.write",
  "skill.write",
  "connection.write",
  "memory.write",
  "settings.write",
];

// Operations the gateway contract exposes but for which no service is
// configured in the current composition. Reported truthfully as
// unconfigured rather than omitted, so the frontend can distinguish
// "not part of the contract" from "configured but absent".
const UNCONFIGURED_OPERATIONS: readonly UiCapabilityBinding["operation"][] = [
  "provider.read",
  "model.read",
  "skill.read",
  "connection.read",
  "memory.read",
  "activity.read",
  "settings.read",
  "artifact.read",
  "usage.read",
];

function syntheticBinding(operation: UiCapabilityBinding["operation"]): UiCapabilityBinding {
  return {
    operation,
    adapterId: `memory-${operation}`,
    source: "synthetic",
    readiness: async () => true,
  };
}

function unconfiguredBinding(operation: UiCapabilityBinding["operation"]): UiCapabilityBinding {
  // Source "live" without a qualification reference resolves to
  // "unconfigured": a missing trusted-owner record can never become live.
  return {
    operation,
    adapterId: `missing-${operation}`,
    source: "live",
    readiness: async () => false,
  };
}

export function createSyntheticCapabilityBindings(): readonly UiCapabilityBinding[] {
  return [...SYNTHETIC_OPERATIONS.map(syntheticBinding), ...UNCONFIGURED_OPERATIONS.map(unconfiguredBinding)];
}

export function createGatewayCapabilityProvider(bindings: readonly UiCapabilityBinding[]): { read(): Promise<UiCapabilities> } {
  return createUiCapabilityProvider(bindings);
}