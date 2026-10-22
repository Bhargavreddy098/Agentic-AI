-- Stage 02 Migration 003: Idempotency, Transactional Outbox, and Consumer Receipts Foundations
-- Authorities: docs/backend/04-DATABASE.md, docs/backend/07-ORCHESTRATION-AND-RECOVERY.md

CREATE TABLE IF NOT EXISTS control.idempotency_records (
    workspace_id uuid NOT NULL REFERENCES identity.workspaces(workspace_id) ON DELETE RESTRICT,
    principal_id uuid NOT NULL REFERENCES identity.principals(principal_id) ON DELETE RESTRICT,
    operation_key text NOT NULL CHECK (char_length(btrim(operation_key)) > 0),
    idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) > 0),
    request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    status text NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed')),
    response_status integer CHECK (response_status IS NULL OR (response_status >= 100 AND response_status <= 599)),
    response_body jsonb,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (workspace_id, principal_id, operation_key, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires_at
    ON control.idempotency_records (expires_at);

ALTER TABLE control.idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.idempotency_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS idempotency_workspace_isolation ON control.idempotency_records;
CREATE POLICY idempotency_workspace_isolation
    ON control.idempotency_records
    USING (workspace_id = ops.current_workspace_id())
    WITH CHECK (workspace_id = ops.current_workspace_id());

CREATE TABLE IF NOT EXISTS control.outbox (
    outbox_seq bigserial PRIMARY KEY,
    event_id uuid NOT NULL UNIQUE,
    workspace_id uuid NOT NULL REFERENCES identity.workspaces(workspace_id) ON DELETE RESTRICT,
    project_id uuid,
    topic text NOT NULL CHECK (char_length(btrim(topic)) > 0),
    payload jsonb NOT NULL,
    payload_digest text NOT NULL CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatched', 'dead_letter')),
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    dispatched_at timestamptz,
    CONSTRAINT fk_outbox_workspace_project
        FOREIGN KEY (workspace_id, project_id)
        REFERENCES product.projects (workspace_id, project_id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending_schedule
    ON control.outbox (status, available_at, outbox_seq)
    WHERE status = 'pending';

ALTER TABLE control.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.outbox FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outbox_workspace_isolation ON control.outbox;
CREATE POLICY outbox_workspace_isolation
    ON control.outbox
    USING (workspace_id = ops.current_workspace_id())
    WITH CHECK (workspace_id = ops.current_workspace_id());

CREATE TABLE IF NOT EXISTS control.consumer_receipts (
    workspace_id uuid NOT NULL REFERENCES identity.workspaces(workspace_id) ON DELETE RESTRICT,
    consumer_name text NOT NULL CHECK (char_length(btrim(consumer_name)) > 0),
    event_id uuid NOT NULL REFERENCES control.outbox(event_id) ON DELETE RESTRICT,
    processed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (workspace_id, consumer_name, event_id)
);

ALTER TABLE control.consumer_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.consumer_receipts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consumer_receipts_workspace_isolation ON control.consumer_receipts;
CREATE POLICY consumer_receipts_workspace_isolation
    ON control.consumer_receipts
    USING (workspace_id = ops.current_workspace_id())
    WITH CHECK (workspace_id = ops.current_workspace_id());
