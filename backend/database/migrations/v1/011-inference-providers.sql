-- Stage 06 Migration 011: Provider abstraction, model registry, and inference attempts.
-- Authorities: docs/backend/04-DATABASE.md, docs/backend/05-API-CONTRACTS.md,
-- docs/backend/08-SECURITY-AND-RUNTIME.md, docs/backend/09-PROVIDERS-AND-MEMORY.md,
-- docs/backend/11-IMPLEMENTATION-ROADMAP.md

-- Provider discovery is a durable operation. Existing product operations still use input_ref;
-- inference operations carry a safe request projection in input.
ALTER TABLE control.operations ALTER COLUMN input_ref DROP NOT NULL;
ALTER TABLE control.operations ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE control.operations ADD COLUMN input jsonb
    CHECK (input IS NULL OR (jsonb_typeof(input) = 'object' AND octet_length(input::text) <= 16384));
ALTER TABLE control.operations DROP CONSTRAINT IF EXISTS operations_kind_check;
ALTER TABLE control.operations ADD CONSTRAINT operations_kind_check
    CHECK (kind IN ('upload.complete','snapshot.create','artifact.export','provider.discovery','provider.probe'));
ALTER TABLE control.operations DROP CONSTRAINT IF EXISTS operations_result_type_check;
ALTER TABLE control.operations ADD CONSTRAINT operations_result_type_check
    CHECK (result_type IS NULL OR result_type IN ('artifact','repository_snapshot','provider','model'));
ALTER TABLE control.operations ADD CONSTRAINT operations_input_present
    CHECK (input_ref IS NOT NULL OR input IS NOT NULL);

CREATE TABLE inference.provider_connections (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('openai')),
    display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 200),
    endpoint_policy jsonb NOT NULL CHECK (
        jsonb_typeof(endpoint_policy) = 'object'
        AND octet_length(endpoint_policy::text) <= 4096
        AND endpoint_policy->>'baseUrl' = 'https://api.openai.com/v1'
    ),
    auth_method text NOT NULL DEFAULT 'api_key' CHECK (auth_method = 'api_key'),
    secret_reference_id uuid,
    status text NOT NULL DEFAULT 'unavailable' CHECK (status IN ('unavailable','healthy','degraded','disabled')),
    enabled boolean NOT NULL DEFAULT true,
    privacy_policy jsonb NOT NULL CHECK (jsonb_typeof(privacy_policy) = 'object' AND octet_length(privacy_policy::text) <= 8192),
    health jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(health) = 'object' AND octet_length(health::text) <= 4096),
    last_checked_at timestamptz,
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    FOREIGN KEY (workspace_id) REFERENCES identity.workspaces(workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, secret_reference_id) REFERENCES identity.secret_references(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, created_by) REFERENCES identity.workspaces(workspace_id, owner_principal_id) ON DELETE RESTRICT,
    CHECK (status <> 'disabled' OR enabled = false)
);

CREATE INDEX idx_provider_connections_workspace ON inference.provider_connections (workspace_id, enabled, status);

