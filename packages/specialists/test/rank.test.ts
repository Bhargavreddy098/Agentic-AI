import { describe, it, expect, beforeEach } from "vitest";
import { rankWorkers, hasAllRequiredCapabilities, getMissingCapabilities, getUnsupportedCapabilities } from "@asi/specialists";
import type { WorkerDescriptor, TaskEnvelope, OpaqueId } from "@asi/contracts";

function createTaskEnvelope(overrides: Partial<TaskEnvelope> = {}): TaskEnvelope {
  const base: TaskEnvelope = {
    schemaVersion: 1,
    taskId: "task-1" as OpaqueId,
    traceId: "trace-1" as OpaqueId,
    correlationId: "corr-1" as OpaqueId,
    causationId: "cause-1" as OpaqueId,
    runContext: {
      runId: "run-1" as OpaqueId,
      sessionId: "session-1" as OpaqueId,
      writerEpoch: 1,
      mode: "execute",
      deadlineAt: new Date(Date.now() + 3600000).toISOString(),
      budgetRef: {
        tenantId: "tenant-1",
        accountId: "account-1" as OpaqueId,
        rootRunId: "root-1" as OpaqueId,
      },
    },
    requiredCapabilities: ["cap:a", "cap:b"],
    input: { test: true },
    principalGrant: {
      tenantId: "tenant-1",
      subjectId: "subject-1",
      roles: ["user"],
      capabilities: ["cap:a", "cap:b"],
      audience: "test",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      authenticatedSource: "test",
    },
    idempotencyKey: "idem-1",
    ...overrides,
  };
  return base;
}

function createWorker(overrides: Partial<WorkerDescriptor> = {}): WorkerDescriptor {
  return {
    workerId: "worker-1",
    capabilities: ["cap:a", "cap:b", "cap:c"],
    health: "healthy",
    capacity: { active: 0, max: 4 },
    supportedTaskTypes: ["execute"],
    ...overrides,
  };
}

