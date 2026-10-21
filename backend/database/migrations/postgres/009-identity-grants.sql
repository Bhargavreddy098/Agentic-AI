-- M03 forward migration. Prerequisite: immutable 001-control.sql.
-- This table is accessible only by its explicitly granted governance service role.
CREATE TABLE identity_grants (
    grant_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
    parent_grant_id TEXT,
    claims JSONB NOT NULL,
    revoked_at BIGINT CHECK (revoked_at > 0),
    revoked_reason TEXT CHECK (length(revoked_reason) <= 1024),
    deleted BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (grant_id, tenant_id),
    FOREIGN KEY (parent_grant_id, tenant_id) REFERENCES identity_grants(grant_id, tenant_id),
    CHECK (jsonb_typeof(claims) = 'object'),
    CHECK (claims ?& ARRAY['grantId','tenantId','subjectId','roles','capabilities','audience','issuedAt','expiresAt']),
    CHECK (claims->>'grantId' = grant_id AND claims->>'tenantId' = tenant_id),
    CHECK ((claims->>'parentGrantId') IS NOT DISTINCT FROM parent_grant_id),
    CHECK ((claims->>'expiresAt')::BIGINT > (claims->>'issuedAt')::BIGINT),
    CHECK (jsonb_typeof(claims->'roles') = 'array' AND jsonb_array_length(claims->'roles') BETWEEN 1 AND 64),
    CHECK (jsonb_typeof(claims->'capabilities') = 'array' AND jsonb_array_length(claims->'capabilities') BETWEEN 1 AND 128)
);
CREATE INDEX identity_grants_tenant_idx ON identity_grants(tenant_id);
CREATE INDEX identity_grants_parent_idx ON identity_grants(parent_grant_id);
REVOKE ALL ON identity_grants FROM PUBLIC;

CREATE FUNCTION protect_identity_grant() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'authorization grant deletion requires a tombstone';
    END IF;
    IF NEW.grant_id IS DISTINCT FROM OLD.grant_id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.parent_grant_id IS DISTINCT FROM OLD.parent_grant_id
       OR NEW.claims IS DISTINCT FROM OLD.claims THEN
        RAISE EXCEPTION 'immutable authorization grant';
    END IF;
    IF OLD.revoked_at IS NOT NULL THEN
        NEW.revoked_at := OLD.revoked_at;
        NEW.revoked_reason := OLD.revoked_reason;
    END IF;
    IF OLD.deleted THEN NEW.deleted := TRUE; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER identity_grant_immutable BEFORE UPDATE OR DELETE ON identity_grants
    FOR EACH ROW EXECUTE FUNCTION protect_identity_grant();
