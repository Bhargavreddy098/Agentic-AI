// @ts-check
import pg from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { applyStage02Migrations } from '../backend/src/platform/database/migrate.js';
import { TARGET_LOGICAL_SCHEMAS } from '../backend/src/platform/database/schemas.js';

// Explicit fresh-install command. Never upgrades or resets an existing application database.
const database = 'asi_local';
const migrator = 'asi_local_migrator';
const runtime = 'asi_local_runtime';
let admin;
let owner;
let stage = 'configuration';
try {
    if (process.platform !== 'win32') throw new Error('Windows configuration ACLs are required.');
    const source = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
    if (!source) throw new Error('An administrator connection is required.');
    const sourceUrl = new URL(source);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(sourceUrl.hostname)) throw new Error('Only a local installation is supported.');
    for (const file of ['.env.runtime', '.env.admin']) {
        try { await access(file, constants.F_OK); throw new Error('Fresh configuration paths are required.'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    admin = new pg.Client({ connectionString: source, connectionTimeoutMillis: 3000 });
    await admin.connect();
    stage = 'fresh-install preflight';
    const existing = await admin.query('SELECT datname FROM pg_database WHERE datname=$1', [database]);
    const roles = await admin.query('SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])', [[migrator, runtime]]);
    if (existing.rows.length || roles.rows.length) throw new Error('Existing resources require an explicit upgrade plan.');
    const extension = await admin.query('SELECT name FROM pg_available_extensions WHERE name=$1', ['vector']);
    if (extension.rows.length !== 1) throw new Error('pgvector installation is required.');
    const migrationPassword = randomBytes(32).toString('hex');
    const runtimePassword = randomBytes(32).toString('hex');
    const migrationUrl = new URL(sourceUrl), runtimeUrl = new URL(sourceUrl);
    for (const url of [migrationUrl, runtimeUrl]) url.pathname = '/' + database;
    migrationUrl.username = migrator;
    migrationUrl.password = migrationPassword;
    runtimeUrl.username = runtime;
    runtimeUrl.password = runtimePassword;
    // Create protected, empty files before writing any secret. No credentials go to stdout.
    stage = 'configuration ACLs';
    for (const [file, contents] of [
        ['.env.runtime', `DATABASE_URL=${runtimeUrl.href}\n`],
        ['.env.admin', `MIGRATION_DATABASE_URL=${migrationUrl.href}\nTEST_DATABASE_ADMIN_URL=${sourceUrl.href}\n`],
    ]) {
        await writeFile(file, '', { flag: 'wx', mode: 0o600 });
        await promisify(execFile)('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', resolve('scripts/protect-local-file.ps1'), '-Path', resolve(file)], { timeout: 15000 });
        await writeFile(file, contents, { flag: 'r+' });
    }
    stage = 'role provisioning';
    await admin.query(`CREATE ROLE "${migrator}" LOGIN PASSWORD '${migrationPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    await admin.query(`CREATE ROLE "${runtime}" LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    await admin.query(`CREATE DATABASE "${database}" OWNER "${migrator}" TEMPLATE template0`);
    await admin.query(`REVOKE ALL ON DATABASE "${database}" FROM PUBLIC`);
    await admin.query(`GRANT CONNECT ON DATABASE "${database}" TO "${runtime}"`);
    const ownerUrl = new URL(sourceUrl);
    ownerUrl.pathname = '/' + database;
    owner = new pg.Client({ connectionString: ownerUrl.href, connectionTimeoutMillis: 3000 });
    await owner.connect();
    stage = 'extension and migrations';
    await owner.query('CREATE EXTENSION vector');
    await owner.query(`SET ROLE "${migrator}"`);
    await applyStage02Migrations(owner);
    await owner.query('RESET ROLE');
    stage = 'runtime grants and local owner';
    for (const schema of TARGET_LOGICAL_SCHEMAS) {
        await owner.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${runtime}"`);
        await owner.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA "${schema}" TO "${runtime}"`);
        await owner.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${runtime}"`);
        await owner.query(`ALTER DEFAULT PRIVILEGES FOR ROLE "${migrator}" IN SCHEMA "${schema}" GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO "${runtime}"`);
        await owner.query(`ALTER DEFAULT PRIVILEGES FOR ROLE "${migrator}" IN SCHEMA "${schema}" GRANT USAGE,SELECT ON SEQUENCES TO "${runtime}"`);
    }
    await owner.query(`REVOKE INSERT,UPDATE,DELETE ON ops.schema_migrations FROM "${runtime}"`);
    const principalId = randomUUID(), workspaceId = randomUUID();
    await owner.query('BEGIN');
    try {
        await owner.query('INSERT INTO identity.principals (principal_id,kind,display_name) VALUES ($1,$2,$3)', [principalId, 'local_user', 'Local Owner']);
        await owner.query('INSERT INTO identity.workspaces (workspace_id,owner_principal_id,slug,display_name) VALUES ($1,$2,$3,$4)', [workspaceId, principalId, 'local-main', 'Local Workspace']);
        await owner.query('COMMIT');
    } catch (error) { await owner.query('ROLLBACK'); throw error; }
    process.stdout.write('Created asi_local with pgvector, migrations, a local owner, and separate runtime/migration roles. Credentials are in ACL-protected .env.runtime and .env.admin. Existing databases were not changed.\n');
} catch {
    process.stderr.write(`Local database setup failed at ${stage}. Existing resources are never overwritten. Inspect configuration and database prerequisites before retrying.\n`);
    process.exitCode = 1;
} finally {
    if (owner) await owner.end();
    if (admin) await admin.end();
}
