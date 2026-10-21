import type { SandboxBackend, IsolatedExecutionResult, SandboxQualification } from "./port.js";

/** Availability boundary only. A native Windows execution backend is not qualified yet. */
export function createWindowsSandboxBackend(): SandboxBackend {
  return {
    name: "windows-unavailable",
    async executeIsolated(): Promise<IsolatedExecutionResult> {
      throw new Error("Windows isolation is not qualified; executable tools are disabled");
    },
    async qualify(): Promise<SandboxQualification> {
      return {
        backend: "windows-unavailable", qualified: false,
        checks: { backend_available: false, isolation_qualified: false },
        evidence: [{ check: "backend_available", passed: false,
          details: "Native Windows isolation is pending Task12 implementation and qualification; no execution fallback is allowed",
          timestamp: new Date().toISOString() }],
      };
    },
  };
}
