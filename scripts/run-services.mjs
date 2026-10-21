import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SERVICE_ORDER = [
    'core',
    'memory',
    'episode',
    'inference',
    'tool-runtime',
    'specialist',
    'orchestrator',
    'api-gateway',
];

export const DEFAULT_SERVICE_PORTS = {
    'api-gateway': 4400,
    'core': 4410,
    'memory': 4420,
    'episode': 4430,
    'inference': 4440,
    'orchestrator': 4450,
    'tool-runtime': 4460,
    'specialist': 4470,
};

export async function checkPortAvailable(port, host = '127.0.0.1') {
    return new Promise((resolvePromise) => {
        const tester = createServer();
        tester.once('error', () => resolvePromise(false));
        tester.once('listening', () => {
            tester.close(() => resolvePromise(true));
        });
        tester.listen(port, host);
    });
}

export function resolveSelectedServices(requested = []) {
    const clean = requested.filter(arg => arg && arg !== '--');
    if (clean.length === 0) {
        return [...SERVICE_ORDER];
    }
    for (const name of clean) {
        if (!SERVICE_ORDER.includes(name)) {
            throw new Error(`Unknown service "${name}". Expected one of: ${SERVICE_ORDER.join(', ')}`);
        }
    }
    return SERVICE_ORDER.filter(service => clean.includes(service));
}

export async function waitForHttpHealth(url, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return true;
            }
        }
        catch {
            // retry until deadline
        }
        await new Promise(r => setTimeout(r, 150));
    }
    return false;
}

export async function startSelectedServices({
    services = SERVICE_ORDER,
    rootDir = process.cwd(),
    portOverrides = {},
    readinessTimeoutMs = 10000,
    envOverrides = {},
} = {}) {
    const ordered = resolveSelectedServices(services);
    const children = new Map();

    const stopAll = async () => {
        const entries = [...children.entries()].reverse();
        for (const [name, child] of entries) {
            if (child && !child.killed && child.exitCode === null) {
                child.kill('SIGTERM');
                await Promise.race([
                    new Promise(r => child.once('exit', r)),
                    new Promise(r => setTimeout(r, 3000)),
                ]);
            }
            children.delete(name);
        }
    };

    try {
        for (const service of ordered) {
            const port = portOverrides[service] ?? DEFAULT_SERVICE_PORTS[service];
            const host = '127.0.0.1';
            const available = await checkPortAvailable(port, host);
            if (!available) {
                throw new Error(`Port ${port} for service "${service}" is already occupied. Refusing to kill unrelated processes.`);
            }
            const entry = resolve(rootDir, 'backend/services', service, 'server.js');
            if (!existsSync(entry)) {
                throw new Error(`Missing service entry point: ${entry}`);
            }
            const child = spawn(process.execPath, [entry], {
                cwd: rootDir,
                env: {
                    ...process.env,
                    HOST: host,
                    PORT: String(port),
                    SERVICE_NAME: service,
                    ...envOverrides,
                },
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            children.set(service, child);
            const liveOk = await waitForHttpHealth(`http://${host}:${port}/health/live`, readinessTimeoutMs);
            if (!liveOk) {
                throw new Error(`Service "${service}" failed liveness check within ${readinessTimeoutMs}ms on port ${port}`);
            }
        }
        return {
            services: ordered,
            pids: Object.fromEntries([...children.entries()].map(([name, c]) => [name, c.pid])),
            stop: stopAll,
        };
    }
    catch (error) {
        await stopAll();
        throw error;
    }
}

export function verifyServiceInventory(rootDir = process.cwd()) {
    const ownershipPath = resolve(rootDir, 'docs/asi-microservices-model-ownership.json');
    const ownership = JSON.parse(readFileSync(ownershipPath, 'utf8'));
    const missingFiles = [];

    for (const service of SERVICE_ORDER) {
        const prefix = service === 'api-gateway' ? 'gateway' : service;
        const requiredPaths = [
            `backend/services/${service}/package.json`,
            `backend/services/${service}/server.js`,
            `backend/services/${service}/.env.example`,
            `backend/services/${service}/README.md`,
            `backend/services/${service}/src/app.js`,
            `backend/services/${service}/src/config/env.js`,
            `backend/services/${service}/src/models/index.js`,
            `backend/services/${service}/src/schemas/index.js`,
            `backend/services/${service}/src/controllers/${prefix}.controller.js`,
            `backend/services/${service}/src/routes/${prefix}.routes.js`,
            `backend/services/${service}/src/routes/index.js`,
            `backend/services/${service}/src/services/${prefix}.service.js`,
            `backend/services/${service}/src/middlewares/index.js`,
        ];
        for (const rel of requiredPaths) {
            if (!existsSync(resolve(rootDir, rel))) {
                missingFiles.push(rel);
            }
        }
    }

    for (const model of ownership.models) {
        if (!existsSync(resolve(rootDir, model.proposedModelPath))) {
            missingFiles.push(model.proposedModelPath);
        }
        const rootModelPath = `backend/models/${model.family}.model.js`;
        const rootSchemaPath = `backend/schemas/${model.family}.schema.js`;
        if (!existsSync(resolve(rootDir, rootModelPath))) {
            missingFiles.push(rootModelPath);
        }
        if (!existsSync(resolve(rootDir, rootSchemaPath))) {
            missingFiles.push(rootSchemaPath);
        }
    }

    return {
        ok: missingFiles.length === 0,
        serviceCount: SERVICE_ORDER.length,
        modelFamilyCount: ownership.models.length,
        missingFiles,
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const mode = process.argv[2] ?? 'verify';
    const requested = process.argv.slice(3);
    if (mode === 'verify') {
        const report = verifyServiceInventory(process.cwd());
        if (!report.ok) {
            console.error('Service inventory verification failed:', report);
            process.exitCode = 1;
        }
        else {
            console.log(`Verified ${report.serviceCount} microservices and ${report.modelFamilyCount} domain model families.`);
        }
    }
    else if (mode === 'dev' || mode === 'start') {
        const running = await startSelectedServices({ services: requested });
        console.log('Started ASI microservices:', running.pids);
        for (const signal of ['SIGINT', 'SIGTERM']) {
            process.once(signal, () => {
                void running.stop().finally(() => process.exit(0));
            });
        }
    }
    else {
        console.error(`Unsupported mode "${mode}". Expected: dev | start | verify`);
        process.exitCode = 1;
    }
}
