-- Worker identities remain distinct from owner sessions. This does not enable execution.
ALTER TABLE identity.principals ADD CONSTRAINT uq_principal_kind UNIQUE (principal_id, kind);
CREATE TABLE identity.worker_connections (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL REFERENCES identity.workspaces(workspace_id) ON DELETE RESTRICT,
    worker_principal_id uuid NOT NULL,
    principal_kind text NOT NULL DEFAULT 'worker' CHECK (principal_kind = 'worker'),
    public_key bytea NOT NULL CHECK (octet_length(public_key) BETWEEN 32 AND 4096),
    capabilities jsonb NOT NULL CHECK (jsonb_typeof(capabilities) = 'array' AND jsonb_array_length(capabilities) <= 128),
    image_digest bytea CHECK (image_digest IS NULL OR octet_length(image_digest) = 32),
    last_seen_at timestamptz,
    revoked_at timestamptz,
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    FOREIGN KEY (worker_principal_id, principal_kind)
        REFERENCES identity.principals(principal_id, kind) ON DELETE RESTRICT
);
CREATE TABLE identity.secret_references (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    owner_principal_id uuid NOT NULL,
    store text NOT NULL CHECK (store = 'windows_dpapi'),
    opaque_ref text NOT NULL CHECK (char_length(opaque_ref) BETWEEN 1 AND 4096),
    purpose text NOT NULL CHECK (char_length(purpose) BETWEEN 1 AND 128),
    credential_version bigint NOT NULL CHECK (credential_version >= 1),
    revoked_at timestamptz,
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, opaque_ref, credential_version),
    FOREIGN KEY (workspace_id, owner_principal_id)
        REFERENCES identity.workspaces(workspace_id, owner_principal_id) ON DELETE RESTRICT
);
COMMENT ON TABLE identity.secret_references IS 'Reference metadata only; never store credential values or credential ciphertext in this table.';
ALTER TABLE identity.worker_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.worker_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.secret_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.secret_references FORCE ROW LEVEL SECURITY;
CREATE POLICY worker_connection_scope ON identity.worker_connections
    USING (workspace_id=ops.current_workspace_id()) WITH CHECK (workspace_id=ops.current_workspace_id());
CREATE POLICY secret_reference_scope ON identity.secret_references
    USING (workspace_id=ops.current_workspace_id()) WITH CHECK (workspace_id=ops.current_workspace_id());
