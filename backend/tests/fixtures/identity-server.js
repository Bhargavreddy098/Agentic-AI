// A real child process used to prove sessions survive process termination.
import { loadConfig } from '../../config/env.js';
import { createContainer } from '../../src/bootstrap/container.js';
import { startServer } from '../../server.js';
const config = loadConfig({ ...process.env, NODE_ENV: 'test', ASI_PORT: '0', HOST: '127.0.0.1', ASI_HOST: '127.0.0.1' });
const container = await createContainer({ config, stage03Only: process.argv.includes('--stage03'), includeUnqualifiedProductServices: process.argv.includes('--test-product-services') });
const running = await startServer({ app: container.app, config, resources: container.resources });
process.send?.({ port: running.address.port });
process.once('SIGTERM', () => { void running.close().then(() => process.exit(0)); });
