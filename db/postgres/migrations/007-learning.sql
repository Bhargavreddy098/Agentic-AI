-- ASI Agent System - Learning/Evaluation Schema
-- Migration 007: Base learning and evaluation tables (Task 10)
-- Depends on: 001-control.sql (tenants), 004-memory-rls.sql (memory_records)
-- PostgreSQL 17 compatible

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Evaluation jobs: human-reviewed task cases and goldens
CREATE TABLE IF NOT EXISTS evaluation_jobs (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    dataset_ref JSONB NOT NULL, -- Reference to eval dataset
    criteria JSONB NOT NULL, -- Evaluation criteria
    status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','cancelled')) DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    results JSONB
);

CREATE INDEX idx_evaluation_jobs_tenant_status ON evaluation_jobs (tenant_id, status);

-- Evaluation cases: individual test cases
CREATE TABLE IF NOT EXISTS evaluation_cases (
    case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES evaluation_jobs(job_id) ON DELETE CASCADE,
    input JSONB NOT NULL,
    expected_output JSONB,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evaluation_cases_job ON evaluation_cases (job_id);

-- Evaluation results: per-case results
CREATE TABLE IF NOT EXISTS evaluation_results (
    result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES evaluation_jobs(job_id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES evaluation_cases(case_id) ON DELETE CASCADE,
    actual_output JSONB,
    score REAL CHECK (score >= 0 AND score <= 1),
    passed BOOLEAN,
    error TEXT,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (job_id, case_id)
);

CREATE INDEX idx_evaluation_results_job ON evaluation_results (job_id);
CREATE INDEX idx_evaluation_results_case ON evaluation_results (case_id);

-- Telemetry events: redacted metadata for observability
CREATE TABLE IF NOT EXISTS telemetry_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('model_call','tool_execution','memory_write','skill_install','approval','run_start','run_complete','run_failed')),
    event_data JSONB NOT NULL, -- Redacted payload
    correlation_id TEXT, -- For tracing
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retention_until TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_telemetry_tenant_time ON telemetry_events (tenant_id, timestamp DESC);
CREATE INDEX idx_telemetry_correlation ON telemetry_events (correlation_id);
CREATE INDEX idx_telemetry_retention ON telemetry_events (retention_until) WHERE retention_until < NOW() + INTERVAL '1 day';

-- Enable RLS on learning tables
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['evaluation_jobs','evaluation_cases','evaluation_results','telemetry_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY learning_tenant_scope ON %I USING (tenant_id=current_setting(''asi.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''asi.tenant_id'',true))', relation);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', relation);
  END LOOP;
END $$;

-- Grant control service role access (to be created by deployment)
-- GRANT SELECT, INSERT, UPDATE ON evaluation_jobs, evaluation_cases, evaluation_results, telemetry_events TO asi_control;