-- ASI Agent System - Hierarchical Memory RLS
-- Migration 004: Memory tables with Row Level Security
-- PostgreSQL 17 compatible

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Memory records table with hierarchical RLS
CREATE TABLE IF NOT EXISTS memory_records (
    memory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN ('Global', 'Role', 'Private')),
    role_id TEXT,                       -- For Role scope: which role owns this
    owner_agent_id TEXT,                -- For Private scope: which agent owns this
    version INTEGER NOT NULL DEFAULT 1,
    value TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    source_episode_ids UUID[] NOT NULL DEFAULT '{}',
    authority TEXT NOT NULL CHECK (authority IN ('consolidation', 'direct', 'inference', 'external')),
    sensitivity TEXT NOT NULL CHECK (sensitivity IN ('public', 'internal', 'confidential', 'restricted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Ensure proper scoping
    CONSTRAINT memory_scope_consistency CHECK (
        (scope = 'Global' AND role_id IS NULL AND owner_agent_id IS NULL) OR
        (scope = 'Role' AND role_id IS NOT NULL AND owner_agent_id IS NULL) OR
        (scope = 'Private' AND role_id IS NULL AND owner_agent_id IS NOT NULL)
    ),
    UNIQUE (tenant_id, scope, role_id, owner_agent_id, value)
);

CREATE INDEX idx_memory_tenant_scope ON memory_records (tenant_id, scope);
CREATE INDEX idx_memory_tenant_role ON memory_records (tenant_id, role_id) WHERE scope = 'Role';
CREATE INDEX idx_memory_tenant_agent ON memory_records (tenant_id, owner_agent_id) WHERE scope = 'Private';
CREATE INDEX idx_memory_sensitivity ON memory_records (sensitivity);
CREATE INDEX idx_memory_deleted ON memory_records (deleted_at) WHERE deleted_at IS NOT NULL;

-- Memory revisions for CAS-based updates
CREATE TABLE IF NOT EXISTS memory_revisions (
    revision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID NOT NULL REFERENCES memory_records(memory_id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    value TEXT NOT NULL,
    confidence REAL NOT NULL,
    source_episode_ids UUID[] NOT NULL DEFAULT '{}',
    authority TEXT NOT NULL,
    sensitivity TEXT NOT NULL,
    changed_by TEXT NOT NULL, -- principal subject ID
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    change_reason TEXT,
    previous_hash BYTEA NOT NULL,
    new_hash BYTEA NOT NULL,
    UNIQUE (memory_id, version)
);

CREATE INDEX idx_memory_revisions_memory ON memory_revisions (memory_id, version DESC);

-- Memory embeddings for vector search (requires pgvector)
CREATE TABLE IF NOT EXISTS memory_embeddings (
    embedding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID NOT NULL REFERENCES memory_records(memory_id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    embedding VECTOR(1536) NOT NULL,
    model_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (memory_id, model_version)
);

CREATE INDEX idx_memory_embeddings_tenant ON memory_embeddings (tenant_id);
CREATE INDEX idx_memory_embeddings_memory ON memory_embeddings (memory_id);

-- Enable Row Level Security
ALTER TABLE memory_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_embeddings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for memory_records

-- Global scope: all authenticated principals in tenant can read
CREATE POLICY memory_records_global_read ON memory_records
    FOR SELECT
    USING (
        scope = 'Global' 
        AND tenant_id = current_setting('asi.tenant_id', true)
        AND current_setting('asi.principal_id', true) IS NOT NULL
    );

-- Role scope: only principals with matching role can read
CREATE POLICY memory_records_role_read ON memory_records
    FOR SELECT
    USING (
        scope = 'Role' 
        AND tenant_id = current_setting('asi.tenant_id', true)
        AND role_id = ANY(string_to_array(current_setting('asi.roles', true), ','))
    );

-- Private scope: only owning agent can read
CREATE POLICY memory_records_private_read ON memory_records
    FOR SELECT
    USING (
        scope = 'Private' 
        AND tenant_id = current_setting('asi.tenant_id', true)
        AND owner_agent_id = current_setting('asi.agent_id', true)
    );

-- Write policies - only broker service can write (using FORCE RLS bypass)
-- These are enforced at application level via broker service identity

-- Revisions: only broker can insert/select
CREATE POLICY memory_revisions_broker_all ON memory_revisions
    FOR ALL
    USING (current_setting('asi.service_role', true) = 'memory_broker')
    WITH CHECK (current_setting('asi.service_role', true) = 'memory_broker');

-- Embeddings: only broker can write, tenants can read their own
CREATE POLICY memory_embeddings_tenant_read ON memory_embeddings
    FOR SELECT
    USING (tenant_id = current_setting('asi.tenant_id', true));

CREATE POLICY memory_embeddings_broker_write ON memory_embeddings
    FOR INSERT
    WITH CHECK (current_setting('asi.service_role', true) = 'memory_broker');

-- Function to set tenant/principal context for RLS
CREATE OR REPLACE FUNCTION set_asi_context(
    p_tenant_id TEXT,
    p_principal_id TEXT,
    p_roles TEXT[],
    p_agent_id TEXT DEFAULT NULL,
    p_service_role TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    PERFORM set_config('asi.tenant_id', p_tenant_id, FALSE);
    PERFORM set_config('asi.principal_id', p_principal_id, FALSE);
    PERFORM set_config('asi.roles', array_to_string(p_roles, ','), FALSE);
    PERFORM set_config('asi.agent_id', COALESCE(p_agent_id, ''), FALSE);
    PERFORM set_config('asi.service_role', COALESCE(p_service_role, ''), FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clear context
CREATE OR REPLACE FUNCTION clear_asi_context() RETURNS VOID AS $$
BEGIN
    PERFORM set_config('asi.tenant_id', '', FALSE);
    PERFORM set_config('asi.principal_id', '', FALSE);
    PERFORM set_config('asi.roles', '', FALSE);
    PERFORM set_config('asi.agent_id', '', FALSE);
    PERFORM set_config('asi.service_role', '', FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute on context functions to authenticated roles
GRANT EXECUTE ON FUNCTION set_asi_context TO authenticated;
GRANT EXECUTE ON FUNCTION clear_asi_context TO authenticated;

-- Index for vector similarity search (requires pgvector >= 0.5.0)
-- CREATE INDEX memory_embeddings_vector_idx ON memory_embeddings 
--     USING hnsw (embedding vector_cosine_ops);