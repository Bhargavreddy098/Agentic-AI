-- ASI Agent System - Control State Schema
-- Migration 001: Control tables for ingress, sessions, runs, leases, outbox, effects, checkpoints
-- PostgreSQL 17 compatible

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tenants table (referenced by all tenant-qualified tables)
CREATE TABLE IF NOT EXISTS tenants (
    tenant_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ingress events: deduplicated platform events with outbox projection
CREATE TABLE IF NOT EXISTS ingress_events (
    ingress_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    external_message_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    content_hash BYTEA NOT NULL,
    content_json JSONB NOT NULL,
    attachment_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    projection_status TEXT NOT NULL DEFAULT 'pending' CHECK (projection_status IN ('pending', 'projected', 'failed')),
    UNIQUE (tenant_id, platform, external_message_id)
);

CREATE INDEX idx_ingress_events_tenant_received ON ingress_events (tenant_id, received_at DESC);
CREATE INDEX idx_ingress_events_projection ON ingress_events (projection_status) WHERE projection_status = 'pending';

-- Sessions: long-lived conversation containers
CREATE TABLE IF NOT EXISTS sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    principal_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('observe', 'assist', 'execute')) DEFAULT 'observe',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_sessions_tenant ON sessions (tenant_id);

-- Runs: unit of work within a session with writer epoch fencing
CREATE TABLE IF NOT EXISTS runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    parent_run_id UUID REFERENCES runs(run_id) ON DELETE SET NULL,
    writer_epoch BIGINT NOT NULL DEFAULT 0,
    mode TEXT NOT NULL CHECK (mode IN ('observe', 'assist', 'execute')) DEFAULT 'observe',
    status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'queued', 'running', 'waiting_approval', 'suspended', 'finalizing', 'completed', 'failed', 'cancelled', 'budget_exhausted')),
    deadline_at TIMESTAMPTZ NOT NULL,
    budget_account_id UUID,
    checkpoint_ref UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    UNIQUE (run_id, session_id, tenant_id)
);

CREATE INDEX idx_runs_session ON runs (session_id, created_at DESC);
CREATE INDEX idx_runs_tenant_status ON runs (tenant_id, status) WHERE status IN ('queued', 'running', 'waiting_approval');

