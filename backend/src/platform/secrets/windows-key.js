// @ts-check
import { mkdir, realpath } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const run = promisify(execFile);

/** Establish a private directory before storing sensitive installation data. */
export async function privateDataDirectory(name) {
    if (process.platform !== 'win32' || !/^[a-z-]{1,40}$/.test(name)) throw new Error('Qualified Windows storage is required.');
    const data = resolve(root, 'data');
    await mkdir(data, { recursive: true });
    if ((await realpath(data)).toLowerCase() !== data.toLowerCase()) throw new Error('Data root cannot be a junction.');
    const directory = resolve(data, name);
    await mkdir(directory, { recursive: true });
    await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', resolve(root, 'scripts/protect-launcher-directory.ps1'), '-Path', directory], { timeout: 15000 });
    return directory;
}

/** Retrieve a purpose-bound DPAPI key over a private child-process pipe. Never log it. */
export async function loadWindowsKey(purpose) {
    if (!['database-backup', 'artifact-store'].includes(purpose)) throw new Error('Unsupported key purpose.');
    try {
        const directory = await privateDataDirectory('secrets');
        const result = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', resolve(root, 'scripts/windows-key.ps1'), '-Path', resolve(directory, purpose + '.dpapi'), '-Purpose', purpose], { timeout: 15000 });
        const key = Buffer.from(result.stdout.trim(), 'base64');
        if (key.length !== 32) throw new Error('Invalid key length');
        return key;
    } catch { throw new Error('Windows secret key is unavailable.'); }
}
