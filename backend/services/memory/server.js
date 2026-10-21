import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { startServiceServer } from '../../utils/service-runtime.js';
import { createLogger } from '../../config/logger.js';
import { loadConfig } from './src/config/env.js';
import { createApp } from './src/app.js';

export { startServiceServer as startServer, createApp, loadConfig };

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const logger = createLogger();
    try {
        const config = loadConfig();
        const running = await startServiceServer({ app: createApp({ config, logger }), config });
        logger.info({ service: 'memory', host: config.HOST, port: config.PORT }, 'ASI Memory microservice listening');
        for (const signal of ['SIGINT', 'SIGTERM']) {
            process.once(signal, () => { void running.close().catch(() => { process.exitCode = 1; }); });
        }
    } catch {
        logger.error('Memory service startup failed.');
        process.exitCode = 1;
    }
}
