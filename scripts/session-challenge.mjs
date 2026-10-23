// @ts-check
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createIdentity } from '../backend/src/modules/identity/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
let stage = 'configuration';
try {
    if (process.platform !== 'win32') throw new Error('This launcher requires the qualified Windows ACL channel.');
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    stage = 'owner lookup';
    const principal = await pool.query(`SELECT w.workspace_id, p.principal_id FROM identity.workspaces w
        JOIN identity.principals p ON p.principal_id=w.owner_principal_id
        WHERE p.kind='local_user' AND p.status='active' ORDER BY w.created_at LIMIT 2`);
    if (principal.rows.length !== 1) throw new Error('Exactly one active local owner workspace must be provisioned first.');
    stage = 'launcher directory';
    const data = resolve(root, 'data');
    await mkdir(data, { recursive: true });
    if ((await realpath(data)).toLowerCase() !== data.toLowerCase()) throw new Error('Launcher data root cannot be a junction.');
    const directory = resolve(data, 'launcher');
    await mkdir(directory, { recursive: true });
    stage = 'Windows ACL';
    await promisify(execFile)('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', resolve(root, 'scripts/protect-launcher-directory.ps1'), '-Path', directory], { timeout: 15000 });
    const { workspace_id: workspaceId, principal_id: principalId } = principal.rows[0];
    stage = 'challenge issuance';
    const challenge = await createIdentity({ pool }).issueChallenge({ workspaceId, principalId });
    const destination = resolve(directory, `session-bootstrap-${randomUUID()}.json`);
    stage = 'protected delivery';
    await writeFile(destination, JSON.stringify(challenge), { flag: 'wx', mode: 0o600 });
    // The challenge is delivered only through the ACL-protected file, never stdout/logs.
    process.stdout.write(`One-time launcher challenge written to ${destination}. Expires in 60 seconds.\n`);
} catch {
    process.stderr.write(`Launcher challenge failed at ${stage}. Verify the dedicated database, local owner, and Windows ACL permissions.\n`);
    process.exitCode = 1;
} finally { await pool.end(); }
