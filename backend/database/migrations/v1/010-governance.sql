-- Stage 05 Migration 010: Policy, approvals, grants, budgets, usage, and audit.
-- Authorities: docs/backend/04-DATABASE.md, docs/backend/05-API-CONTRACTS.md,
-- docs/backend/08-SECURITY-AND-RUNTIME.md, docs/backend/11-IMPLEMENTATION-ROADMAP.md

CREATE TABLE control.policy_revisions (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    revision bigint NOT NULL CHECK (revision >= 1),
    digest bytea NOT NULL CHECK (octet_length(digest) = 32),
    rules jsonb NOT NULL CHECK (jsonb_typeof(rules) = 'object' AND octet_length(rules::text) <= 65536),
    created_by uuid NOT NULL,
    activated_at timestamptz,
    superseded_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, revision),
    FOREIGN KEY (workspace_id, created_by)
        REFERENCES identity.workspaces (workspace_id, owner_principal_id) ON DELETE RESTRICT,
    CHECK (superseded_at IS NULL OR activated_at IS NOT NULL),
    CHECK (superseded_at IS NULL OR superseded_at >= activated_at)
);

CREATE UNIQUE INDEX uq_policy_active_per_workspace
    ON control.policy_revisions (workspace_id)
    WHERE activated_at IS NOT NULL AND superseded_at IS NULL;

CREATE TABLE control.capability_grants (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    principal_id uuid NOT NULL,
    capability text NOT NULL CHECK (capability ~ '^[a-z][a-z0-9_.:-]{2,127}$'),
    resource_scope jsonb NOT NULL CHECK (jsonb_typeof(resource_scope) = 'object' AND octet_length(resource_scope::text) <= 8192),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    contract_revision_id uuid,
    created_by uuid NOT NULL,
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, project_id, id),
    FOREIGN KEY (workspace_id, project_id)
        REFERENCES product.projects (workspace_id, project_id) ON DELETE RESTRICT,
    FOREIGN KEY (principal_id)
        REFERENCES identity.principals (principal_id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, contract_revision_id)
        REFERENCES planning.contract_revisions (workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, created_by)
        REFERENCES identity.workspaces (workspace_id, owner_principal_id) ON DELETE RESTRICT,
    CHECK (expires_at > created_at),
    CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX idx_capability_grants_lookup
    ON control.capability_grants (workspace_id, project_id, principal_id, capability)
    WHERE revoked_at IS NULL;

CREATE TABLE control.approvals (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid,
    kind text NOT NULL CHECK (kind IN ('contract','effect')),
    contract_revision_id uuid NOT NULL,
    effect_id uuid,
    input_digest bytea NOT NULL CHECK (octet_length(input_digest) = 32),
    policy_revision_id uuid NOT NULL,
    approver_principal_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','rejected','expired','revoked')),
    nonce_hash bytea NOT NULL CHECK (octet_length(nonce_hash) = 32),
    expires_at timestamptz NOT NULL,
    decided_at timestamptz,
    consumed_at timestamptz,
    decision_reason text CHECK (decision_reason IS NULL OR char_length(decision_reason) <= 2048),
    scope_summary jsonb NOT NULL CHECK (jsonb_typeof(scope_summary) = 'object' AND octet_length(scope_summary::text) <= 8192),
    cost_ceiling_micro_usd bigint CHECK (cost_ceiling_micro_usd IS NULL OR cost_ceiling_micro_usd >= 0),
    diff_ref text CHECK (diff_ref IS NULL OR char_length(diff_ref) <= 2048),
    consequences text NOT NULL CHECK (char_length(consequences) BETWEEN 1 AND 8192),
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    FOREIGN KEY (workspace_id, project_id)
        REFERENCES product.projects (workspace_id, project_id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, contract_revision_id)
        REFERENCES planning.contract_revisions (workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, policy_revision_id)
        REFERENCES control.policy_revisions (workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, approver_principal_id)
        REFERENCES identity.workspaces (workspace_id, owner_principal_id) ON DELETE RESTRICT,
    FOREIGN KEY (requested_by)
        REFERENCES identity.principals (principal_id) ON DELETE RESTRICT,
    CHECK ((kind = 'effect') = (effect_id IS NOT NULL)),
    CHECK (expires_at > created_at),
    CHECK (decided_at IS NULL OR decided_at >= created_at),
    CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE UNIQUE INDEX uq_approval_pending_contract
    ON control.approvals (workspace_id, contract_revision_id, input_digest)
    WHERE kind = 'contract' AND state = 'pending';

CREATE INDEX idx_approvals_scope ON control.approvals (workspace_id, project_id, state, created_at DESC);

CREATE TABLE control.budget_accounts (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid,
    scope_kind text NOT NULL CHECK (scope_kind IN ('workspace','project','run')),
    scope_id uuid NOT NULL,
    limit_micro_usd bigint NOT NULL CHECK (limit_micro_usd >= 0),
    spent_micro_usd bigint NOT NULL DEFAULT 0 CHECK (spent_micro_usd >= 0),
    reserved_micro_usd bigint NOT NULL DEFAULT 0 CHECK (reserved_micro_usd >= 0),
    created_by uuid NOT NULL,
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, scope_kind, scope_id),
    FOREIGN KEY (workspace_id, project_id)
        REFERENCES product.projects (workspace_id, project_id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, created_by)
        REFERENCES identity.workspaces (workspace_id, owner_principal_id) ON DELETE RESTRICT,
    CHECK ((scope_kind = 'workspace') = (project_id IS NULL)),
    CHECK ((scope_kind = 'workspace') = (scope_id = workspace_id) OR scope_kind <> 'workspace')
);

