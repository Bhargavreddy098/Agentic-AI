// @ts-check
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Compile the actual runtime boundary and real declarations.
 * @param {string} directory
 * @param {string[]} entries
 */
function build(directory, entries) {
    const source = resolve(root, directory, 'src');
    const program = ts.createProgram(entries.map(entry => resolve(source, entry)), {
        target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        rootDir: source,
        outDir: resolve(root, directory, 'dist'),
        declaration: true,
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        noEmitOnError: true,
        types: ['node'],
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length) {
        process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
            getCanonicalFileName: file => file,
            getCurrentDirectory: () => root,
            getNewLine: () => '\n',
        }));
        throw new Error(`Internal build failed: ${directory}`);
    }
    if (program.emit().emitSkipped) throw new Error(`Internal emit failed: ${directory}`);
}

build('packages/contracts', ['index.ts']);
build('backend/modules/gateway', ['ui/index.ts']);
// Explicit test fixture, never imported by the production composition root.
build('backend/workers/gateway', ['ui/memory-ports.ts']);
