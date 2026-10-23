-- Stage 05 Migration 009: Goal, requirement, plan, and contract identities/revisions.
-- Authorities: docs/backend/04-DATABASE.md, docs/backend/11-IMPLEMENTATION-ROADMAP.md
-- These tables establish immutable identities and revision constraints only.
-- Stage 08/09 supply generation, planning, and approval workflows.

CREATE TABLE product.goals (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    intent text NOT NULL CHECK (char_length(btrim(intent)) BETWEEN 1 AND 16384),
    status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted','clarifying','planning','awaiting_approval','approved','executing','blocked','achieved','cancelled')),
    active_requirement_revision_id uuid,
    parent_goal_id uuid,
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, project_id, id),
    FOREIGN KEY (workspace_id, project_id, conversation_id)
        REFERENCES product.conversations (workspace_id, project_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, parent_goal_id)
        REFERENCES product.goals (workspace_id, id) ON DELETE RESTRICT
);

CREATE TABLE planning.requirement_revisions (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    goal_id uuid NOT NULL,
    revision bigint NOT NULL CHECK (revision >= 1),
    schema_version integer NOT NULL CHECK (schema_version >= 1),
    digest bytea NOT NULL CHECK (octet_length(digest) = 32),
    document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object' AND octet_length(document::text) <= 1048576),
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, project_id, id),
    UNIQUE (goal_id, revision),
    FOREIGN KEY (workspace_id, project_id, goal_id)
        REFERENCES product.goals (workspace_id, project_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, created_by)
        REFERENCES identity.workspaces (workspace_id, owner_principal_id) ON DELETE RESTRICT
);

CREATE TABLE planning.requirements (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    requirement_revision_id uuid NOT NULL,
    stable_key text NOT NULL CHECK (char_length(btrim(stable_key)) BETWEEN 1 AND 128),
    kind text NOT NULL CHECK (char_length(btrim(kind)) BETWEEN 1 AND 64),
    priority text NOT NULL CHECK (priority IN ('must','should','could')),
    statement text NOT NULL CHECK (char_length(btrim(statement)) BETWEEN 1 AND 8192),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, project_id, id),
    UNIQUE (requirement_revision_id, stable_key),
    FOREIGN KEY (workspace_id, project_id, requirement_revision_id)
        REFERENCES planning.requirement_revisions (workspace_id, project_id, id) ON DELETE RESTRICT
);

CREATE TABLE planning.criteria (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    requirement_id uuid NOT NULL,
    stable_key text NOT NULL CHECK (char_length(btrim(stable_key)) BETWEEN 1 AND 128),
    required boolean NOT NULL,
    method text NOT NULL CHECK (char_length(btrim(method)) BETWEEN 1 AND 128),
    expected jsonb NOT NULL CHECK (octet_length(expected::text) <= 65536),
    environment jsonb NOT NULL CHECK (jsonb_typeof(environment) = 'object' AND octet_length(environment::text) <= 65536),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    UNIQUE (requirement_id, stable_key),
    FOREIGN KEY (workspace_id, project_id, requirement_id)
        REFERENCES planning.requirements (workspace_id, project_id, id) ON DELETE RESTRICT
);

CREATE TABLE planning.plans (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    goal_id uuid NOT NULL,
    current_revision_id uuid,
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, project_id, id),
    FOREIGN KEY (workspace_id, project_id, goal_id)
        REFERENCES product.goals (workspace_id, project_id, id) ON DELETE RESTRICT
);

CREATE TABLE planning.plan_revisions (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    revision bigint NOT NULL CHECK (revision >= 1),
    requirement_revision_id uuid NOT NULL,
    digest bytea NOT NULL CHECK (octet_length(digest) = 32),
    layers jsonb NOT NULL CHECK (jsonb_typeof(layers) = 'object' AND octet_length(layers::text) <= 1048576),
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, project_id, id),
    UNIQUE (plan_id, revision),
    FOREIGN KEY (workspace_id, project_id, plan_id)
        REFERENCES planning.plans (workspace_id, project_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, project_id, requirement_revision_id)
        REFERENCES planning.requirement_revisions (workspace_id, project_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, created_by)
        REFERENCES identity.workspaces (workspace_id, owner_principal_id) ON DELETE RESTRICT
);

