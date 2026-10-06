import { describe, expect, it } from "vitest";
import { UtcTimestampSchema, boundedJsonObjectSchema } from "../src/primitives.js";
import { SessionEventSchema } from "../src/session.js";
import { sessionEvent } from "./fixtures.js";
import { taskEnvelope } from "./fixtures.js";
import { TaskEnvelopeSchema } from "../src/task.js";

describe("wire boundary hardening", () => {
  it("rejects calendar dates that would normalize into another day", () => {
    for (const date of ["2026-02-30T12:00:00Z", "2026-13-01T00:00:00Z", "2026-01-01T25:00:00Z"]) {
      expect(UtcTimestampSchema.safeParse(date).success).toBe(false);
    }
    expect(UtcTimestampSchema.safeParse("2024-02-29T12:00:00.123Z").success).toBe(true);
  });

  it("rejects JSON values that serialize with silent loss", () => {
    const schema = boundedJsonObjectSchema(1024);
    for (const value of [{ value: undefined }, { value: NaN }, { value: Infinity }, { value: () => 1 }, { value: new Date() }]) {
      expect(schema.safeParse(value).success).toBe(false);
    }
    expect(schema.safeParse({ value: [null, true, 12, { text: "ok" }] }).success).toBe(true);
  });

  it("measures UTF-8 bytes rather than character count", () => {
    expect(boundedJsonObjectSchema(14).safeParse({ a: "😀😀" }).success).toBe(false);
  });

  it("rejects an event whose tenant differs from its authenticated principal", () => {
    expect(SessionEventSchema.safeParse(sessionEvent({ tenantId: "another-tenant" })).success).toBe(false);
  });

  it("rejects sparse arrays with extra keys and root accessors before reading them", () => {
    const array = new Array(1) as unknown[] & { extra?: string };
    array.extra = "drop";
    const schema = boundedJsonObjectSchema(1024);
    expect(schema.safeParse({ array }).success).toBe(false);
    let read = false;
    const accessor = { get value() { read = true; return "secret"; } };
    expect(schema.safeParse(accessor).success).toBe(false);
    expect(read).toBe(false);
    expect(schema.safeParse(Object.defineProperty({}, "hidden", { value: 12 })).success).toBe(false);
  });

  it("rejects tasks whose budget tenant differs from the delegated identity", () => {
    const task = taskEnvelope();
    task.runContext.budgetRef.tenantId = "other-tenant";
    expect(TaskEnvelopeSchema.safeParse(task).success).toBe(false);
  });
});