CREATE TABLE control.budget_reservations (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid,
    budget_account_id uuid NOT NULL,
    workspace_account_id uuid,
    operation_key text NOT NULL CHECK (char_length(btrim(operation_key)) BETWEEN 1 AND 256),
    ceiling_micro_usd bigint NOT NULL CHECK (ceiling_micro_usd >= 0),
    actual_micro_usd bigint CHECK (actual_micro_usd IS NULL OR actual_micro_usd >= 0),
    state text NOT NULL DEFAULT 'held' CHECK (state IN ('held','settled','released','unknown')),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    UNIQUE (budget_account_id, operation_key),
    FOREIGN KEY (workspace_id, budget_account_id)
        REFERENCES control.budget_accounts (workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, workspace_account_id)
        REFERENCES control.budget_accounts (workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, project_id)
        REFERENCES product.projects (workspace_id, project_id) ON DELETE RESTRICT,
    CHECK (workspace_account_id IS NULL OR workspace_account_id <> budget_account_id),
    CHECK ((state = 'settled') = (actual_micro_usd IS NOT NULL))
);

CREATE INDEX idx_budget_reservations_account
    ON control.budget_reservations (workspace_id, budget_account_id, state, created_at DESC);

CREATE TABLE ops.usage_entries (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid,
    run_id uuid,
    operation_key text NOT NULL CHECK (char_length(btrim(operation_key)) BETWEEN 1 AND 256),
    provider_request_id text CHECK (provider_request_id IS NULL OR char_length(provider_request_id) <= 512),
    category text NOT NULL CHECK (char_length(btrim(category)) BETWEEN 1 AND 64),
    units bigint NOT NULL DEFAULT 0 CHECK (units >= 0),
    pricing_revision text CHECK (pricing_revision IS NULL OR char_length(pricing_revision) <= 128),
    estimated_micro_usd bigint NOT NULL CHECK (estimated_micro_usd >= 0),
    actual_micro_usd bigint CHECK (actual_micro_usd IS NULL OR actual_micro_usd >= 0),
    state text NOT NULL CHECK (state IN ('estimated','actual','unknown','reconciled')),
    reconciliation_version integer NOT NULL DEFAULT 0 CHECK (reconciliation_version >= 0),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, operation_key, category, reconciliation_version),
    FOREIGN KEY (workspace_id, project_id)
        REFERENCES product.projects (workspace_id, project_id) ON DELETE RESTRICT,
    CHECK ((state IN ('actual','reconciled')) = (actual_micro_usd IS NOT NULL))
);

CREATE INDEX idx_usage_scope ON ops.usage_entries (workspace_id, project_id, created_at DESC);
CREATE INDEX idx_usage_run ON ops.usage_entries (workspace_id, run_id, created_at DESC) WHERE run_id IS NOT NULL;

