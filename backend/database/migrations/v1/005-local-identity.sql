-- Local owner sessions; raw challenges, cookie tokens, and CSRF tokens are never persisted.
ALTER TABLE identity.principals DROP CONSTRAINT principals_kind_check;
UPDATE identity.principals SET kind='local_user' WHERE kind='owner';
ALTER TABLE identity.principals ADD CONSTRAINT principals_kind_check CHECK (kind IN ('local_user', 'worker'));
ALTER TABLE identity.workspaces ADD CONSTRAINT uq_workspace_owner UNIQUE (workspace_id, owner_principal_id);

CREATE TABLE identity.bootstrap_challenges (
    challenge_id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    principal_id uuid NOT NULL,
    challenge_hash bytea NOT NULL UNIQUE CHECK (octet_length(challenge_hash) = 32),
    nonce_hash bytea NOT NULL CHECK (octet_length(nonce_hash) = 32),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    FOREIGN KEY (workspace_id, principal_id)
        REFERENCES identity.workspaces (workspace_id, owner_principal_id) ON DELETE RESTRICT,
    CHECK (expires_at > created_at)
);

CREATE TABLE identity.sessions (
    session_id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    principal_id uuid NOT NULL,
    token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    csrf_hash bytea NOT NULL CHECK (octet_length(csrf_hash) = 32),
    expires_at timestamptz NOT NULL,
    idle_expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (workspace_id, principal_id)
        REFERENCES identity.workspaces (workspace_id, owner_principal_id) ON DELETE RESTRICT,
    CHECK (expires_at > created_at),
    CHECK (idle_expires_at <= expires_at)
);
CREATE INDEX idx_sessions_principal ON identity.sessions (workspace_id, principal_id);
CREATE INDEX idx_challenges_expiry ON identity.bootstrap_challenges (expires_at) WHERE consumed_at IS NULL;
ALTER TABLE identity.bootstrap_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.bootstrap_challenges FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.sessions FORCE ROW LEVEL SECURITY;

-- Authentication is scoped by a hash of the presented capability before workspace identity is known.
-- Challenges are issued only by the trusted local launcher, never by an anonymous HTTP endpoint.
CREATE POLICY bootstrap_capability ON identity.bootstrap_challenges
    USING (encode(challenge_hash, 'hex') = NULLIF(current_setting('asi.bootstrap_hash', true), ''))
    WITH CHECK (encode(challenge_hash, 'hex') = NULLIF(current_setting('asi.bootstrap_hash', true), ''));
CREATE POLICY session_capability ON identity.sessions
    USING (encode(token_hash, 'hex') = NULLIF(current_setting('asi.session_hash', true), ''))
    WITH CHECK (encode(token_hash, 'hex') = NULLIF(current_setting('asi.session_hash', true), ''));
