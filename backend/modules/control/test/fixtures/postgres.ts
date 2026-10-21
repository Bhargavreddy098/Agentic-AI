import { Pool } from "pg";
import type { PoolConfig } from "pg";

// Trusted test construction only; excluded from production package exports/build.
export type PostgresFixturePool = Pool;
export function createPostgresFixturePool(config: PoolConfig): PostgresFixturePool {
  return new Pool(config);
}
