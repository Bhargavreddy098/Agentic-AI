// @ts-check
import { createDatabase } from '../../config/database.js';
import { createApp } from '../../app.js';
import { createIdentity } from '../modules/identity/index.js';
import { createProjects } from '../modules/projects/index.js';
import { createArtifactStore } from '../platform/blob-store/index.js';
import { createArtifacts } from '../modules/artifacts/index.js';
import { createConversations } from '../modules/conversations/index.js';
import { createUploads } from '../modules/artifacts/uploads.js';
import { createOperations } from '../modules/operations/index.js';
import { createAudit, createPolicy, createGrants, createApprovals, createBudgets } from '../modules/governance/index.js';
import { createProviders } from '../modules/providers/index.js';
import { compatibleProfileFromEnv } from '../modules/providers/compatible.js';
import { createEnvironmentSecrets } from '../modules/providers/secrets.js';

/** Explicit production owners; no Map fixture or simulated orchestrator is installed here. */
export async function createContainer({ config, logger = undefined, stage03Only = false, includeUnqualifiedProductServices = false }) {
    if (includeUnqualifiedProductServices && config.NODE_ENV !== 'test') throw new Error('Unqualified product services are restricted to test composition');
    const isStage03 = stage03Only;
    const database = createDatabase(config, { stage03Only: isStage03 });
    let blobs;
    try {
        const identity = createIdentity({ pool: database.pool });
        if (isStage03) {
            const ready = await database.readiness();
            if (!ready.postgres || !ready.vector || !ready.schemas || !ready.migrations || !ready.runtimeRole) {
                throw new Error('Stage 03 requires ready PostgreSQL/vector, verified migrations, and a safe runtime role');
            }
            const services = { identity };
            return { database, services, resources: [database], app: createApp({ config, logger, services, readiness: () => database.readiness() }) };
        }
        // Stage 06 qualified production composition:
        const ready = await database.readiness();
        if (!ready.postgres || !ready.vector || !ready.schemas || !ready.migrations || !ready.runtimeRole) {
            throw new Error('Stage 06 requires ready PostgreSQL/vector, verified migrations, and a safe runtime role');
        }
        blobs = await createArtifactStore();
        const projects = createProjects({ pool: database.pool });
        const artifacts = createArtifacts({ pool: database.pool, blobs, projects });
        const conversations = createConversations({ pool: database.pool, projects, artifacts });
        const operations = createOperations({ pool: database.pool });
        const uploads = createUploads({ pool: database.pool, projects, artifacts, operations });
        const audit = createAudit({ pool: database.pool });
        const policies = createPolicy({ pool: database.pool, audit });
        const grants = createGrants({ pool: database.pool, audit });
        const approvals = createApprovals({ pool: database.pool, audit, policy: policies });
        const budgets = createBudgets({ pool: database.pool, audit });
        const secrets = createEnvironmentSecrets();
        const providers = createProviders({ pool: database.pool, audit, policies, grants, budgets, operations, secrets, artifacts, compatibleProfile: compatibleProfileFromEnv() });
        const services = { identity, projects, artifacts, conversations, uploads, operations, audit, policies, grants, approvals, budgets, providers };
        return { database, services, resources: [database, blobs], app: createApp({ config, logger, services, readiness: () => database.readiness() }) };
    } catch (error) {
        await blobs?.close();
        await database.close();
        throw error;
    }
}
