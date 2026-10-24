// @ts-check
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { repositoryEnvironment } from './index.js';
import { apiError } from '../../../middlewares/error-handler.js';
export function exportLocal(destination, bytes, validateOnly = false) {
    if (process.platform !== 'win32') throw apiError('CAPABILITY_UNAVAILABLE', 'Native export requires qualified Windows.', 503);
    return new Promise((resolve, reject) => {
        const child = execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', fileURLToPath(new URL('../../../../scripts/export-artifact.ps1', import.meta.url)), ...(validateOnly ? ['-ValidateOnly'] : [])],
            { env: repositoryEnvironment(), timeout: 30000, windowsHide: true, maxBuffer: 8192 }, error => error ? reject(apiError('EXPORT_OUTCOME_UNKNOWN', 'Export was refused or its outcome is unknown. Inspect the authorized destination before any new export.', 409)) : resolve());
        child.stdin.on('error', () => { /* execFile callback reports helper failure; no retry. */ });
        child.stdin.end(JSON.stringify({ destination, content: bytes.toString('base64') }) + '\n');
    });
}