ALTER TABLE planning.plans ADD CONSTRAINT fk_plans_current_revision
    FOREIGN KEY (workspace_id, current_revision_id)
    REFERENCES planning.plan_revisions (workspace_id, id) ON DELETE RESTRICT;

CREATE TABLE planning.plan_steps (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    plan_revision_id uuid NOT NULL,
    step_key text NOT NULL CHECK (char_length(btrim(step_key)) BETWEEN 1 AND 128),
    objective text NOT NULL CHECK (char_length(btrim(objective)) BETWEEN 1 AND 8192),
    deliverable_schema jsonb NOT NULL CHECK (jsonb_typeof(deliverable_schema) = 'object' AND octet_length(deliverable_schema::text) <= 65536),
    capabilities jsonb NOT NULL CHECK (jsonb_typeof(capabilities) = 'array' AND jsonb_array_length(capabilities) <= 128),
    budget_ceiling bigint NOT NULL CHECK (budget_ceiling >= 0),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, project_id, id),
    UNIQUE (workspace_id, project_id, plan_revision_id, id),
    UNIQUE (plan_revision_id, step_key),
    FOREIGN KEY (workspace_id, project_id, plan_revision_id)
        REFERENCES planning.plan_revisions (workspace_id, project_id, id) ON DELETE RESTRICT
);

CREATE TABLE planning.step_dependencies (
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    plan_revision_id uuid NOT NULL,
    step_id uuid NOT NULL,
    requires_step_id uuid NOT NULL,
    PRIMARY KEY (workspace_id, plan_revision_id, step_id, requires_step_id),
    CHECK (step_id <> requires_step_id),
    FOREIGN KEY (workspace_id, project_id, plan_revision_id, step_id)
        REFERENCES planning.plan_steps (workspace_id, project_id, plan_revision_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, project_id, plan_revision_id, requires_step_id)
        REFERENCES planning.plan_steps (workspace_id, project_id, plan_revision_id, id) ON DELETE RESTRICT
);

CREATE TABLE planning.build_contracts (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    goal_id uuid NOT NULL,
    current_revision_id uuid,
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, project_id, id),
    FOREIGN KEY (workspace_id, project_id, goal_id)
        REFERENCES product.goals (workspace_id, project_id, id) ON DELETE RESTRICT
);

CREATE TABLE planning.contract_revisions (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    contract_id uuid NOT NULL,
    revision bigint NOT NULL CHECK (revision >= 1),
    plan_revision_id uuid NOT NULL,
    requirement_revision_id uuid NOT NULL,
    schema_version integer NOT NULL CHECK (schema_version >= 1),
    canonicalizer_version text NOT NULL CHECK (char_length(btrim(canonicalizer_version)) BETWEEN 1 AND 64),
    digest bytea NOT NULL CHECK (octet_length(digest) = 32),
    document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object' AND octet_length(document::text) <= 1048576),
    supersedes_id uuid,
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, project_id, id),
    UNIQUE (contract_id, revision),
    FOREIGN KEY (workspace_id, project_id, contract_id)
        REFERENCES planning.build_contracts (workspace_id, project_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, project_id, plan_revision_id)
        REFERENCES planning.plan_revisions (workspace_id, project_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, project_id, requirement_revision_id)
        REFERENCES planning.requirement_revisions (workspace_id, project_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, supersedes_id)
        REFERENCES planning.contract_revisions (workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, created_by)
        REFERENCES identity.workspaces (workspace_id, owner_principal_id) ON DELETE RESTRICT
);

ALTER TABLE planning.build_contracts ADD CONSTRAINT fk_contracts_current_revision
    FOREIGN KEY (workspace_id, current_revision_id)
    REFERENCES planning.contract_revisions (workspace_id, id) ON DELETE RESTRICT;

