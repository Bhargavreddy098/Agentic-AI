import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

// Trusted test construction only; excluded from production package exports/build.
export type SqliteFixtureDatabase = BetterSqliteDatabase;
export function createSqliteFixtureDatabase(path: string, options?: ConstructorParameters<typeof Database>[1]): SqliteFixtureDatabase {
  return new Database(path, options);
}
