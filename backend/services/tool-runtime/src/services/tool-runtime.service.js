import { createToolRuntimeModel } from '../models/index.js';

export function createToolRuntimeService(owners = {}) {
    const toolRuntimeModel = owners.toolRuntime ?? createToolRuntimeModel(owners);
    return {
        toolRuntimeModel,
        clients: owners.clients ?? {},
        registerManifest: (input, ctx) => toolRuntimeModel.registerToolManifest(input, ctx),
        listManifests: ctx => toolRuntimeModel.listToolManifests(ctx),
        executeTool: (input, ctx) => toolRuntimeModel.executeGovernedTool(input, ctx),
        getExecutionStatus: (id, ctx) => toolRuntimeModel.getExecutionStatus(id, ctx),
    };
}
