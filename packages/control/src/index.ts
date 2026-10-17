export * from "./ingress.js";
export * from "./leases.js";
export * from "./outbox.js";
export * from "./checkpoints.js";
export * from "./effects.js";
export * from "./goals.js";

import { Pool, type PoolConfig } from "pg";
import { createIngressRepository, type IngressRepository } from "./ingress.js";
import { createLeaseRepository, type LeaseRepository } from "./leases.js";
import { createOutboxRepository, type OutboxRepository } from "./outbox.js";
import { createCheckpointRepository, type CheckpointRepository } from "./checkpoints.js";
import { createEffectRepository, type EffectRepository } from "./effects.js";
import { createGoalRepository, type GoalRepository } from "./goals.js";
import { bindScope, type ControlScope } from "./runtime.js";
export type { ControlScope } from "./runtime.js";

export interface ControlServices {
  pool: Pool;
  ingress: IngressRepository;
  leases: LeaseRepository;
  outbox: OutboxRepository;
  checkpoints: CheckpointRepository;
  effects: EffectRepository;
  goals: GoalRepository;
}

export function createControlServices(config: PoolConfig, input?: ControlScope): ControlServices {
  const scope = bindScope(input);
  const pool = new Pool(config);
  return {
    pool,
    ingress: createIngressRepository(pool, scope),
    leases: createLeaseRepository(pool, scope),
    outbox: createOutboxRepository(pool, scope),
    checkpoints: createCheckpointRepository(pool, scope),
    effects: createEffectRepository(pool, scope),
    goals: createGoalRepository(pool, scope)
  };
}

export type ControlPool = Pool;
export type ControlPoolConfig = PoolConfig;

export function createControlPool(config: PoolConfig): ControlPool {
  return new Pool(config);
}

export async function closeControlServices(services: ControlServices): Promise<void> {
  await services.pool.end();
}