CREATE TABLE planning.decisions (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    goal_id uuid NOT NULL,
    contract_revision_id uuid,
    status text NOT NULL CHECK (status IN ('accepted','challenged','rejected','alternative','user_decision')),
    proposal text NOT NULL CHECK (char_length(btrim(proposal)) BETWEEN 1 AND 16384),
    rationale text NOT NULL CHECK (char_length(btrim(rationale)) BETWEEN 1 AND 16384),
    alternatives jsonb NOT NULL CHECK (jsonb_typeof(alternatives) = 'array' AND octet_length(alternatives::text) <= 65536),
    source_refs jsonb NOT NULL CHECK (jsonb_typeof(source_refs) = 'array' AND octet_length(source_refs::text) <= 65536),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    FOREIGN KEY (workspace_id, project_id, goal_id)
        REFERENCES product.goals (workspace_id, project_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, contract_revision_id)
        REFERENCES planning.contract_revisions (workspace_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_goals_project ON product.goals (workspace_id, project_id, created_at DESC);
CREATE INDEX idx_requirement_revisions_goal ON planning.requirement_revisions (workspace_id, goal_id, revision DESC);
CREATE INDEX idx_plan_revisions_plan ON planning.plan_revisions (workspace_id, plan_id, revision DESC);
CREATE INDEX idx_plan_steps_revision ON planning.plan_steps (workspace_id, plan_revision_id);
CREATE INDEX idx_contract_revisions_contract ON planning.contract_revisions (workspace_id, contract_id, revision DESC);

CREATE TRIGGER requirement_revisions_immutable BEFORE UPDATE OR DELETE ON planning.requirement_revisions
    FOR EACH ROW EXECUTE FUNCTION product.reject_immutable_change();
CREATE TRIGGER requirements_immutable BEFORE UPDATE OR DELETE ON planning.requirements
    FOR EACH ROW EXECUTE FUNCTION product.reject_immutable_change();
CREATE TRIGGER criteria_immutable BEFORE UPDATE OR DELETE ON planning.criteria
    FOR EACH ROW EXECUTE FUNCTION product.reject_immutable_change();
CREATE TRIGGER plan_revisions_immutable BEFORE UPDATE OR DELETE ON planning.plan_revisions
    FOR EACH ROW EXECUTE FUNCTION product.reject_immutable_change();
CREATE TRIGGER plan_steps_immutable BEFORE UPDATE OR DELETE ON planning.plan_steps
    FOR EACH ROW EXECUTE FUNCTION product.reject_immutable_change();
CREATE TRIGGER step_dependencies_immutable BEFORE UPDATE OR DELETE ON planning.step_dependencies
    FOR EACH ROW EXECUTE FUNCTION product.reject_immutable_change();
CREATE TRIGGER contract_revisions_immutable BEFORE UPDATE OR DELETE ON planning.contract_revisions
    FOR EACH ROW EXECUTE FUNCTION product.reject_immutable_change();
CREATE TRIGGER decisions_immutable BEFORE UPDATE OR DELETE ON planning.decisions
    FOR EACH ROW EXECUTE FUNCTION product.reject_immutable_change();

DO $$ DECLARE subject text; BEGIN
    FOREACH subject IN ARRAY ARRAY['goals'] LOOP
        EXECUTE format('ALTER TABLE product.%I ENABLE ROW LEVEL SECURITY', subject);
        EXECUTE format('ALTER TABLE product.%I FORCE ROW LEVEL SECURITY', subject);
        EXECUTE format('CREATE POLICY goal_scope ON product.%I USING (workspace_id=ops.current_workspace_id()) WITH CHECK (workspace_id=ops.current_workspace_id())', subject);
    END LOOP;
    FOREACH subject IN ARRAY ARRAY['requirement_revisions','requirements','criteria','plans','plan_revisions','plan_steps','step_dependencies','build_contracts','contract_revisions','decisions'] LOOP
        EXECUTE format('ALTER TABLE planning.%I ENABLE ROW LEVEL SECURITY', subject);
        EXECUTE format('ALTER TABLE planning.%I FORCE ROW LEVEL SECURITY', subject);
        EXECUTE format('CREATE POLICY planning_scope ON planning.%I USING (workspace_id=ops.current_workspace_id()) WITH CHECK (workspace_id=ops.current_workspace_id())', subject);
    END LOOP;
END $$;
