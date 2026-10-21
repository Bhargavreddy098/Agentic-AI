-- ASI Agent System - Observations Schema
-- Migration 008: Base observations and exchange tables (Task 28)
-- Depends on: 001-control.sql (tenants), 004-memory-rls.sql (memory_records)
-- PostgreSQL 17 compatible

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Observations: structured facts derived from episodes/memory
CREATE TABLE IF NOT EXISTS observations (
    observation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN ('Global', 'Role', 'Private')),
    role_id TEXT,                       -- For Role scope
    owner_agent_id TEXT,                -- For Private scope
    entity TEXT NOT NULL,               -- Subject entity
    relation TEXT NOT NULL,             -- Predicate/relation
    value TEXT NOT NULL,                -- Object value
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ NOT NULL,
    source_episode_ids UUID[] NOT NULL DEFAULT '{}',
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    revision INTEGER NOT NULL DEFAULT 1,
    authority TEXT NOT NULL CHECK (authority IN ('consolidation', 'direct', 'inference', 'external')) DEFAULT 'inference',
    sensitivity TEXT NOT NULL CHECK (sensitivity IN ('public', 'internal', 'confidential', 'restricted')) DEFAULT 'internal',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure proper scoping
    CONSTRAINT observation_scope_consistency CHECK (
        (scope = 'Global' AND role_id IS NULL AND owner_agent_id IS NULL) OR
        (scope = 'Role' AND role_id IS NOT NULL AND owner_agent_id IS NULL) OR
        (scope = 'Private' AND role_id IS NULL AND owner_agent_id IS NOT NULL)
    ),
    UNIQUE (tenant_id, scope, role_id, owner_agent_id, entity, relation, value)
);

CREATE INDEX idx_observations_tenant_scope ON observations (tenant_id, scope);
CREATE INDEX idx_observations_tenant_entity ON observations (tenant_id, entity, relation);
CREATE INDEX idx_observations_validity ON observations (valid_until) WHERE valid_until > NOW();
CREATE INDEX idx_observations_confidence ON observations (confidence DESC);

-- Observation revisions for CAS-based updates
CREATE TABLE IF NOT EXISTS observation_revisions (
    revision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    observation_id UUID NOT NULL REFERENCES observations(observation_id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    entity TEXT NOT NULL,
    relation TEXT NOT NULL,
    value TEXT NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    confidence REAL NOT NULL,
    authority TEXT NOT NULL,
    sensitivity TEXT NOT NULL,
    changed_by TEXT NOT NULL, -- principal subject ID
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    change_reason TEXT,
    UNIQUE (observation_id, revision)
);

CREATE INDEX idx_observation_revisions_obs ON observation_revisions (observation_id, revision DESC);

-- Observation exchange: sharing observations between tenants/agents
CREATE TABLE IF NOT EXISTS observation_exchange (
    exchange_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    source_observation_id UUID NOT NULL REFERENCES observations(observation_id) ON DELETE CASCADE,
    target_tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    target_scope TEXT NOT NULL CHECK (target_scope IN ('Global', 'Role', 'Private')),
    target_role_id TEXT,
    target_owner_agent_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'revoked')) DEFAULT 'pending',
    proposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    decided_by TEXT,

    CONSTRAINT exchange_target_consistency CHECK (
        (target_scope = 'Global' AND target_role_id IS NULL AND target_owner_agent_id IS NULL) OR
        (target_scope = 'Role' AND target_role_id IS NOT NULL AND target_owner_agent_id IS NULL) OR
        (target_scope = 'Private' AND target_role_id IS NULL AND target_owner_agent_id IS NOT NULL)
    ),
    UNIQUE (source_observation_id, target_tenant_id, target_scope, target_role_id, target_owner_agent_id)
);

CREATE INDEX idx_observation_exchange_source ON observation_exchange (source_observation_id);
CREATE INDEX idx_observation_exchange_target_status ON observation_exchange (target_tenant_id, status);

-- Enable RLS on observation tables
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['observations','observation_revisions','observation_exchange'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY observation_tenant_scope ON %I USING (tenant_id=current_setting(''asi.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''asi.tenant_id'',true))', relation);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', relation);
  END LOOP;
END $$;

-- Grant control service role access (to be created by deployment)
-- GRANT SELECT, INSERT, UPDATE ON observations, observation_revisions, observation_exchange TO asi_control;