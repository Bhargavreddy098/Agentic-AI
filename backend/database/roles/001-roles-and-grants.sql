-- Stage 02 Role and Grant Separation Script
-- Authorities: docs/backend/04-DATABASE.md, docs/backend/08-SECURITY-AND-RUNTIME.md
-- Must be executed by a database administrator / installer role.
-- Runtime connections must use asi_runtime (NOSUPERUSER, NOBYPASSRLS, no DDL).

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asi_migrator') THEN
        CREATE ROLE asi_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asi_runtime') THEN
        CREATE ROLE asi_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA
    identity,
    product,
    planning,
    control,
    inference,
    knowledge,
    verification,
    automation,
    ops
TO asi_runtime, asi_migrator;

GRANT SELECT ON TABLE ops.schema_migrations TO asi_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE ops.schema_migrations FROM asi_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA
    identity,
    product,
    planning,
    control,
    inference,
    knowledge,
    verification,
    automation
TO asi_runtime;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA
    identity,
    product,
    planning,
    control,
    inference,
    knowledge,
    verification,
    automation
TO asi_runtime;
