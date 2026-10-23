// @ts-check
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, realpath, writeFile, rename, readFile, lstat, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadWindowsKey, privateDataDirectory } from '../secrets/windows-key.js';
import { assertUuid } from '../database/repository.js';

const maximumBytes = 16 * 1024 * 1024;
const magic = Buffer.from('ASIBLOB1');
export async function createArtifactStore() {
    const directory = await privateDataDirectory('artifacts');
    const key = await loadWindowsKey('artifact-store');
    const location = async (scope, digest) => {
        const workspace = assertUuid(scope.workspaceId, 'workspaceId');
        const project = assertUuid(scope.projectId, 'projectId');
        if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid artifact digest');
        const workspaceDirectory = resolve(directory, workspace);
        await mkdir(workspaceDirectory, { recursive: true });
        if ((await realpath(workspaceDirectory)).toLowerCase() !== workspaceDirectory.toLowerCase()) throw new Error('Artifact scope path cannot be a junction');
        const scopedDirectory = resolve(workspaceDirectory, project);
        await mkdir(scopedDirectory, { recursive: true });
        if ((await realpath(scopedDirectory)).toLowerCase() !== scopedDirectory.toLowerCase()) throw new Error('Artifact project path cannot be a junction');
        return { path: resolve(scopedDirectory, digest + '.blob'), storageKey: `${workspace}/${project}/${digest}.blob` };
    };
    const aad = (scope, digest) => Buffer.from(`asi-artifact-v1:${scope.workspaceId.toLowerCase()}:${scope.projectId.toLowerCase()}:${digest}`);
    return {
        async write(scope, bytes) {
            if (!Buffer.isBuffer(bytes) || bytes.length > maximumBytes) throw new Error('Artifact exceeds the bounded content limit');
            const digest = createHash('sha256').update(bytes).digest('hex');
            const destination = await location(scope, digest);
            const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, nonce);
            cipher.setAAD(aad(scope, digest));
            const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
            const temporary = destination.path + '.' + randomUUID() + '.tmp';
            try {
                await writeFile(temporary, Buffer.concat([magic, nonce, cipher.getAuthTag(), ciphertext]), { flag: 'wx', mode: 0o600 });
                // Atomic replacement can only reproduce the same scoped plaintext digest.
                await rename(temporary, destination.path);
            } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
            return { digest, bytes: String(bytes.length), storageKey: destination.storageKey };
        },
        async read(scope, digest, expectedBytes) {
            const source = await location(scope, digest);
            const stat = await lstat(source.path);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximumBytes + 36 || stat.size < 36) throw new Error('Invalid encrypted artifact');
            const encrypted = await readFile(source.path);
            if (!encrypted.subarray(0, 8).equals(magic)) throw new Error('Invalid artifact format');
            const decipher = createDecipheriv('aes-256-gcm', key, encrypted.subarray(8, 20));
            decipher.setAAD(aad(scope, digest));
            decipher.setAuthTag(encrypted.subarray(20, 36));
            const bytes = Buffer.concat([decipher.update(encrypted.subarray(36)), decipher.final()]);
            if (String(bytes.length) !== String(expectedBytes) || createHash('sha256').update(bytes).digest('hex') !== digest) throw new Error('Artifact integrity check failed');
            return bytes;
        },
        async close() { key.fill(0); },
    };
}
