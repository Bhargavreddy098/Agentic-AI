-- ASI Agent System - Skills Schema
-- Migration 005: Base skill manifests and trust records (Task 18)
-- Depends on: 001-control.sql (tenants), 010-control-qualification.sql (for writer fences)
-- PostgreSQL 17 compatible

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Skill versions: immutable published skill artifacts
CREATE TABLE IF NOT EXISTS skill_versions (
    skill_version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    skill_id TEXT NOT NULL,
    skill_version TEXT NOT NULL,
    publisher_id TEXT NOT NULL,
    publisher_signature BYTEA NOT NULL,
    artifact_hash BYTEA NOT NULL CHECK (octet_length(artifact_hash)=32),
    required_capabilities TEXT[] NOT NULL CHECK (array_length(required_capabilities,1) BETWEEN 1 AND 128),
    applicable_task_types TEXT[] NOT NULL CHECK (array_length(applicable_task_types,1) BETWEEN 1 AND 128),
    script_manifests JSONB NOT NULL,
    trust_status TEXT NOT NULL CHECK (trust_status IN ('trusted','pending','revoked')) DEFAULT 'pending',
    manifest_json JSONB NOT NULL,
    canonical_bytes BYTEA NOT NULL,
    manifest_hash BYTEA NOT NULL CHECK (octet_length(manifest_hash)=32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, skill_id, skill_version),
    UNIQUE (tenant_id, manifest_hash)
);

CREATE INDEX idx_skill_versions_tenant_trust ON skill_versions (tenant_id, trust_status);
CREATE INDEX idx_skill_versions_publisher ON skill_versions (tenant_id, publisher_id);

-- Skill installs: per-tenant active skill selections
CREATE TABLE IF NOT EXISTS skill_installs (
    install_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    skill_version_id UUID NOT NULL REFERENCES skill_versions(skill_version_id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('installed','disabled','revoked')) DEFAULT 'installed',
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    UNIQUE (tenant_id, skill_version_id)
);

CREATE INDEX idx_skill_installs_tenant_status ON skill_installs (tenant_id, status);

-- Skill trust records: publisher key management
CREATE TABLE IF NOT EXISTS skill_trust_records (
    trust_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    publisher_id TEXT NOT NULL,
    public_key BYTEA NOT NULL CHECK (octet_length(public_key) BETWEEN 32 AND 4096),
    status TEXT NOT NULL CHECK (status IN ('active','revoked')) DEFAULT 'active',
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, publisher_id)
);

CREATE INDEX idx_skill_trust_tenant ON skill_trust_records (tenant_id, status);

-- Enable RLS on skill tables
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['skill_versions','skill_installs','skill_trust_records'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY skill_tenant_scope ON %I USING (tenant_id=current_setting(''asi.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''asi.tenant_id'',true))', relation);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', relation);
  END LOOP;
END $$;

-- Grant control service role access (to be created by deployment)
-- GRANT SELECT, INSERT, UPDATE ON skill_versions, skill_installs, skill_trust_records TO asi_control;