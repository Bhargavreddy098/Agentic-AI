-- Owner-local migration manifest for @asi/service-core (asi_core database)
-- Preserves authoritative single-writer tables for Core-owned model families.
CREATE TABLE IF NOT EXISTS core_service_metadata (
    service_name TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL DEFAULT 1,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
