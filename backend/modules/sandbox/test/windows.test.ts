import { describe, it, expect } from "vitest";
import * as sandbox from "../src/index.js";
import type { SandboxBackend } from "../src/port.js";

describe("Windows-only sandbox availability", () => {
  it("does not expose the removed executable backends", () => {
    expect(Reflect.get(sandbox, "ContainerBackend")).toBeUndefined();
    expect(Reflect.get(sandbox, "MicroVMBackend")).toBeUndefined();
  });
  it("reports unavailable isolation and refuses execution without inspecting input", async () => {
    const factory: unknown = Reflect.get(sandbox, "createWindowsSandboxBackend");
    expect(typeof factory).toBe("function");
    if (typeof factory !== "function") throw new Error("Windows backend factory missing");
    const backend = factory() as SandboxBackend;
    const report = await backend.qualify();
    expect(report.qualified).toBe(false);
    expect(report.checks.backend_available).toBe(false);
    const execute = backend.executeIsolated.bind(backend);
    const hostile = new Proxy({}, { get() { throw new Error("Input must not be evaluated"); } });
    await expect(Reflect.apply(execute, undefined, [hostile, hostile, hostile, hostile])).rejects.toThrow("Windows isolation is not qualified");
  });
});
