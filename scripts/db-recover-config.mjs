// @ts-check
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { access, open, unlink, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Administrator maintenance only. --plan is read-only; --apply requires explicit owner authorization.
const database = 'asi_local';
const roles = ['asi_local_migrator', 'asi_local_runtime'];
const created = [];
let client, committed = false, transaction = false, commitAttempted = false;
let stage = 'arguments';
try {
    const args = process.argv.slice(2);
    if (args.some(arg => !['--plan', '--apply'].includes(arg)) || (args.includes('--plan') && args.includes('--apply'))) throw new Error('Invalid arguments');
    const apply = args.includes('--apply');
    const source = process.env.DATABASE_ADMIN_URL ?? process.env.TEST_DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
    const sourceUrl = new URL(source);
    if (process.platform !== 'win32' || !['127.0.0.1', 'localhost', '[::1]'].includes(sourceUrl.hostname)) throw new Error('Local Windows administrator connection required');
    const root = resolve('.');
    if ((await realpath(root)).toLowerCase() !== root.toLowerCase()) throw new Error('Indirect workspace');
    stage = 'configuration preflight';
    for (const file of ['.env.runtime', '.env.admin']) {
        try { await access(resolve(root, file)); throw new Error('Existing config must never be overwritten'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    client = new pg.Client({ connectionString: sourceUrl.href, connectionTimeoutMillis: 3000 });
    await client.connect();
    stage = 'role preflight';
    const actual = await client.query('SELECT rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolcanlogin FROM pg_roles WHERE rolname=ANY($1::text[])', [roles]);
    if (actual.rows.length !== 2 || actual.rows.some(role => role.rolsuper || role.rolbypassrls || role.rolcreatedb || role.rolcreaterole || !role.rolcanlogin)) throw new Error('Unexpected app-role privileges');
    const owner = (await client.query('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1', [database])).rows[0];
    if (owner?.owner !== roles[0]) throw new Error('Unexpected database owner');
    if ((await client.query('SELECT pg_has_role($1,$2,$3) AS inherited', [roles[1], roles[0], 'USAGE'])).rows[0].inherited) throw new Error('Runtime inherits DDL privileges');
    if (!apply) {
        process.stdout.write('PLAN ONLY: rotate only asi_local_migrator and asi_local_runtime passwords; recreate missing ACL-protected .env.admin/.env.runtime. No database data, grants, administrator password, or existing files change.\n');
    } else {
        const passwords = roles.map(() => randomBytes(32).toString('hex'));
        const urls = roles.map((role, index) => { const url = new URL(sourceUrl); url.pathname = '/' + database; url.username = role; url.password = passwords[index]; return url.href; });
        const contents = [
            ['.env.admin', `MIGRATION_DATABASE_URL=${urls[0]}\nTEST_DATABASE_ADMIN_URL=${sourceUrl.href}\n`],
            ['.env.runtime', `DATABASE_URL=${urls[1]}\n`],
        ];
        await client.query('BEGIN');
        transaction = true;
        stage = 'role password rotation';
        // Both identifiers are fixed above; passwords contain generated hex only, never user SQL.
        for (let i = 0; i < roles.length; i++) await client.query(`ALTER ROLE "${roles[i]}" PASSWORD '${passwords[i]}'`);
        stage = 'protected config delivery';
        for (const [name, text] of contents) {
            const path = resolve(root, name);
            const file = await open(path, 'wx', 0o600);
            created.push(path);
            try {
                await promisify(execFile)('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', resolve(root, 'scripts/protect-local-file.ps1'), '-Path', path], { timeout: 15000, windowsHide: true });
                await file.writeFile(text);
                await file.sync();
            } finally { await file.close(); }
        }
        stage = 'commit';
        commitAttempted = true;
        await client.query('COMMIT');
        committed = true;
        transaction = false;
        process.stdout.write('APP_CONFIG_RECOVERED: protected local connection files recreated; only the two app-role passwords changed. No credentials are printed.\n');
    }
} catch {
    if (transaction && client) await client.query('ROLLBACK').catch(() => { process.stderr.write('ROLE_TRANSACTION_ROLLBACK_UNCONFIRMED: inspect local roles before retry.\n'); });
    if (!committed && !commitAttempted) for (const path of created) {
        try { await unlink(path); } catch { process.stderr.write('CONFIG_CLEANUP_REQUIRED: inspect only the newly created app connection files.\n'); }
    }
    if (commitAttempted && !committed) process.stderr.write('COMMIT_OUTCOME_UNKNOWN: protected files were retained; verify local app-role connections before any retry.\n');
    process.stderr.write(`APP_CONFIG_RECOVERY_FAILED at ${stage}; no existing file or database data is overwritten.\n`);
    process.exitCode = 1;
} finally { if (client) await client.end(); }
