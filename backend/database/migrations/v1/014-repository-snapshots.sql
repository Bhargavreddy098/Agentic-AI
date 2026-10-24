-- Expand-only Stage 04 reconciliation. No existing data is rewritten.
CREATE TABLE product.repository_snapshots (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    commit_sha text CHECK (commit_sha IS NULL OR commit_sha ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),
    tree_digest bytea NOT NULL CHECK (octet_length(tree_digest)=32),
    artifact_id uuid NOT NULL,
    index_status text NOT NULL DEFAULT 'not_indexed' CHECK (index_status='not_indexed'),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id,project_id,id),
    FOREIGN KEY (workspace_id,project_id) REFERENCES product.projects(workspace_id,project_id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id,project_id,artifact_id) REFERENCES product.artifacts(workspace_id,project_id,id) ON DELETE RESTRICT
);
CREATE INDEX snapshots_project ON product.repository_snapshots(workspace_id,project_id,created_at,id);
ALTER TABLE product.repository_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE product.repository_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY snapshot_scope ON product.repository_snapshots USING (workspace_id=ops.current_workspace_id()) WITH CHECK (workspace_id=ops.current_workspace_id());
CREATE TRIGGER snapshots_immutable BEFORE UPDATE OR DELETE ON product.repository_snapshots FOR EACH ROW EXECUTE FUNCTION product.reject_immutable_change();CREATE TABLE ops.settings (
    workspace_id uuid NOT NULL,
    owner_scope uuid NOT NULL,
    key text NOT NULL CHECK (key='preferences'),
    value jsonb NOT NULL CHECK (jsonb_typeof(value)='object'),
    schema_version integer NOT NULL CHECK (schema_version=1),
    version bigint NOT NULL DEFAULT 1 CHECK (version>=1),
    PRIMARY KEY (workspace_id,owner_scope,key),
    FOREIGN KEY (workspace_id,owner_scope) REFERENCES identity.workspaces(workspace_id,owner_principal_id) ON DELETE RESTRICT
);
ALTER TABLE ops.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.settings FORCE ROW LEVEL SECURITY;
CREATE POLICY settings_owner ON ops.settings USING (workspace_id=ops.current_workspace_id() AND owner_scope=NULLIF(current_setting('asi.principal_id',true),'')::uuid) WITH CHECK (workspace_id=ops.current_workspace_id() AND owner_scope=NULLIF(current_setting('asi.principal_id',true),'')::uuid);
CREATE TABLE identity.export_destinations (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, project_id uuid NOT NULL, authorized_by uuid NOT NULL,
 canonical_path text NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(workspace_id,project_id,id),
 FOREIGN KEY(workspace_id,project_id) REFERENCES product.projects(workspace_id,project_id) ON DELETE RESTRICT,
 FOREIGN KEY(workspace_id,authorized_by) REFERENCES identity.workspaces(workspace_id,owner_principal_id) ON DELETE RESTRICT
);
ALTER TABLE identity.export_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.export_destinations FORCE ROW LEVEL SECURITY;
CREATE POLICY export_scope ON identity.export_destinations USING(workspace_id=ops.current_workspace_id()) WITH CHECK(workspace_id=ops.current_workspace_id());
