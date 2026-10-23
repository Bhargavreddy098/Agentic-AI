// @ts-check
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath, lstat, access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { apiError } from '../../../middlewares/error-handler.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const run = promisify(execFile);
/** Native read helpers receive a minimal environment, never provider/database credentials. */
export function repositoryEnvironment() {
    /** @type {NodeJS.ProcessEnv} */
    const env = {};
    for (const key of ['SystemRoot', 'WINDIR', 'SystemDrive', 'ComSpec', 'PATHEXT', 'PATH', 'TEMP', 'TMP', 'ProgramFiles', 'ProgramFiles(x86)']) if (process.env[key]) env[key] = process.env[key];
    env.PSModulePath = join(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/Modules');
    env.GIT_CONFIG_GLOBAL = 'NUL';
    env.GIT_CONFIG_SYSTEM = 'NUL';
    env.GIT_CONFIG_NOSYSTEM = '1';
    env.GIT_TERMINAL_PROMPT = '0';
    env.GIT_NO_LAZY_FETCH = '1';
    return env;
}
export const readOnlyGitArgs = source => ['--no-pager', '--no-lazy-fetch', '--no-optional-locks', '--no-replace-objects', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=NUL', '-c', 'core.excludesFile=NUL', '-C', source];

/** Only standalone, canonical local Git worktrees are qualified initially. */
export async function inspectRepositoryRoot(source) {
    try {
        if (process.platform !== 'win32' || !/^[a-z]:[\\/]/i.test(source)) throw new Error('Unsupported root');
        const canonical = resolve(source);
        if (canonical.length <= 3 || (await realpath(canonical)).toLowerCase() !== canonical.toLowerCase()) throw new Error('Indirect root');
        const gitDirectory = resolve(canonical, '.git');
        const info = await lstat(gitDirectory);
        if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(gitDirectory)).toLowerCase() !== gitDirectory.toLowerCase()) throw new Error('Unsupported worktree metadata');
        for (const forbidden of ['objects/info/alternates', 'commondir']) {
            try { await access(resolve(gitDirectory, forbidden)); throw new Error('External Git object ownership is not qualified'); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        const result = await run('git.exe', [...readOnlyGitArgs(canonical), 'rev-parse', '--show-toplevel'], { env: repositoryEnvironment(), timeout: 5000, windowsHide: true });
        if (resolve(result.stdout.trim()).toLowerCase() !== canonical.toLowerCase()) throw new Error('Root mismatch');
        return canonical;
    } catch { throw apiError('ROOT_NOT_AUTHORIZED', 'A canonical local Git repository without external object stores is required.', 403); }
}

const captureSchema = z.object({ commitSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/).nullable(), removedPaths: z.array(z.string()).max(1000),
    files: z.array(z.object({ path: z.string().min(1).max(32768), content: z.string().max(12 * 1024 * 1024), digest: z.string().regex(/^[a-f0-9]{64}$/), mode: z.enum(['100644', '100755']) }).strict()).max(1000) }).strict();

export async function captureRepository(source, includeUncommitted) {
    const canonical = await inspectRepositoryRoot(source);
    const output = await new Promise((done, fail) => {
        const child = execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', resolve(root, 'scripts/snapshot-repository.ps1'), '-Root', canonical],
            { env: repositoryEnvironment(), timeout: 30000, maxBuffer: 96 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
                if (error) {
                    const code = ['REPOSITORY_CHANGED', 'QUOTA_EXCEEDED', 'SENSITIVE_SOURCE'].find(value => stderr.trim() === value) ?? 'ROOT_NOT_AUTHORIZED';
                    fail(apiError(code, 'Repository capture was refused, changed during capture, or exceeded its bounded source limits.', code === 'ROOT_NOT_AUTHORIZED' || code === 'SENSITIVE_SOURCE' ? 403 : 409));
                } else done(stdout);
            });
        child.stdin.end(JSON.stringify({ includeUncommitted }) + '\n');
    });
    let captured;
    try { captured = captureSchema.parse(JSON.parse(output)); }
    catch { throw apiError('CAPABILITY_UNAVAILABLE', 'Native snapshot receipt did not match its contract.', 503); }
    const files = captured.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(file => {
        const bytes = Buffer.from(file.content, 'base64');
        if (bytes.toString('base64') !== file.content || createHash('sha256').update(bytes).digest('hex') !== file.digest) throw apiError('CAPABILITY_UNAVAILABLE', 'Snapshot byte verification failed.', 503);
        return { path: file.path, bytes, digest: file.digest, mode: file.mode };
    });
    return { commitSha: captured.commitSha, removedPaths: captured.removedPaths, files };
}
