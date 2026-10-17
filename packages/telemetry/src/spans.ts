import { trace, SpanStatusCode, type Span, type Attributes } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import type { RunContext, OpaqueId } from "@asi/contracts";
import { redactString, redactSpanAttributes } from "./redaction.js";

// Local process handle: never a serialized contract or an authority token.
export interface TraceHandle {
  readonly span: Span | null;
  end(status?: "ok" | "error", message?: string): void;
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  setAttribute(key: string, value: string | number | boolean): void;
}
export interface TelemetryConfig {
  enableExporter: boolean;
  exporterEndpoint?: string;
}
let provider: NodeTracerProvider | undefined;
let telemetryEnabled = false;

export function configureTelemetry(config: TelemetryConfig): void {
  telemetryEnabled = config.enableExporter;
  if (!telemetryEnabled || provider) return;
  const exporter = new OTLPTraceExporter({
    url: config.exporterEndpoint ?? process.env["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"] ?? "http://localhost:4318/v1/traces",
  });
  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: "asi-agent-system" }),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register();
}

function safeAttributes(input: Record<string, unknown>): Attributes {
  const result: Attributes = {};
  for (const [key, value] of Object.entries(redactSpanAttributes(input))) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") result[key] = value;
  }
  return result;
}
function handle(span: Span | null): TraceHandle {
  return {
    span,
    end(status = "ok", message) {
      if (!span) return;
      span.setStatus(status === "error"
        ? { code: SpanStatusCode.ERROR, ...(message === undefined ? {} : { message: redactString(message) }) }
        : { code: SpanStatusCode.OK });
      span.end();
    },
    addEvent(name, attributes) { span?.addEvent(redactString(name), safeAttributes(attributes ?? {})); },
    setAttribute(key, value) { span?.setAttribute(key, typeof value === "string" ? redactString(value) : value); },
  };
}
function start(name: string, attributes: Record<string, unknown>): TraceHandle {
  if (!telemetryEnabled || !provider) return handle(null);
  return handle(provider.getTracer("asi-agent-system").startSpan(name, { attributes: safeAttributes(attributes) }));
}
export function startRunSpan(ctx: RunContext): TraceHandle {
  return start("run", {
    "asi.run.id": ctx.runId, "asi.session.id": ctx.sessionId,
    "asi.writer.epoch": ctx.writerEpoch, "asi.mode": ctx.mode,
    "asi.deadline": ctx.deadlineAt, "asi.budget.tenant": ctx.budgetRef.tenantId,
    "asi.budget.account": ctx.budgetRef.accountId, "asi.budget.root_run": ctx.budgetRef.rootRunId,
    "asi.parent_run": ctx.parentRunId ?? "",
  });
}
export function recordUsage(ctx: RunContext, tokens: number, costMicroUsd: number): void {
  if (!telemetryEnabled) return;
  const span = trace.getActiveSpan();
  span?.setAttribute("asi.run.id", ctx.runId);
  span?.setAttribute("asi.usage.total_tokens", tokens);
  span?.setAttribute("asi.usage.cost_micro_usd", costMicroUsd);
}
export function recordQuality(ctx: RunContext, evalId: string, score: number): void {
  if (!telemetryEnabled) return;
  const span = trace.getActiveSpan();
  span?.setAttribute("asi.quality.eval_id", redactString(evalId));
  span?.setAttribute("asi.quality.score", score);
}
export function startTaskSpan(ctx: RunContext, taskId: OpaqueId, taskType: string): TraceHandle {
  return start("task", { "asi.task.id": taskId, "asi.task.type": taskType, "asi.run.id": ctx.runId, "asi.session.id": ctx.sessionId });
}
export function startEffectSpan(ctx: RunContext, effectId: OpaqueId, action: string, resource: string): TraceHandle {
  return start("effect", { "asi.effect.id": effectId, "asi.effect.action": action, "asi.effect.resource": resource, "asi.run.id": ctx.runId, "asi.session.id": ctx.sessionId });
}
export function isTelemetryEnabled(): boolean { return telemetryEnabled; }
