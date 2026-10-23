import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir, symlink, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { captureRepository } from '../src/platform/repository/index.js';

test('native repository capture binds exact bytes and denies host path escapes', { timeout: 90000 }, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'asi-repository-'));
    const outside = await mkdtemp(join(tmpdir(), 'asi-outside-'));
    const git = args => promisify(execFile)('git.exe', ['-C', directory, ...args], { windowsHide: true });
    try {
        await git(['init']);
        await git(['config', 'core.autocrlf', 'false']);
        await writeFile(join(directory, 'hello.txt'), 'Committed 世界\n');
        await git(['add', '--', 'hello.txt']);
        await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']);
        await t.test('committed snapshots bind verified Git objects, even with dirty working bytes', async () => {
            await writeFile(join(directory, 'hello.txt'), 'Changed 世界\n');
            const captured = await captureRepository(directory, false);
            assert.equal(captured.files.length, 1);
            assert.equal(captured.files[0].bytes.toString(), 'Committed 世界\n');
            assert.ok(captured.commitSha);
        });
        await t.test('working snapshots include exact changed and untracked bytes', async () => {
            await writeFile(join(directory, 'new.txt'), 'New bytes\n');
            const captured = await captureRepository(directory, true);
            assert.equal(captured.files.length, 2);
            assert.equal(captured.files.find(file => file.path === 'hello.txt').bytes.toString(), 'Changed 世界\n');
            assert.equal(captured.files.find(file => file.path === 'new.txt').bytes.toString(), 'New bytes\n');
        });
        await t.test('deleted tracked files are represented without inventing bytes', async () => {
            await unlink(join(directory, 'hello.txt'));
            const captured = await captureRepository(directory, true);
            assert.ok(captured.removedPaths.includes('hello.txt'));
            assert.equal(captured.files.length, 1);
        });
        await t.test('selected credential paths are refused rather than silently omitted', async () => {
            await writeFile(join(directory, '.env'), 'PRIVATE_FIXTURE=value');
            try { await assert.rejects(captureRepository(directory, true), error => error.code === 'SENSITIVE_SOURCE'); }
            finally { await unlink(join(directory, '.env')); }
        });
        await t.test('a junction cannot redirect captured source bytes outside the registered root', async () => {
            await mkdir(join(directory, 'linked'));
            await writeFile(join(directory, 'linked', 'secret.txt'), 'Tracked placeholder');
            await git(['add', '--', 'linked/secret.txt']);
            await unlink(join(directory, 'linked', 'secret.txt'));
            await rmdir(join(directory, 'linked'));
            await writeFile(join(outside, 'secret.txt'), 'Outside canary');
            await symlink(outside, join(directory, 'linked'), 'junction');
            try { await assert.rejects(captureRepository(directory, true), error => ['ROOT_NOT_AUTHORIZED', 'REPOSITORY_CHANGED'].includes(error.code)); }
            finally { await rmdir(join(directory, 'linked')); }
            assert.equal(await readFile(join(outside, 'secret.txt'), 'utf8'), 'Outside canary');
        });
    } finally {
        assert.ok(directory.startsWith(join(tmpdir(), 'asi-repository-')));
        assert.ok(outside.startsWith(join(tmpdir(), 'asi-outside-')));
        await rm(directory, { recursive: true, force: true });
        await rm(outside, { recursive: true, force: true });
    }
});
