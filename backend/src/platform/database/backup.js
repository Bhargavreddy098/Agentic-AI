// @ts-check
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, lstat, open, unlink, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import pg from 'pg';
import { loadWindowsKey, privateDataDirectory } from '../secrets/windows-key.js';

const magic = Buffer.from('ASIBAK01');
function connectionEnvironment(connectionString) {
    const url = new URL(connectionString);
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !/^asi_[a-z0-9_]{1,58}$/.test(database)) {
        throw new Error('Backup/restore requires an explicit local ASI database.');
    }
    return { ...process.env, PGHOST: url.hostname.replace(/^\[|\]$/g, ''), PGPORT: url.port || '5432',
        PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: database };
}
function postgresBinary(name) {
    return join(process.env.POSTGRES_BIN ?? 'C:/Program Files/PostgreSQL/17/bin', name + (process.platform === 'win32' ? '.exe' : ''));
}

/** AES-256-GCM backup. Its key is protected by Windows DPAPI for the installing user. */
export async function createEncryptedDatabaseBackup(connectionString) {
    const env = connectionEnvironment(connectionString);
    const directory = await privateDataDirectory('backups');
    const key = await loadWindowsKey('database-backup');
    const destination = resolve(directory, `database-${Date.now()}-${randomUUID()}.asbak`);
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(magic);
    await writeFile(destination, Buffer.concat([magic, nonce]), { flag: 'wx', mode: 0o600 });
    let child;
    try {
        child = spawn(postgresBinary('pg_dump'), ['--format=custom', '--no-owner', '--no-privileges'], { env, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, timeout: 60000 });
        const exited = once(child, 'exit').then(([code]) => { if (code !== 0) throw new Error('PostgreSQL backup failed.'); });
        await Promise.all([pipeline(child.stdout, cipher, createWriteStream(destination, { flags: 'a' })), exited]);
        await appendFile(destination, cipher.getAuthTag());
        return destination;
    } catch {
        child?.kill();
        await unlink(destination).catch(() => {});
        throw new Error('Encrypted database backup failed.');
    } finally { key.fill(0); }
}

/** Restore only into an empty, explicitly selected local ASI database.
 * Authentication completes before pg_restore receives any plaintext bytes.
 */
export async function restoreEncryptedDatabaseBackup(connectionString, backupPath) {
    const env = connectionEnvironment(connectionString);
    const directory = await privateDataDirectory('backups');
    const path = resolve(backupPath);
    if (dirname(path).toLowerCase() !== directory.toLowerCase()) throw new Error('Backup must belong to the protected backup directory.');
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 36 || stat.size > 1024 * 1024 * 1024) throw new Error('Invalid backup file.');
    const temporary = resolve(directory, `restore-${randomUUID()}.dump`);
    const key = await loadWindowsKey('database-backup');
    const input = await open(path, 'r');
    const database = new pg.Client({ connectionString, connectionTimeoutMillis: 3000 });
    try {
        const header = Buffer.alloc(20), tag = Buffer.alloc(16);
        await input.read(header, 0, 20, 0);
        await input.read(tag, 0, 16, stat.size - 16);
        if (!header.subarray(0, 8).equals(magic)) throw new Error('Invalid backup format.');
        const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(8));
        decipher.setAAD(magic);
        decipher.setAuthTag(tag);
        await pipeline(createReadStream(path, { start: 20, end: stat.size - 17 }), decipher, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
        await database.connect();
        const tables = await database.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
            AND n.nspname NOT LIKE 'pg_toast%' LIMIT 1`);
        if (tables.rows.length) throw new Error('Restore target must be empty.');
        const child = spawn(postgresBinary('pg_restore'), ['--no-owner', '--no-privileges', '--exit-on-error', '--dbname', env.PGDATABASE, temporary], { env, stdio: 'ignore', windowsHide: true, timeout: 60000 });
        const [code] = await once(child, 'exit');
        if (code !== 0) throw new Error('PostgreSQL restore failed.');
    } catch { throw new Error('Encrypted database restore failed; target may require inspection.'); }
    finally {
        key.fill(0);
        await input.close();
        await database.end().catch(() => {});
        await unlink(temporary).catch(() => {});
    }
}
