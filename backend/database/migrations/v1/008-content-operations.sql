CREATE TABLE product.artifact_links (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    artifact_id uuid NOT NULL,
    subject_kind text NOT NULL CHECK (subject_kind IN ('message','conversation','upload')),
    subject_id uuid NOT NULL,
    purpose text NOT NULL CHECK (purpose IN ('message_content','attachment','upload')),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id,id),
    UNIQUE (workspace_id,project_id,artifact_id,subject_kind,subject_id,purpose),
    FOREIGN KEY (workspace_id,project_id,artifact_id) REFERENCES product.artifacts(workspace_id,project_id,id) ON DELETE RESTRICT
);
CREATE TRIGGER artifact_links_immutable BEFORE UPDATE OR DELETE ON product.artifact_links FOR EACH ROW EXECUTE FUNCTION product.reject_immutable_change();
CREATE TABLE control.operations (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('upload.complete','snapshot.create','artifact.export')),
    state text NOT NULL CHECK (state IN ('queued','running','blocked','succeeded','failed','cancelled')),
    request_digest bytea NOT NULL CHECK (octet_length(request_digest)=32),
    input_ref uuid NOT NULL,
    result_type text CHECK (result_type IN ('artifact','repository_snapshot')),
    result_id uuid,
    lease_owner uuid,
    lease_epoch bigint NOT NULL DEFAULT 0 CHECK (lease_epoch>=0),
    lease_expires_at timestamptz,
    deadline_at timestamptz NOT NULL,
    available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    safe_error jsonb CHECK (safe_error IS NULL OR octet_length(safe_error::text)<=4096),
    version bigint NOT NULL DEFAULT 1 CHECK (version>=1),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id,id), UNIQUE (workspace_id,project_id,id),
    CHECK ((result_type IS NULL) = (result_id IS NULL)),
    FOREIGN KEY (workspace_id,project_id) REFERENCES product.projects(workspace_id,project_id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id,project_id,input_ref) REFERENCES product.artifacts(workspace_id,project_id,id) ON DELETE RESTRICT
);
CREATE INDEX idx_queued_operations ON control.operations(available_at,id) WHERE state='queued';
CREATE INDEX idx_expired_operations ON control.operations(lease_expires_at) WHERE state='running';
ALTER TABLE product.artifact_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE product.artifact_links FORCE ROW LEVEL SECURITY;
CREATE POLICY link_scope ON product.artifact_links USING (workspace_id=ops.current_workspace_id()) WITH CHECK (workspace_id=ops.current_workspace_id());
ALTER TABLE control.operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.operations FORCE ROW LEVEL SECURITY;
CREATE POLICY operation_scope ON control.operations USING (workspace_id=ops.current_workspace_id()) WITH CHECK (workspace_id=ops.current_workspace_id());
