import type { TaskEnvelope, TaskResult, OpaqueId } from "@asi/contracts";
import { Queue } from "bullmq";
import { type RankedWorker } from "./rank.js";
import { executeTask } from "./worker.js";
import { normalizeError } from "@asi/tools";

export interface QueueConfig {
  queueName: string;
  maxConcurrency: number;
  defaultJobOptions: {
    attempts: number;
    backoff: { type: "exponential"; delay: number };
    removeOnComplete: boolean;
    removeOnFail: boolean;
  };
}

export interface EnqueuedTask {
  taskId: OpaqueId;
  traceId: OpaqueId;
  enqueuedAt: string;
}

export interface QueuePort {
  enqueueTask(task: TaskEnvelope): Promise<EnqueuedTask>;
  getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }>;
  close(): Promise<void>;
}

const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  queueName: "specialist-tasks",
  maxConcurrency: 8,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
};

// In-memory queue implementation for testing (Redis/BullMQ would be used in production)
interface QueuedJob {
  id: string;
  task: TaskEnvelope;
  status: "waiting" | "active" | "completed" | "failed";
  attempts: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: TaskResult;
  error?: string;
}

export class InMemoryQueueAdapter implements QueuePort {
  private jobs: Map<string, QueuedJob> = new Map();
  private config: QueueConfig;
  private executionFn: (task: TaskEnvelope, signal: AbortSignal) => Promise<TaskResult>;
  private rankedWorkersCache: Map<string, RankedWorker[]> = new Map();

  constructor(
    config: Partial<QueueConfig> = {},
    executionFn: (task: TaskEnvelope, signal: AbortSignal) => Promise<TaskResult> = executeTask
  ) {
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
    this.executionFn = executionFn;
  }

  async enqueueTask(task: TaskEnvelope): Promise<EnqueuedTask> {
    const jobId = task.idempotencyKey;
    const existing = this.jobs.get(jobId);
    
    if (existing) {
      return {
        taskId: task.taskId,
        traceId: task.traceId,
        enqueuedAt: existing.createdAt,
      };
    }

    const job: QueuedJob = {
      id: jobId,
      task,
      status: "waiting",
      attempts: 0,
      createdAt: new Date().toISOString(),
    };

    this.jobs.set(jobId, job);
    
    // Process asynchronously
    this.processJob(job).catch(err => {
      console.error(`Job ${jobId} processing error:`, err);
    });

    return {
      taskId: task.taskId,
      traceId: task.traceId,
      enqueuedAt: job.createdAt,
    };
  }

  private async processJob(job: QueuedJob): Promise<void> {
    job.status = "active";
    job.attempts++;
    job.startedAt = new Date().toISOString();

    const controller = new AbortController();
    const signal = controller.signal;

    // Set timeout based on task deadline
    const deadlineMs = new Date(job.task.runContext.deadlineAt).getTime() - Date.now();
    const timeout = Math.min(deadlineMs, 300000);
    const timeoutHandle = setTimeout(() => controller.abort(), timeout);

    try {
      const result = await this.executionFn(job.task, signal);
      
      clearTimeout(timeoutHandle);
      
      job.status = "completed";
      job.completedAt = new Date().toISOString();
      job.result = result;
      
      console.log(`Job ${job.id} completed with status: ${result.status}`);
    } catch (err) {
      clearTimeout(timeoutHandle);
      
      const normalized = normalizeError(err, { operation: "task-execution", traceId: job.task.traceId });
      
      job.status = "failed";
      job.completedAt = new Date().toISOString();
      job.error = normalized.safeMessage;
      
      console.error(`Job ${job.id} failed:`, normalized.safeMessage);
    }
  }

  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    let waiting = 0, active = 0, completed = 0, failed = 0;
    
    for (const job of this.jobs.values()) {
      switch (job.status) {
        case "waiting": waiting++; break;
        case "active": active++; break;
        case "completed": completed++; break;
        case "failed": failed++; break;
      }
    }
    
    return { waiting, active, completed, failed };
  }

  async close(): Promise<void> {
    this.jobs.clear();
  }
}

export class BullMQAdapter implements QueuePort {
  private queue: Queue;

  constructor(config?: Partial<QueueConfig>, redisUrl?: string) {
    const queueName = config?.queueName ?? DEFAULT_QUEUE_CONFIG.queueName;
    const url = redisUrl ?? process.env.REDIS_URL ?? "redis://localhost:6379";
    this.queue = new Queue(queueName, {
      connection: { url },
      defaultJobOptions: config?.defaultJobOptions ?? DEFAULT_QUEUE_CONFIG.defaultJobOptions,
    });
  }

  async enqueueTask(task: TaskEnvelope): Promise<EnqueuedTask> {
    const job = await this.queue.add("specialist-task", task, {
      jobId: task.taskId,
    });

    return {
      taskId: task.taskId,
      traceId: task.traceId,
      enqueuedAt: new Date(job.timestamp).toISOString(),
    };
  }

  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const counts = await this.queue.getJobCounts("waiting", "active", "completed", "failed");
    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export function createQueueAdapter(
  config?: Partial<QueueConfig>,
  executionFn?: (task: TaskEnvelope, signal: AbortSignal) => Promise<TaskResult>,
  redisUrl?: string,
): QueuePort {
  // Use in-memory adapter for testing, BullMQ for production or when redisUrl provided
  if (process.env.NODE_ENV === "production" || redisUrl) {
    return new BullMQAdapter(config, redisUrl);
  }
  return new InMemoryQueueAdapter(config, executionFn);
}