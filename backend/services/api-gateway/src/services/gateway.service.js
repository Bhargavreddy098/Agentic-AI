import { createServiceClient } from '../../../../utils/service-clients.js';

/**
 * @param {any} [options]
 */
export function createGatewayService({ config, clients = {}, services = {} } = {}) {
    const token = config?.ASI_SERVICE_TOKEN ?? 'asi-local-service-token-2026';
    const resolvedClients = {
        core: clients.core ?? createServiceClient({ callerService: 'api-gateway', targetAudience: 'core', baseUrl: config?.CORE_SERVICE_URL ?? 'http://127.0.0.1:4410', serviceToken: token }),
        memory: clients.memory ?? createServiceClient({ callerService: 'api-gateway', targetAudience: 'memory', baseUrl: config?.MEMORY_SERVICE_URL ?? 'http://127.0.0.1:4420', serviceToken: token }),
        episode: clients.episode ?? createServiceClient({ callerService: 'api-gateway', targetAudience: 'episode', baseUrl: config?.EPISODE_SERVICE_URL ?? 'http://127.0.0.1:4430', serviceToken: token }),
        inference: clients.inference ?? createServiceClient({ callerService: 'api-gateway', targetAudience: 'inference', baseUrl: config?.INFERENCE_SERVICE_URL ?? 'http://127.0.0.1:4440', serviceToken: token }),
        orchestrator: clients.orchestrator ?? createServiceClient({ callerService: 'api-gateway', targetAudience: 'orchestrator', baseUrl: config?.ORCHESTRATOR_SERVICE_URL ?? 'http://127.0.0.1:4450', serviceToken: token }),
        toolRuntime: clients.toolRuntime ?? createServiceClient({ callerService: 'api-gateway', targetAudience: 'tool-runtime', baseUrl: config?.TOOL_RUNTIME_SERVICE_URL ?? 'http://127.0.0.1:4460', serviceToken: token }),
        specialist: clients.specialist ?? createServiceClient({ callerService: 'api-gateway', targetAudience: 'specialist', baseUrl: config?.SPECIALIST_SERVICE_URL ?? 'http://127.0.0.1:4470', serviceToken: token }),
    };

    return {
        clients: resolvedClients,
        services,
        async createCoreConversation(workspaceId, body, commandId) {
            return resolvedClients.core.post('/internal/v1/conversations', body, {
                context: { tenantId: workspaceId, commandId },
                commandId,
            });
        },
        async getCoreConversation(workspaceId, id) {
            return resolvedClients.core.get(`/internal/v1/conversations/${encodeURIComponent(id)}`, {
                context: { tenantId: workspaceId },
            });
        },
        async createCoreGoal(workspaceId, body, commandId) {
            return resolvedClients.core.post('/internal/v1/goals', body, {
                context: { tenantId: workspaceId, commandId },
                commandId,
            });
        },
        async getCoreGoal(workspaceId, id) {
            return resolvedClients.core.get(`/internal/v1/goals/${encodeURIComponent(id)}`, {
                context: { tenantId: workspaceId },
            });
        },
    };
}
