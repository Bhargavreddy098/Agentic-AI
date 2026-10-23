-- Product aggregates and immutable content references. Execution remains disabled.
CREATE TABLE identity.workspace_roots (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    authorized_by uuid NOT NULL,
    canonical_path text NOT NULL CHECK (char_length(canonical_path) BETWEEN 1 AND 32768),
    repository_kind text NOT NULL CHECK (repository_kind='git'),
    revoked_at timestamptz,
    version bigint NOT NULL DEFAULT 1 CHECK (version>=1),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id,id),
    FOREIGN KEY (workspace_id,authorized_by) REFERENCES identity.workspaces(workspace_id,owner_principal_id) ON DELETE RESTRICT
);
ALTER TABLE product.projects ADD COLUMN description text NOT NULL DEFAULT '' CHECK (char_length(description)<=8192);
ALTER TABLE product.projects ADD COLUMN kind text NOT NULL DEFAULT 'greenfield' CHECK (kind IN ('greenfield','existing'));
ALTER TABLE product.projects ADD COLUMN workspace_root_ref uuid;
ALTER TABLE product.projects ADD CONSTRAINT fk_project_root FOREIGN KEY (workspace_id,workspace_root_ref)
    REFERENCES identity.workspace_roots(workspace_id,id) ON DELETE RESTRICT;
CREATE TABLE product.artifacts (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    digest bytea NOT NULL CHECK (octet_length(digest)=32),
    bytes bigint NOT NULL CHECK (bytes>=0),
    media_type text NOT NULL CHECK (char_length(media_type) BETWEEN 1 AND 256),
    storage_key text NOT NULL CHECK (char_length(storage_key) BETWEEN 1 AND 1024),
    status text NOT NULL CHECK (status IN ('staged','quarantined','available','deleted')),
    classification text NOT NULL CHECK (classification IN ('public','internal','confidential','restricted')),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id,id), UNIQUE (workspace_id,project_id,id),
    FOREIGN KEY (workspace_id,project_id) REFERENCES product.projects(workspace_id,project_id) ON DELETE RESTRICT
);
CREATE TABLE product.conversations (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    version bigint NOT NULL DEFAULT 1 CHECK (version>=1),
    last_sequence bigint NOT NULL DEFAULT 0 CHECK (last_sequence>=0),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id,id), UNIQUE (workspace_id,project_id,id),
    FOREIGN KEY (workspace_id,project_id) REFERENCES product.projects(workspace_id,project_id) ON DELETE RESTRICT
);
CREATE TABLE product.messages (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    sequence bigint NOT NULL CHECK (sequence>0),
    author_principal_id uuid REFERENCES identity.principals(principal_id) ON DELETE RESTRICT,
    role text NOT NULL CHECK (role IN ('user','assistant','system')),
    content_ref uuid NOT NULL,
    trust_label text NOT NULL CHECK (trust_label IN ('user_input','untrusted_generated','trusted_system')),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id,id), UNIQUE (workspace_id,project_id,id), UNIQUE (conversation_id,sequence),
    FOREIGN KEY (workspace_id,project_id,conversation_id) REFERENCES product.conversations(workspace_id,project_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id,project_id,content_ref) REFERENCES product.artifacts(workspace_id,project_id,id) ON DELETE RESTRICT
);
CREATE TABLE product.message_attachments (
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    message_id uuid NOT NULL,
    artifact_id uuid NOT NULL,
    PRIMARY KEY (workspace_id,message_id,artifact_id),
    FOREIGN KEY (workspace_id,project_id,message_id) REFERENCES product.messages(workspace_id,project_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id,project_id,artifact_id) REFERENCES product.artifacts(workspace_id,project_id,id) ON DELETE RESTRICT
);
CREATE TABLE product.uploads (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    artifact_id uuid,
    filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 255),
    media_type text NOT NULL CHECK (char_length(media_type) BETWEEN 1 AND 256),
    expected_digest bytea NOT NULL CHECK (octet_length(expected_digest)=32),
    expected_bytes bigint NOT NULL CHECK (expected_bytes BETWEEN 0 AND 16777216),
    received_bytes bigint NOT NULL DEFAULT 0 CHECK (received_bytes>=0 AND received_bytes<=expected_bytes),
    state text NOT NULL DEFAULT 'staged' CHECK (state IN ('staged','uploaded','quarantined','available','rejected','expired')),
    expires_at timestamptz NOT NULL,
    version bigint NOT NULL DEFAULT 1 CHECK (version>=1),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (workspace_id,id), UNIQUE (workspace_id,project_id,id),
    FOREIGN KEY (workspace_id,project_id) REFERENCES product.projects(workspace_id,project_id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id,project_id,artifact_id) REFERENCES product.artifacts(workspace_id,project_id,id) ON DELETE RESTRICT
);
CREATE INDEX idx_conversations_project ON product.conversations(workspace_id,project_id,created_at,id);
CREATE INDEX idx_messages_conversation ON product.messages(workspace_id,conversation_id,sequence);
CREATE INDEX idx_artifacts_project ON product.artifacts(workspace_id,project_id,created_at,id);
CREATE INDEX idx_uploads_expiry ON product.uploads(expires_at) WHERE state='staged';
CREATE OR REPLACE FUNCTION product.reject_immutable_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Immutable product content cannot be updated or deleted'; END; $$;
CREATE TRIGGER messages_immutable BEFORE UPDATE OR DELETE ON product.messages FOR EACH ROW EXECUTE FUNCTION product.reject_immutable_change();
CREATE TRIGGER attachments_immutable BEFORE UPDATE OR DELETE ON product.message_attachments FOR EACH ROW EXECUTE FUNCTION product.reject_immutable_change();
CREATE OR REPLACE FUNCTION product.protect_artifact_bytes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Artifact purge requires an explicit retention workflow'; END IF;
    IF NEW.digest IS DISTINCT FROM OLD.digest OR NEW.bytes IS DISTINCT FROM OLD.bytes
        OR NEW.storage_key IS DISTINCT FROM OLD.storage_key OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
        OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.media_type IS DISTINCT FROM OLD.media_type
        OR NEW.classification IS DISTINCT FROM OLD.classification THEN
        RAISE EXCEPTION 'Artifact bytes and scope are immutable';
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER artifacts_immutable BEFORE UPDATE OR DELETE ON product.artifacts FOR EACH ROW EXECUTE FUNCTION product.protect_artifact_bytes();
DO $$ DECLARE subject text; BEGIN
    FOREACH subject IN ARRAY ARRAY['artifacts','conversations','messages','message_attachments','uploads'] LOOP
        EXECUTE format('ALTER TABLE product.%I ENABLE ROW LEVEL SECURITY',subject);
        EXECUTE format('ALTER TABLE product.%I FORCE ROW LEVEL SECURITY',subject);
        EXECUTE format('CREATE POLICY content_scope ON product.%I USING (workspace_id=ops.current_workspace_id()) WITH CHECK (workspace_id=ops.current_workspace_id())',subject);
    END LOOP;
END $$;
ALTER TABLE identity.workspace_roots ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.workspace_roots FORCE ROW LEVEL SECURITY;
CREATE POLICY root_scope ON identity.workspace_roots USING (workspace_id=ops.current_workspace_id()) WITH CHECK (workspace_id=ops.current_workspace_id());
