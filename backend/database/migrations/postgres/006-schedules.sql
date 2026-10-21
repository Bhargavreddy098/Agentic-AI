-- 006-schedules.sql: Durable heartbeat scheduling
-- Prerequisites: 001-control.sql, 009-identity-grants.sql, 010-control-qualification.sql

-- Heartbeat schedules table
CREATE TABLE IF NOT EXISTS heartbeat_schedules (
    schedule_id        TEXT PRIMARY KEY,
    tenant_id          TEXT NOT NULL,
    session_id         TEXT NOT NULL,
    principal_id       TEXT NOT NULL,
    interval_seconds   INTEGER NOT NULL CHECK (interval_seconds >= 10 AND interval_seconds <= 86400),
    next_run_at        TIMESTAMPTZ NOT NULL,
    timezone           TEXT NOT NULL DEFAULT 'UTC',
    quiet_hours_start  TIME,
    quiet_hours_end    TIME,
    max_cost_micro_usd BIGINT NOT NULL DEFAULT 0,
    max_tokens         BIGINT NOT NULL DEFAULT 0,
    budget_account_id  UUID,
    status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    cancelled_at       TIMESTAMPTZ
);

-- Index for finding due heartbeats
CREATE INDEX IF NOT EXISTS idx_heartbeat_schedules_due
    ON heartbeat_schedules (next_run_at)
    WHERE status = 'active';

-- Index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_heartbeat_schedules_tenant
    ON heartbeat_schedules (tenant_id, session_id);

-- Heartbeat execution log for audit and deduplication
CREATE TABLE IF NOT EXISTS heartbeat_executions (
    execution_id       TEXT PRIMARY KEY,
    schedule_id        TEXT NOT NULL REFERENCES heartbeat_schedules(schedule_id) ON DELETE CASCADE,
    scheduled_at       TIMESTAMPTZ NOT NULL,
    executed_at        TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    result             TEXT NOT NULL CHECK (result IN ('noop', 'completed', 'failed', 'action_needed', 'budget_exceeded')),
    details            JSONB,
    budget_reservation_id TEXT,
    idempotency_key    TEXT NOT NULL UNIQUE
);

-- Index for execution lookups
CREATE INDEX IF NOT EXISTS idx_heartbeat_executions_schedule
    ON heartbeat_executions (schedule_id, scheduled_at DESC);

-- RLS policies
ALTER TABLE heartbeat_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE heartbeat_executions ENABLE ROW LEVEL SECURITY;

-- Tenant isolation for heartbeat_schedules
DROP POLICY IF EXISTS tenant_isolation_heartbeat_schedules ON heartbeat_schedules;
CREATE POLICY tenant_isolation_heartbeat_schedules ON heartbeat_schedules
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- Tenant isolation for heartbeat_executions
DROP POLICY IF EXISTS tenant_isolation_heartbeat_executions ON heartbeat_executions;
CREATE POLICY tenant_isolation_heartbeat_executions ON heartbeat_executions
    USING (schedule_id IN (SELECT schedule_id FROM heartbeat_schedules WHERE tenant_id = current_setting('app.current_tenant', true)))
    WITH CHECK (schedule_id IN (SELECT schedule_id FROM heartbeat_schedules WHERE tenant_id = current_setting('app.current_tenant', true)));