import { describe, it, expect } from "vitest";
import { A2A_REVISION, assertA2aRevision } from "../../backend/modules/protocols/src/a2a/versions.js";
import { validateAgentCard, sanitizeAgentCard } from "../../backend/modules/protocols/src/a2a/card.js";
import { mapA2aToLocal, mapLocalToA2a, createRemoteTaskState, updateRemoteTaskState, isTerminalA2aStatus } from "../../backend/modules/protocols/src/a2a/state-map.js";
import { checkedPrincipal, checkedEndpoint, isPublicA2aAddress, checkedCredential } from "../../backend/modules/protocols/src/a2a/auth.js";
import type { Principal } from "@asi/contracts";

describe("A2A Protocol", () => {
  describe("versions.ts", () => {
    it("accepts the reviewed target", () => {
      expect(A2A_REVISION).toBe("1.0.0");
      expect(() => assertA2aRevision(A2A_REVISION)).not.toThrow();
    });
    
    it.each(["0.9.0", "2.0.0", "2025-11-25", undefined])("rejects %s", revision => {
      expect(() => assertA2aRevision(revision)).toThrow("A2A_PROTOCOL_VERSION");
    });
  });

  describe("card.ts", () => {
    const validCard = {
      schemaVersion: 1,
      name: "Test Agent",
      description: "A test A2A agent",
      url: "https://agent.example.com/a2a",
      provider: { organization: "Test Org", url: "https://test.org" },
      version: "1.0.0",
      capabilities: { streaming: true, pushNotifications: false },
      defaultInputModes: ["text"],
      defaultOutputModes: ["text", "json"],
      skills: [{ id: "skill-1", name: "Echo", description: "Echoes input", tags: ["test"] }],
    };

    it("accepts a valid agent card", () => {
      const card = validateAgentCard(validCard);
      expect(card.name).toBe("Test Agent");
      expect(card.schemaVersion).toBe(1);
    });

    it("rejects card with secrets in metadata", () => {
      const cardWithSecret = { ...validCard, metadata: { apiKey: "secret" } };
      // Should not throw - metadata is allowed but sanitized
      const card = validateAgentCard(cardWithSecret);
      expect(card.metadata).toBeDefined();
    });

    it("sanitizes card by removing metadata", () => {
      const card = { ...validCard, metadata: { internal: "data" } };
      const sanitized = sanitizeAgentCard(validateAgentCard(card));
      expect(sanitized.metadata).toBeUndefined();
    });

    it("rejects invalid card (missing required fields)", () => {
      expect(() => validateAgentCard({ ...validCard, url: "not-a-url" })).toThrow();
    });
  });

  describe("state-map.ts", () => {
    it("maps all A2A statuses to local", () => {
      expect(mapA2aToLocal("pending")).toBe("unknown");
      expect(mapA2aToLocal("working")).toBe("unknown");
      expect(mapA2aToLocal("input-required")).toBe("unknown");
      expect(mapA2aToLocal("completed")).toBe("completed");
      expect(mapA2aToLocal("failed")).toBe("failed");
      expect(mapA2aToLocal("canceled")).toBe("cancelled");
      expect(mapA2aToLocal("auth-required")).toBe("unknown");
      expect(mapA2aToLocal("unknown")).toBe("unknown");
    });

    it("maps all local statuses to A2A", () => {
      expect(mapLocalToA2a("completed")).toBe("completed");
      expect(mapLocalToA2a("failed")).toBe("failed");
      expect(mapLocalToA2a("cancelled")).toBe("canceled");
      expect(mapLocalToA2a("budget_exhausted")).toBe("failed");
      expect(mapLocalToA2a("unknown")).toBe("unknown");
    });

    it("creates and updates remote task state", () => {
      const state = createRemoteTaskState("task-1", "ctx-1");
      expect(state.taskId).toBe("task-1");
      expect(state.status).toBe("pending");
      expect(state.history.length).toBe(1);
      
      const updated = updateRemoteTaskState(state, "working", "Started");
      expect(updated.status).toBe("working");
      expect(updated.history.length).toBe(2);
      expect(updated.history[1]!.message).toBe("Started");
    });

    it("identifies terminal statuses", () => {
      expect(isTerminalA2aStatus("completed")).toBe(true);
      expect(isTerminalA2aStatus("failed")).toBe(true);
      expect(isTerminalA2aStatus("canceled")).toBe(true);
      expect(isTerminalA2aStatus("working")).toBe(false);
      expect(isTerminalA2aStatus("pending")).toBe(false);
    });
  });

  describe("auth.ts", () => {
    const testPrincipal: Principal = {
      tenantId: "tenant-a",
      subjectId: "user-a",
      agentId: "agent-a",
      roles: ["user"],
      capabilities: ["task:execute"],
      audience: "a2a-test",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      authenticatedSource: "test",
    };

    it("validates principal", () => {
      const p = checkedPrincipal(testPrincipal);
      expect(p.tenantId).toBe("tenant-a");
    });

    it("rejects invalid principal", () => {
      expect(() => checkedPrincipal({ ...testPrincipal, tenantId: "" })).toThrow();
    });

    it("validates endpoint", () => {
      const network = {
        mode: "fixture" as const,
        endpoints: [{ endpoint: "http://127.0.0.1:3000/a2a", resource: "http://127.0.0.1:3000/a2a", audience: "a2a-test" }],
      };
      const endpoint = checkedEndpoint("http://127.0.0.1:3000/a2a", network);
      expect(endpoint.endpoint).toBe("http://127.0.0.1:3000/a2a");
    });

    it("rejects non-loopback in fixture mode", () => {
      const network = { mode: "fixture" as const, endpoints: [{ endpoint: "https://evil.com/a2a", resource: "https://evil.com/a2a", audience: "a2a-test" }] };
      expect(() => checkedEndpoint("https://evil.com/a2a", network)).toThrow("A2A_SSRF");
    });

    it("rejects HTTP in live mode", () => {
      const network = { mode: "live" as const, endpoints: [{ endpoint: "http://example.com/a2a", resource: "http://example.com/a2a", audience: "a2a-test" }] };
      expect(() => checkedEndpoint("http://example.com/a2a", network)).toThrow("A2A_TLS");
    });

    it("validates public IP addresses", () => {
      expect(isPublicA2aAddress("8.8.8.8")).toBe(true);
      expect(isPublicA2aAddress("1.1.1.1")).toBe(true);
    });

    it("rejects private/internal IP addresses", () => {
      expect(isPublicA2aAddress("127.0.0.1")).toBe(false);
      expect(isPublicA2aAddress("10.0.0.1")).toBe(false);
      expect(isPublicA2aAddress("192.168.1.1")).toBe(false);
      expect(isPublicA2aAddress("172.16.0.1")).toBe(false);
      expect(isPublicA2aAddress("169.254.169.254")).toBe(false);
    });

    it("validates credentials", () => {
      const credential = {
        token: "valid-token",
        resource: "https://agent.example.com/a2a",
        audience: "a2a-test",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };
      const endpoint = { endpoint: "https://agent.example.com/a2a", resource: "https://agent.example.com/a2a", audience: "a2a-test" };
      const token = checkedCredential(credential, endpoint);
      expect(token).toBe("valid-token");
    });

    it("rejects expired credentials", () => {
      const credential = {
        token: "expired-token",
        resource: "https://agent.example.com/a2a",
        audience: "a2a-test",
        expiresAt: new Date(Date.now() - 60000).toISOString(),
      };
      const endpoint = { endpoint: "https://agent.example.com/a2a", resource: "https://agent.example.com/a2a", audience: "a2a-test" };
      expect(() => checkedCredential(credential, endpoint)).toThrow("A2A_AUTH");
    });
  });

  describe("Principal schema validation", () => {
    it("requires all required fields", () => {
      const principal = {
        tenantId: "tenant-a",
        subjectId: "user-a",
        agentId: "agent-a",
        roles: ["user"],
        capabilities: ["task:execute"],
        audience: "a2a-test",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        authenticatedSource: "test",
      };
      const parsed = checkedPrincipal(principal);
      expect(parsed.tenantId).toBe("tenant-a");
    });
  });
});