CREATE TABLE inference.models (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    provider_connection_id uuid NOT NULL,
    external_model_id text NOT NULL CHECK (char_length(btrim(external_model_id)) BETWEEN 1 AND 200),
    revision text NOT NULL CHECK (char_length(btrim(revision)) BETWEEN 1 AND 200),
    capabilities jsonb NOT NULL CHECK (jsonb_typeof(capabilities) = 'object' AND octet_length(capabilities::text) <= 32768),
    context_limit integer NOT NULL CHECK (context_limit > 0),
    max_output_tokens integer NOT NULL CHECK (max_output_tokens > 0),
    qualification_ref text CHECK (qualification_ref IS NULL OR char_length(qualification_ref) <= 512),
    pricing_revision text NOT NULL CHECK (char_length(btrim(pricing_revision)) BETWEEN 1 AND 128),
    pricing jsonb NOT NULL CHECK (jsonb_typeof(pricing) = 'object' AND octet_length(pricing::text) <= 16384),
    availability text NOT NULL DEFAULT 'unknown' CHECK (availability IN ('available','unavailable','unknown')),
    discovered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    UNIQUE (provider_connection_id, external_model_id, revision),
    FOREIGN KEY (workspace_id, provider_connection_id) REFERENCES inference.provider_connections(workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_models_provider ON inference.models (workspace_id, provider_connection_id, availability);

CREATE TABLE inference.model_calls (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid,
    run_id uuid,
    task_id uuid,
    operation_key text NOT NULL CHECK (char_length(btrim(operation_key)) BETWEEN 1 AND 256),
    provider_connection_id uuid NOT NULL,
    model_id uuid NOT NULL,
    routing_decision jsonb NOT NULL CHECK (jsonb_typeof(routing_decision) = 'object' AND octet_length(routing_decision::text) <= 32768),
    input_digest bytea NOT NULL CHECK (octet_length(input_digest) = 32),
    output_ref text CHECK (output_ref IS NULL OR char_length(output_ref) <= 2048),
    state text NOT NULL DEFAULT 'running' CHECK (state IN ('running','succeeded','failed','cancelled','unknown')),
    external_request_id text CHECK (external_request_id IS NULL OR char_length(external_request_id) <= 512),
    latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
    usage jsonb CHECK (usage IS NULL OR (jsonb_typeof(usage) = 'object' AND octet_length(usage::text) <= 16384)),
    pricing_revision text CHECK (pricing_revision IS NULL OR char_length(pricing_revision) <= 128),
    estimated_micro_usd bigint NOT NULL CHECK (estimated_micro_usd >= 0),
    actual_micro_usd bigint CHECK (actual_micro_usd IS NULL OR actual_micro_usd >= 0),
    safe_error jsonb CHECK (safe_error IS NULL OR (jsonb_typeof(safe_error) = 'object' AND octet_length(safe_error::text) <= 4096)),
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, operation_key),
    FOREIGN KEY (workspace_id, project_id) REFERENCES product.projects(workspace_id, project_id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, provider_connection_id) REFERENCES inference.provider_connections(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, model_id) REFERENCES inference.models(workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_model_calls_provider ON inference.model_calls (workspace_id, provider_connection_id, created_at DESC);
CREATE INDEX idx_model_calls_model ON inference.model_calls (workspace_id, model_id, created_at DESC);

CREATE OR REPLACE FUNCTION inference.protect_model_call() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Model calls cannot be deleted'; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
        OR NEW.operation_key IS DISTINCT FROM OLD.operation_key
        OR NEW.provider_connection_id IS DISTINCT FROM OLD.provider_connection_id
        OR NEW.model_id IS DISTINCT FROM OLD.model_id
        OR NEW.input_digest IS DISTINCT FROM OLD.input_digest
        OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Model call identity is immutable';
    END IF;
    IF OLD.state IN ('succeeded','failed','cancelled') AND NEW.state IS DISTINCT FROM OLD.state THEN
        RAISE EXCEPTION 'Terminal model calls cannot change state';
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER model_call_identity_immutable BEFORE UPDATE OR DELETE ON inference.model_calls
    FOR EACH ROW EXECUTE FUNCTION inference.protect_model_call();

DO $$ DECLARE subject text; BEGIN
    FOREACH subject IN ARRAY ARRAY['provider_connections','models','model_calls'] LOOP
        EXECUTE format('ALTER TABLE inference.%I ENABLE ROW LEVEL SECURITY', subject);
        EXECUTE format('ALTER TABLE inference.%I FORCE ROW LEVEL SECURITY', subject);
        EXECUTE format('CREATE POLICY inference_scope ON inference.%I USING (workspace_id=ops.current_workspace_id()) WITH CHECK (workspace_id=ops.current_workspace_id())', subject);
    END LOOP;
END $$;
