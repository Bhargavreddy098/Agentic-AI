import type { TaskEnvelope, TaskResult, RunContext, Principal } from "@asi/contracts";
import { createOrchestrator, type OrchestratorConfig } from "./run.js";
import type { RunState } from "./transitions.js";
import { executeTask } from "@asi/specialists";

export interface MastraAdapterConfig {
  orchestrator: OrchestratorConfig;
  modelProvider: string;
  maxTokens: number;
}

export interface MastraPort {
  generateText(prompt: string, context: RunContext): Promise<{ text: string; toolCalls?: Array<{ name: string; arguments: unknown }> }>;
  streamText(prompt: string, context: RunContext): AsyncGenerator<{ text: string }>;
}

type MastraObservation =
  | { type: "model"; response: Awaited<ReturnType<MastraPort["generateText"]>> }
  | { type: "tool"; tool: string; result: TaskResult };

export class MastraAdapter {
  private config: MastraAdapterConfig;
  private modelPort: MastraPort;

  constructor(config: MastraAdapterConfig, modelPort: MastraPort) {
    this.config = config;
    this.modelPort = modelPort;
  }

  async executeOrchestration(
    task: TaskEnvelope,
    context: RunContext,
    principal: Principal
  ): Promise<{ result: string | null; observations: MastraObservation[]; modelCalls: number }> {
    const orchestrator = createOrchestrator(this.config.orchestrator);
    const runId = await orchestrator.startRun({
      task,
      principal,
    });

    const observations: MastraObservation[] = [];
    let modelCalls = 0;
    let finalResult: string | null = null;

    while (modelCalls < this.config.orchestrator.maxModelCalls) {
      // Check if we should continue
      const state = orchestrator["runs"].get(runId.runId);
      if (!state || ["completed", "failed", "cancelled"].includes(state.status)) {
        break;
      }

      // Call model
      const modelResponse = await this.modelPort.generateText(
        this.buildPrompt(state),
        context
      );

      modelCalls++;
      observations.push({ type: "model", response: modelResponse });

      // Check for tool calls
      if (modelResponse.toolCalls && modelResponse.toolCalls.length > 0) {
        for (const toolCall of modelResponse.toolCalls) {
          const delegationTask = this.createDelegationTask(state, toolCall);
          
          const toolResult = await executeTask(delegationTask, new AbortController().signal);
          
          observations.push({ 
            type: "tool", 
            tool: toolCall.name, 
            result: toolResult 
          });
        }
      } else {
        // No tool calls, model provided final answer
        finalResult = modelResponse.text;
        break;
      }
    }

    return { result: finalResult, observations, modelCalls };
  }

  private buildPrompt(state: RunState): string {
    // Build prompt from state and observations
    return `Task: ${state.task.input}\nObservations: ${JSON.stringify(state.observations)}`;
  }

  private createDelegationTask(state: RunState, toolCall: { name: string; arguments: unknown }): TaskEnvelope {
    return {
      schemaVersion: 1,
      taskId: `delegation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      traceId: state.task.traceId,
      correlationId: state.task.correlationId,
      causationId: state.task.causationId,
      runContext: state.context,
      requiredCapabilities: ["tool:execution"],
      input: { tool: toolCall.name, arguments: toolCall.arguments },
      principalGrant: state.task.principalGrant,
      idempotencyKey: `delegation-${state.runId}-${state.delegationDepth}`,
    };
  }
}

export function createMastraAdapter(
  config: MastraAdapterConfig,
  modelPort: MastraPort
): MastraAdapter {
  return new MastraAdapter(config, modelPort);
}