-- Writer leases: row-locked session lease with epoch
CREATE TABLE IF NOT EXISTS writer_leases (
    session_id UUID PRIMARY KEY REFERENCES sessions(session_id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
    writer_epoch BIGINT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    renewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Checkpoints: deterministic run state snapshots
CREATE TABLE IF NOT EXISTS checkpoints (
    checkpoint_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    writer_epoch BIGINT NOT NULL,
    state_json JSONB NOT NULL,
    completed_task_ids UUID[] NOT NULL DEFAULT '{}',
    completed_effect_ids UUID[] NOT NULL DEFAULT '{}',
    model_result_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checkpoints_run ON checkpoints (run_id, version DESC);

-- Outbox: durable task/effect dispatch relay
CREATE TABLE IF NOT EXISTS outbox (
    outbox_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
    payload_type TEXT NOT NULL CHECK (payload_type IN ('task', 'effect', 'delivery', 'approval', 'ingress_projection')),
    payload_json JSONB NOT NULL,
    idempotency_key TEXT NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed', 'dead_letter')),
    last_error TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX idx_outbox_tenant_status ON outbox (tenant_id, status, scheduled_at) WHERE status = 'pending';

-- Effect journal: durable intent before execution
CREATE TABLE IF NOT EXISTS effect_journal (
    effect_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
    task_id UUID,
    effect_type TEXT NOT NULL CHECK (effect_type IN ('tool', 'mcp', 'a2a', 'memory_publish', 'skill_install', 'approval_request')),
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    input_hash BYTEA NOT NULL,
    artifact_hash BYTEA,
    idempotency_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'authorized', 'executing', 'succeeded', 'failed', 'unknown', 'reconciled')),
    result_json JSONB,
    error_json JSONB,
    receipt_id UUID,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    authorized_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX idx_effect_journal_run ON effect_journal (run_id, created_at);
CREATE INDEX idx_effect_journal_status ON effect_journal (status) WHERE status IN ('planned', 'authorized', 'executing');

-- Budget accounts: tenant-level budget tracking
CREATE TABLE IF NOT EXISTS budget_accounts (
    account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    account_name TEXT NOT NULL,
    monthly_limit_micro_usd BIGINT NOT NULL,
    current_spend_micro_usd BIGINT NOT NULL DEFAULT 0,
    token_limit BIGINT NOT NULL DEFAULT 0 CHECK (token_limit BETWEEN 0 AND 9007199254740991),
    charged_tokens NUMERIC(40,0) NOT NULL DEFAULT 0 CHECK (charged_tokens >= 0),
    suspended BOOLEAN NOT NULL DEFAULT FALSE,
    period_start TIMESTAMPTZ NOT NULL DEFAULT DATE_TRUNC('month', NOW()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, account_name)
);

-- Budget reservations: atomic spend reservations
CREATE TABLE IF NOT EXISTS budget_reservations (
    reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES budget_accounts(account_id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
    reserved_tokens BIGINT NOT NULL,
    reserved_cost_micro_usd BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'released', 'unknown')),
    settled_tokens BIGINT,
    settled_cost_micro_usd BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at TIMESTAMPTZ
);

CREATE INDEX idx_budget_reservations_run ON budget_reservations (run_id);
CREATE INDEX idx_budget_reservations_account_status ON budget_reservations (account_id, status) WHERE status = 'reserved';

-- Approvals: human-in-the-loop decisions bound to exact input
CREATE TABLE IF NOT EXISTS approvals (
    approval_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
    effect_id UUID NOT NULL REFERENCES effect_journal(effect_id) ON DELETE CASCADE,
    approver_principal_id TEXT,
    policy_version TEXT NOT NULL,
    input_hash BYTEA NOT NULL,
    artifact_hash BYTEA,
    decision TEXT CHECK (decision IN ('approve', 'reject')),
    nonce TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, nonce)
);

CREATE INDEX idx_approvals_run ON approvals (run_id, created_at DESC);
CREATE INDEX idx_approvals_pending ON approvals (tenant_id, expires_at) WHERE decision IS NULL;

-- Audit receipts: append-only signed receipts
CREATE TABLE IF NOT EXISTS audit_receipts (
    receipt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(session_id) ON DELETE SET NULL,
    run_id UUID REFERENCES runs(run_id) ON DELETE SET NULL,
    task_id UUID,
    effect_id UUID REFERENCES effect_journal(effect_id) ON DELETE SET NULL,
    sequence BIGINT NOT NULL,
    previous_hash BYTEA NOT NULL,
    input_hash BYTEA NOT NULL,
    output_hash BYTEA,
    status TEXT NOT NULL CONSTRAINT audit_receipts_status_check CHECK (status IN ('accepted', 'queued', 'running', 'completed', 'failed', 'cancelled', 'unknown')),
    mode TEXT NOT NULL CHECK (mode IN ('observe', 'assist', 'execute')),
    policy_version TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    key_id TEXT NOT NULL,
    signature BYTEA NOT NULL,
    UNIQUE (tenant_id, sequence)
);

CREATE INDEX idx_audit_receipts_tenant_seq ON audit_receipts (tenant_id, sequence);

-- Delivery outbox: reliable response delivery
CREATE TABLE IF NOT EXISTS delivery_outbox (
    delivery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    run_id UUID REFERENCES runs(run_id) ON DELETE SET NULL,
    channel TEXT NOT NULL,
    destination_identity TEXT NOT NULL,
    content_hash BYTEA NOT NULL,
    content_json JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'unknown', 'suppressed')),
    remote_receipt_ref TEXT,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

CREATE INDEX idx_delivery_outbox_tenant_status ON delivery_outbox (tenant_id, status, created_at) WHERE status = 'pending';

-- Grant the control service role access (to be created by deployment)
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO asi_control;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO asi_control;