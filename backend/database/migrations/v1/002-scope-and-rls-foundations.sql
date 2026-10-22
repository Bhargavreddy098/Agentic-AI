-- Stage 02 Migration 002: Identity/Product Scope Foundations, Composite Foreign Keys, and RLS
-- Authorities: docs/backend/04-DATABASE.md, docs/backend/08-SECURITY-AND-RUNTIME.md

CREATE TABLE IF NOT EXISTS identity.principals (
    principal_id uuid PRIMARY KEY,
    kind text NOT NULL CHECK (kind IN ('owner', 'worker', 'system')),
    display_name text NOT NULL CHECK (char_length(btrim(display_name)) > 0),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS identity.workspaces (
    workspace_id uuid PRIMARY KEY,
    owner_principal_id uuid NOT NULL REFERENCES identity.principals(principal_id) ON DELETE RESTRICT,
    slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
    display_name text NOT NULL CHECK (char_length(btrim(display_name)) > 0),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner_principal
    ON identity.workspaces (owner_principal_id);

CREATE TABLE IF NOT EXISTS product.projects (
    project_id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL REFERENCES identity.workspaces(workspace_id) ON DELETE RESTRICT,
    slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
    title text NOT NULL CHECK (char_length(btrim(title)) > 0),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_projects_workspace_project UNIQUE (workspace_id, project_id),
    CONSTRAINT uq_projects_workspace_slug UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_projects_workspace_updated
    ON product.projects (workspace_id, updated_at DESC);

ALTER TABLE product.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE product.projects FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_workspace_isolation ON product.projects;
CREATE POLICY projects_workspace_isolation
    ON product.projects
    USING (workspace_id = ops.current_workspace_id())
    WITH CHECK (workspace_id = ops.current_workspace_id());
