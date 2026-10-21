import { expect, it } from "vitest";
import {
  createUiCapabilityProvider,
  type UiCapabilityBinding,
  type UiCapabilities,
  UiCapabilitiesSchema,
  UiCapabilityStateSchema,
  UiOperationSchema,
} from "@asi/contracts";

function binding(operation: string, readiness: () => Promise<boolean> = async () => true, source: "live" | "synthetic" = "synthetic", qualificationRef?: string): UiCapabilityBinding {
  const base = {
    operation: operation as UiCapabilityBinding["operation"],
    adapterId: `adapter-${operation}`,
    source,
    readiness,
  };
  return qualificationRef === undefined ? base : { ...base, qualificationRef };
}

const LIVE_OPERATIONS = ["conversation.read", "conversation.create", "message.send", "run.cancel", "clarification.answer", "approval.decide", "upload.create", "provider.read", "provider.write", "model.read", "model.write", "skill.read", "skill.write", "connection.read", "connection.write", "memory.read", "memory.write", "activity.read", "settings.read", "settings.write"];

it("synthetic readiness never becomes live", async () => {
  const provider = createUiCapabilityProvider([binding("conversation.read", async () => true, "synthetic", "qualified")]);
  const caps = await provider.read();
  const op = caps.operations.find(o => o.operation === "conversation.read");
  expect(op?.state).toBe("synthetic");
});

it("healthy server with no owners enables zero operations", async () => {
  const provider = createUiCapabilityProvider([]);
  const caps = await provider.read();
  expect(caps.operations.every(o => o.state !== "live")).toBe(true);
  expect(caps.operations.filter(o => o.state === "live").length).toBe(0);
});

it("missing qualification denies live state", async () => {
  const provider = createUiCapabilityProvider([binding("conversation.read", async () => true, "live")]);
  const caps = await provider.read();
  const op = caps.operations.find(o => o.operation === "conversation.read");
  expect(op?.state).not.toBe("live");
});

it("readiness failure removes support", async () => {
  const provider = createUiCapabilityProvider([binding("conversation.read", async () => {
    throw new Error("boom");
  }, "live", "qualified")]);
  const caps = await provider.read();
  const op = caps.operations.find(o => o.operation === "conversation.read");
  expect(op?.state).toBe("unavailable");
});

it("duplicate and unknown operation identities reject", async () => {
  const provider = createUiCapabilityProvider([
    binding("conversation.read", async () => true, "live", "qualified"),
    binding("conversation.read", async () => true, "live", "qualified"),
    binding("not.a.real.operation", async () => true, "live", "qualified"),
  ]);
  await expect(provider.read()).rejects.toThrow();
});

it("revision advances only on a changed projection", async () => {
  const readiness = { current: async () => true };
  const provider = createUiCapabilityProvider([binding("conversation.read", () => readiness.current(), "live", "qualified")]);
  const first = await provider.read();
  const second = await provider.read();
  expect(second.revision).toBe(first.revision);
  readiness.current = async () => {
    throw new Error("down");
  };
  const third = await provider.read();
  expect(third.revision).not.toBe(first.revision);
  const op = third.operations.find(o => o.operation === "conversation.read");
  expect(op?.state).toBe("unavailable");
});