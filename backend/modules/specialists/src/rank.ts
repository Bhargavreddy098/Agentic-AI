import type { TaskEnvelope, WorkerDescriptor, OpaqueId } from "@asi/contracts";

export interface RankingConfig {
  maxFanout: number;
  maxIterations: number;
}

export const DEFAULT_RANKING_CONFIG: RankingConfig = {
  maxFanout: 8,
  maxIterations: 12,
};

export interface RankedWorker extends WorkerDescriptor {
  matchScore: number;
  matchType: "exact" | "partial" | "superset";
}

/**
 * Ranks workers for a given task based on capability matching.
 * 
 * Ranking priority:
 * 1. Exact match (worker capabilities == task required capabilities)
 * 2. Superset match (worker capabilities ⊇ task required capabilities)
 * 3. Partial match (worker capabilities ∩ task required capabilities ≠ ∅)
 * 
 * Within each match type, sort by:
 * - Health (healthy > degraded > unavailable)
 * - Available capacity (max - active, descending)
 * - Worker ID (stable sort)
 * 
 * Filters out:
 * - Unhealthy workers
 * - Full workers (active >= max)
 * - Workers missing any mandatory capability
 */
export function rankWorkers(
  task: TaskEnvelope,
  workers: WorkerDescriptor[],
  config: Partial<RankingConfig> = DEFAULT_RANKING_CONFIG
): RankedWorker[] {
  const required = new Set(task.requiredCapabilities);
  const taskType = task.runContext.mode; // observe, assist, execute

  // Filter eligible workers
  const eligible = workers.filter(w => {
    // Must be healthy
    if (w.health !== "healthy") return false;
    // Must have capacity
    if (w.capacity.active >= w.capacity.max) return false;
    // Must support the task type
    if (!w.supportedTaskTypes.includes(taskType)) return false;
    // Must have all required capabilities
    const workerCaps = new Set(w.capabilities);
    for (const cap of required) {
      if (!workerCaps.has(cap)) return false;
    }
    return true;
  });

  // Rank each eligible worker
  const ranked: RankedWorker[] = eligible.map(w => {
    const workerCaps = new Set(w.capabilities);
    const intersection = new Set([...required].filter(c => workerCaps.has(c)));
    const missing = new Set([...required].filter(c => !workerCaps.has(c)));

    let matchType: RankedWorker["matchType"];
    let matchScore: number;

    if (missing.size === 0 && w.capabilities.length === required.size) {
      matchType = "exact";
      matchScore = 1000;
    } else if (missing.size === 0) {
      matchType = "superset";
      matchScore = 500 + intersection.size;
    } else {
      matchType = "partial";
      matchScore = intersection.size;
    }

    return {
      ...w,
      matchScore,
      matchType,
    };
  });

  // Sort by match type priority, then health, then capacity, then workerId
  const typePriority = { exact: 3, superset: 2, partial: 1 };
  const healthPriority = { healthy: 3, degraded: 2, unavailable: 1 };

  ranked.sort((a, b) => {
    // Match type priority (higher first)
    if (typePriority[a.matchType] !== typePriority[b.matchType]) {
      return typePriority[b.matchType] - typePriority[a.matchType];
    }
    // Match score (higher first)
    if (a.matchScore !== b.matchScore) {
      return b.matchScore - a.matchScore;
    }
    // Health priority (higher first)
    if (healthPriority[a.health] !== healthPriority[b.health]) {
      return healthPriority[b.health] - healthPriority[a.health];
    }
    // Available capacity (higher first)
    const aAvail = a.capacity.max - a.capacity.active;
    const bAvail = b.capacity.max - b.capacity.active;
    if (aAvail !== bAvail) {
      return bAvail - aAvail;
    }
    // Stable sort by workerId
    return a.workerId.localeCompare(b.workerId);
  });

  // Apply fanout limit
  return ranked.slice(0, config.maxFanout ?? DEFAULT_RANKING_CONFIG.maxFanout);
}

/**
 * Checks if a worker has all required capabilities for a task.
 * Returns true only if worker has ALL required capabilities (mandatory).
 */
export function hasAllRequiredCapabilities(
  worker: WorkerDescriptor,
  required: ReadonlySet<OpaqueId>
): boolean {
  const workerCaps = new Set(worker.capabilities);
  for (const cap of required) {
    if (!workerCaps.has(cap)) return false;
  }
  return true;
}

/**
 * Gets the set of missing capabilities for a worker.
 */
export function getMissingCapabilities(
  worker: WorkerDescriptor,
  required: ReadonlySet<OpaqueId>
): Set<OpaqueId> {
  const workerCaps = new Set(worker.capabilities);
  return new Set([...required].filter(c => !workerCaps.has(c)));
}

/**
 * Validates that a task's required capabilities are supported by at least one worker.
 * Returns the set of unsupported capabilities.
 */
export function getUnsupportedCapabilities(
  task: TaskEnvelope,
  workers: WorkerDescriptor[]
): Set<OpaqueId> {
  const allWorkerCaps = new Set<OpaqueId>();
  for (const w of workers) {
    for (const c of w.capabilities) {
      allWorkerCaps.add(c);
    }
  }

  const required = new Set(task.requiredCapabilities);
  return new Set([...required].filter(c => !allWorkerCaps.has(c)));
}