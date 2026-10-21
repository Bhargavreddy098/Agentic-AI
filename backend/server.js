import { createServer } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadConfig } from './config/env.js';
import { createLogger } from './config/logger.js';
import { createDatabase } from './config/database.js';
import { createApp } from './app.js';
/** @param {{app: import('express').Express, config: ReturnType<typeof loadConfig>, resources?: Array<{close:()=>Promise<void>}>}} options */
export async function startServer({ app, config, resources = [] }) {
    const server = createServer(app);
    let closing;
    await new Promise((done, fail) => { server.once('error', fail); server.listen(config.PORT, config.HOST, () => { server.off('error', fail); done(undefined); }); });
    const close = () => closing ??= (async () => {
        const timer = setTimeout(() => server.closeAllConnections(), config.SHUTDOWN_TIMEOUT_MS);
        timer.unref();
        try {
            await new Promise((done, fail) => server.close(error => error ? fail(error) : done(undefined)));
            await Promise.all(resources.map(resource => resource.close()));
        }
        finally {
            clearTimeout(timer);
        }
    })();
    return { server, address: server.address(), close };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const logger = createLogger();
    try {
        process.loadEnvFile?.(fileURLToPath(new URL('./.env', import.meta.url)));
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    }
    try {
        const config = loadConfig(), database = createDatabase(config);
        let running;
        try {
            running = await startServer({ app: createApp({ config, logger, readiness: () => database.readiness() }), config, resources: [database] });
        }
        catch (error) {
            await database.close();
            throw error;
        }
        logger.info({ host: config.HOST, port: config.PORT }, 'ASI Express backend listening');
        for (const signal of ['SIGINT', 'SIGTERM'])
            process.once(signal, () => { void running.close().catch(() => { process.exitCode = 1; }); });
    }
    catch {
        logger.error('Backend startup failed; verify configuration and compiled dependencies.');
        process.exitCode = 1;
    }
}
