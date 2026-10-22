-- Stage 02 Migration 001: Logical Schemas and Immutable Migration Journal
-- Authorities: docs/backend/04-DATABASE.md, docs/backend/11-IMPLEMENTATION-ROADMAP.md

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS product;
CREATE SCHEMA IF NOT EXISTS planning;
CREATE SCHEMA IF NOT EXISTS control;
CREATE SCHEMA IF NOT EXISTS inference;
CREATE SCHEMA IF NOT EXISTS knowledge;
CREATE SCHEMA IF NOT EXISTS verification;
CREATE SCHEMA IF NOT EXISTS automation;
CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE IF NOT EXISTS ops.schema_migrations (
    migration_id text PRIMARY KEY,
    checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
    execution_ms integer NOT NULL DEFAULT 0 CHECK (execution_ms >= 0),
    applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION ops.protect_schema_migrations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'ops.schema_migrations is append-only and immutable';
END;
$$;

DROP TRIGGER IF EXISTS schema_migrations_immutable_guard ON ops.schema_migrations;
CREATE TRIGGER schema_migrations_immutable_guard
BEFORE UPDATE OR DELETE ON ops.schema_migrations
FOR EACH ROW
EXECUTE FUNCTION ops.protect_schema_migrations();

REVOKE ALL ON TABLE ops.schema_migrations FROM PUBLIC;

CREATE OR REPLACE FUNCTION ops.current_workspace_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    raw_val text;
BEGIN
    raw_val := NULLIF(current_setting('asi.workspace_id', true), '');
    IF raw_val IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN raw_val::uuid;
EXCEPTION
    WHEN invalid_text_representation THEN
        RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION ops.current_principal_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    raw_val text;
BEGIN
    raw_val := NULLIF(current_setting('asi.principal_id', true), '');
    IF raw_val IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN raw_val::uuid;
EXCEPTION
    WHEN invalid_text_representation THEN
        RETURN NULL;
END;
$$;