describe("Worker Ranking", () => {
  let task: TaskEnvelope;

  beforeEach(() => {
    task = createTaskEnvelope();
  });

  describe("rankWorkers", () => {
    it("should rank exact match highest", () => {
      const workers = [
        createWorker({ workerId: "w1", capabilities: ["cap:a", "cap:b"] }), // exact
        createWorker({ workerId: "w2", capabilities: ["cap:a", "cap:b", "cap:c"] }), // superset
      ];

      const ranked = rankWorkers(task, workers);
      
      expect(ranked[0]?.workerId).toBe("w1");
      expect(ranked[0]?.matchType).toBe("exact");
      expect(ranked[1]?.workerId).toBe("w2");
      expect(ranked[1]?.matchType).toBe("superset");
    });

    it("should rank exact match above superset", () => {
      const workers = [
        createWorker({ workerId: "w1", capabilities: ["cap:a", "cap:b", "cap:c"] }), // superset
        createWorker({ workerId: "w2", capabilities: ["cap:a", "cap:b"] }), // exact
      ];

      const ranked = rankWorkers(task, workers);
      
      expect(ranked[0]?.workerId).toBe("w2");
      expect(ranked[0]?.matchType).toBe("exact");
      expect(ranked[1]?.workerId).toBe("w1");
      expect(ranked[1]?.matchType).toBe("superset");
    });

    it("should filter out unhealthy workers", () => {
      const workers = [
        createWorker({ workerId: "w1", health: "unavailable" }),
        createWorker({ workerId: "w2", health: "healthy" }),
      ];

      const ranked = rankWorkers(task, workers);
      
      expect(ranked.length).toBe(1);
      expect(ranked[0]?.workerId).toBe("w2");
    });

    it("should filter out full workers", () => {
      const workers = [
        createWorker({ workerId: "w1", capacity: { active: 4, max: 4 } }),
        createWorker({ workerId: "w2", capacity: { active: 0, max: 4 } }),
      ];

      const ranked = rankWorkers(task, workers);
      
      expect(ranked.length).toBe(1);
      expect(ranked[0]?.workerId).toBe("w2");
    });

    it("should filter out workers missing required capabilities", () => {
      const workers = [
        createWorker({ workerId: "w1", capabilities: ["cap:a"] }), // missing cap:b
        createWorker({ workerId: "w2", capabilities: ["cap:a", "cap:b"] }),
      ];

      const ranked = rankWorkers(task, workers);
      
      expect(ranked.length).toBe(1);
      expect(ranked[0]?.workerId).toBe("w2");
    });

    it("should sort by health priority", () => {
      const workers = [
        createWorker({ workerId: "w1", health: "degraded" }),
        createWorker({ workerId: "w2", health: "healthy" }),
      ];

      const ranked = rankWorkers(task, workers);
      
      expect(ranked[0]?.workerId).toBe("w2");
    });

    it("should sort by available capacity", () => {
      const workers = [
        createWorker({ workerId: "w1", capacity: { active: 2, max: 4 } }),
        createWorker({ workerId: "w2", capacity: { active: 0, max: 4 } }),
      ];

      const ranked = rankWorkers(task, workers);
      
      expect(ranked[0]?.workerId).toBe("w2");
    });

    it("should stable sort by workerId", () => {
      const workers = [
        createWorker({ workerId: "w2" }),
        createWorker({ workerId: "w1" }),
      ];

      const ranked = rankWorkers(task, workers);
      
      expect(ranked[0]?.workerId).toBe("w1");
      expect(ranked[1]?.workerId).toBe("w2");
    });

    it("should apply fanout limit", () => {
      const workers = Array.from({ length: 10 }, (_, i) => 
        createWorker({ workerId: `w${i}` })
      );

      const ranked = rankWorkers(task, workers, { maxFanout: 3 });
      
      expect(ranked.length).toBe(3);
    });

    it("should filter workers that don't support task type", () => {
      const workers = [
        createWorker({ workerId: "w1", supportedTaskTypes: ["observe"] }),
        createWorker({ workerId: "w2", supportedTaskTypes: ["execute"] }),
      ];

      const ranked = rankWorkers(task, workers);
      
      expect(ranked.length).toBe(1);
      expect(ranked[0]?.workerId).toBe("w2");
    });

    it("should filter workers missing mandatory capabilities", () => {
      const workers = [
        createWorker({ workerId: "w1", capabilities: ["cap:a"] }), // missing cap:b
        createWorker({ workerId: "w2", capabilities: ["cap:a", "cap:b"] }),
      ];

      const ranked = rankWorkers(task, workers);
      
      expect(ranked.length).toBe(1);
      expect(ranked[0]?.workerId).toBe("w2");
    });
  });

  describe("hasAllRequiredCapabilities", () => {
    it("should return true when worker has all required capabilities", () => {
      const worker = createWorker();
      const required = new Set(["cap:a", "cap:b"]);
      
      expect(hasAllRequiredCapabilities(worker, required)).toBe(true);
    });

    it("should return false when worker missing a required capability", () => {
      const worker = createWorker({ capabilities: ["cap:a"] });
      const required = new Set(["cap:a", "cap:b"]);
      
      expect(hasAllRequiredCapabilities(worker, required)).toBe(false);
    });
  });

  describe("getMissingCapabilities", () => {
    it("should return empty set when worker has all capabilities", () => {
      const worker = createWorker();
      const required = new Set(["cap:a", "cap:b"]);
      
      const missing = getMissingCapabilities(worker, required);
      
      expect(missing.size).toBe(0);
    });

    it("should return set of missing capabilities", () => {
      const worker = createWorker({ capabilities: ["cap:a"] });
      const required = new Set(["cap:a", "cap:b", "cap:c"]);
      
      const missing = getMissingCapabilities(worker, required);
      
      expect(missing.size).toBe(2);
      expect(missing.has("cap:b")).toBe(true);
      expect(missing.has("cap:c")).toBe(true);
    });
  });

  describe("getUnsupportedCapabilities", () => {
    it("should return empty set when all capabilities supported", () => {
      const task = createTaskEnvelope({ requiredCapabilities: ["cap:a", "cap:b"] });
      const workers = [createWorker({ capabilities: ["cap:a", "cap:b", "cap:c"] })];
      
      const unsupported = getUnsupportedCapabilities(task, workers);
      
      expect(unsupported.size).toBe(0);
    });

    it("should return unsupported capabilities", () => {
      const task = createTaskEnvelope({ requiredCapabilities: ["cap:a", "cap:b", "cap:z"] });
      const workers = [createWorker({ capabilities: ["cap:a", "cap:b", "cap:c"] })];
      
      const unsupported = getUnsupportedCapabilities(task, workers);
      
      expect(unsupported.size).toBe(1);
      expect(unsupported.has("cap:z")).toBe(true);
    });
  });
});