CREATE TABLE ops.audit_heads (
    workspace_id uuid PRIMARY KEY,
    sequence bigint NOT NULL DEFAULT 0 CHECK (sequence >= 0),
    digest bytea NOT NULL CHECK (octet_length(digest) = 32),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE ops.audit_events (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    sequence bigint NOT NULL CHECK (sequence >= 1),
    actor_id uuid NOT NULL,
    action text NOT NULL CHECK (action ~ '^[a-z][a-z0-9_.:-]{2,127}$'),
    target_ref text NOT NULL CHECK (char_length(target_ref) BETWEEN 1 AND 1024),
    trace_id text NOT NULL CHECK (char_length(trace_id) BETWEEN 1 AND 128),
    safe_metadata jsonb NOT NULL CHECK (jsonb_typeof(safe_metadata) = 'object' AND octet_length(safe_metadata::text) <= 4096),
    previous_digest bytea NOT NULL CHECK (octet_length(previous_digest) = 32),
    digest bytea NOT NULL CHECK (octet_length(digest) = 32),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, sequence),
    FOREIGN KEY (workspace_id)
        REFERENCES identity.workspaces (workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (actor_id)
        REFERENCES identity.principals (principal_id) ON DELETE RESTRICT
);

CREATE INDEX idx_audit_events_sequence ON ops.audit_events (workspace_id, sequence DESC);

CREATE OR REPLACE FUNCTION control.protect_policy_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Policy revisions cannot be deleted'; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
        OR NEW.revision IS DISTINCT FROM OLD.revision OR NEW.digest IS DISTINCT FROM OLD.digest
        OR NEW.rules IS DISTINCT FROM OLD.rules OR NEW.created_by IS DISTINCT FROM OLD.created_by
        OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Policy revision content is immutable';
    END IF;
    IF OLD.activated_at IS NOT NULL AND NEW.activated_at IS DISTINCT FROM OLD.activated_at THEN
        RAISE EXCEPTION 'Policy activation cannot be rewritten';
    END IF;
    IF OLD.superseded_at IS NOT NULL AND NEW.superseded_at IS NULL THEN
        RAISE EXCEPTION 'Policy supersession cannot be reversed';
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER policy_revision_immutable BEFORE UPDATE OR DELETE ON control.policy_revisions
    FOR EACH ROW EXECUTE FUNCTION control.protect_policy_revision();

CREATE OR REPLACE FUNCTION control.protect_approval_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Approvals cannot be deleted'; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
        OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.kind IS DISTINCT FROM OLD.kind
        OR NEW.contract_revision_id IS DISTINCT FROM OLD.contract_revision_id
        OR NEW.effect_id IS DISTINCT FROM OLD.effect_id OR NEW.input_digest IS DISTINCT FROM OLD.input_digest
        OR NEW.policy_revision_id IS DISTINCT FROM OLD.policy_revision_id
        OR NEW.approver_principal_id IS DISTINCT FROM OLD.approver_principal_id
        OR NEW.requested_by IS DISTINCT FROM OLD.requested_by OR NEW.nonce_hash IS DISTINCT FROM OLD.nonce_hash
        OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.scope_summary IS DISTINCT FROM OLD.scope_summary
        OR NEW.cost_ceiling_micro_usd IS DISTINCT FROM OLD.cost_ceiling_micro_usd
        OR NEW.consequences IS DISTINCT FROM OLD.consequences THEN
        RAISE EXCEPTION 'Approval binding is immutable';
    END IF;
    IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
        (OLD.state = 'pending' AND NEW.state IN ('approved','rejected','expired','revoked'))
        OR (OLD.state = 'approved' AND NEW.state = 'revoked' AND OLD.consumed_at IS NULL)
    ) THEN
        RAISE EXCEPTION 'Invalid approval state transition';
    END IF;
    IF OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at THEN
        RAISE EXCEPTION 'Approval consumption cannot be rewritten';
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER approval_binding_immutable BEFORE UPDATE OR DELETE ON control.approvals
    FOR EACH ROW EXECUTE FUNCTION control.protect_approval_binding();

CREATE OR REPLACE FUNCTION control.protect_reservation_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Budget reservations cannot be deleted'; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
        OR NEW.budget_account_id IS DISTINCT FROM OLD.budget_account_id
        OR NEW.operation_key IS DISTINCT FROM OLD.operation_key
        OR NEW.ceiling_micro_usd IS DISTINCT FROM OLD.ceiling_micro_usd
        OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Budget reservation identity is immutable';
    END IF;
    IF OLD.state IN ('settled','released') AND NEW.state IS DISTINCT FROM OLD.state THEN
        RAISE EXCEPTION 'Terminal budget reservations cannot change state';
    END IF;
    IF OLD.state = 'unknown' AND NEW.state NOT IN ('unknown','settled','released') THEN
        RAISE EXCEPTION 'Unknown budget reservations must be reconciled';
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER reservation_transition_guard BEFORE UPDATE OR DELETE ON control.budget_reservations
    FOR EACH ROW EXECUTE FUNCTION control.protect_reservation_transition();

CREATE TRIGGER usage_entries_immutable BEFORE UPDATE OR DELETE ON ops.usage_entries
    FOR EACH ROW EXECUTE FUNCTION product.reject_immutable_change();
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON ops.audit_events
    FOR EACH ROW EXECUTE FUNCTION product.reject_immutable_change();

DO $$ DECLARE subject text; BEGIN
    FOREACH subject IN ARRAY ARRAY['policy_revisions','capability_grants','approvals','budget_accounts','budget_reservations'] LOOP
        EXECUTE format('ALTER TABLE control.%I ENABLE ROW LEVEL SECURITY', subject);
        EXECUTE format('ALTER TABLE control.%I FORCE ROW LEVEL SECURITY', subject);
        EXECUTE format('CREATE POLICY governance_scope ON control.%I USING (workspace_id=ops.current_workspace_id()) WITH CHECK (workspace_id=ops.current_workspace_id())', subject);
    END LOOP;
    FOREACH subject IN ARRAY ARRAY['usage_entries','audit_heads','audit_events'] LOOP
        EXECUTE format('ALTER TABLE ops.%I ENABLE ROW LEVEL SECURITY', subject);
        EXECUTE format('ALTER TABLE ops.%I FORCE ROW LEVEL SECURITY', subject);
        EXECUTE format('CREATE POLICY ops_scope ON ops.%I USING (workspace_id=ops.current_workspace_id()) WITH CHECK (workspace_id=ops.current_workspace_id())', subject);
    END LOOP;
END $$;
