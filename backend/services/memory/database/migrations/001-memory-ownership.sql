-- Owner-local migration manifest for @asi/service-memory (asi_memory database with pgvector)
CREATE TABLE IF NOT EXISTS memory_service_tenants (
    tenant_id TEXT PRIMARY KEY,
    provisioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
