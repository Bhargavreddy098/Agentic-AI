import { MeterProvider } from "@opentelemetry/sdk-metrics";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

// Importing the facade never starts an exporter or a periodic network task.
const meterProvider = new MeterProvider({
  resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: "asi-agent-system" }),
  readers: [],
});
const meter = meterProvider.getMeter("asi-agent-system");

const runCounter = meter.createCounter("asi.run.count", {
  description: "Total number of runs started",
  unit: "1",
});

const runDuration = meter.createHistogram("asi.run.duration", {
  description: "Duration of runs in milliseconds",
  unit: "ms",
});

const runErrors = meter.createCounter("asi.run.errors", {
  description: "Total number of run errors",
  unit: "1",
});

const tokenUsage = meter.createCounter("asi.tokens.total", {
  description: "Total tokens used",
  unit: "1",
});

const tokenCost = meter.createCounter("asi.cost.micro_usd", {
  description: "Total cost in micro USD",
  unit: "1",
});

const toolCalls = meter.createCounter("asi.tool.calls", {
  description: "Total tool calls",
  unit: "1",
});

const toolDuration = meter.createHistogram("asi.tool.duration", {
  description: "Tool execution duration in milliseconds",
  unit: "ms",
});

const toolErrors = meter.createCounter("asi.tool.errors", {
  description: "Total tool errors",
  unit: "1",
});

const memoryWrites = meter.createCounter("asi.memory.writes", {
  description: "Total memory writes",
  unit: "1",
});

const memoryQueries = meter.createCounter("asi.memory.queries", {
  description: "Total memory queries",
  unit: "1",
});

const policyDecisions = meter.createCounter("asi.policy.decisions", {
  description: "Total policy decisions",
  unit: "1",
});

const policyDenials = meter.createCounter("asi.policy.denials", {
  description: "Total policy denials",
  unit: "1",
});

const approvalsRequested = meter.createCounter("asi.approvals.requested", {
  description: "Total approvals requested",
  unit: "1",
});

const approvalsApproved = meter.createCounter("asi.approvals.approved", {
  description: "Total approvals approved",
  unit: "1",
});

const approvalsDenied = meter.createCounter("asi.approvals.denied", {
  description: "Total approvals denied",
  unit: "1",
});

const queueDepth = meter.createGauge("asi.queue.depth", {
  description: "Current queue depth",
  unit: "1",
});

const writerLeaseActive = meter.createGauge("asi.writer_lease.active", {
  description: "Active writer lease",
  unit: "1",
});

let metricsEnabled = true;

export function configureMetrics(enabled: boolean): void {
  metricsEnabled = enabled;
}

export function recordRunStart(tenantId: string): void {
  if (!metricsEnabled) return;
  runCounter.add(1, { tenant: tenantId });
}

export function recordRunEnd(tenantId: string, durationMs: number, success: boolean): void {
  if (!metricsEnabled) return;
  runDuration.record(durationMs, { tenant: tenantId, success: String(success) });
  if (!success) {
    runErrors.add(1, { tenant: tenantId });
  }
}

export function recordUsage(tenantId: string, tokens: number, costMicroUsd: number): void {
  if (!metricsEnabled) return;
  tokenUsage.add(tokens, { tenant: tenantId });
  tokenCost.add(costMicroUsd, { tenant: tenantId });
}

export function recordToolCall(tenantId: string, toolName: string, durationMs: number, success: boolean): void {
  if (!metricsEnabled) return;
  toolCalls.add(1, { tenant: tenantId, tool: toolName, success: String(success) });
  toolDuration.record(durationMs, { tenant: tenantId, tool: toolName, success: String(success) });
  if (!success) {
    toolErrors.add(1, { tenant: tenantId, tool: toolName });
  }
}

export function recordMemoryWrite(tenantId: string, scope: string): void {
  if (!metricsEnabled) return;
  memoryWrites.add(1, { tenant: tenantId, scope });
}

export function recordMemoryQuery(tenantId: string, scope: string): void {
  if (!metricsEnabled) return;
  memoryQueries.add(1, { tenant: tenantId, scope });
}

export function recordPolicyDecision(tenantId: string, decision: "allow" | "deny"): void {
  if (!metricsEnabled) return;
  policyDecisions.add(1, { tenant: tenantId, decision });
  if (decision === "deny") {
    policyDenials.add(1, { tenant: tenantId });
  }
}

export function recordApprovalRequest(tenantId: string): void {
  if (!metricsEnabled) return;
  approvalsRequested.add(1, { tenant: tenantId });
}

export function recordApprovalDecision(tenantId: string, decision: "approve" | "deny"): void {
  if (!metricsEnabled) return;
  if (decision === "approve") {
    approvalsApproved.add(1, { tenant: tenantId });
  } else {
    approvalsDenied.add(1, { tenant: tenantId });
  }
}

export function setQueueDepth(depth: number, tenantId: string): void {
  if (!metricsEnabled) return;
  queueDepth.record(depth, { tenant: tenantId });
}

export function setWriterLeaseActive(active: boolean, tenantId: string): void {
  if (!metricsEnabled) return;
  writerLeaseActive.record(active ? 1 : 0, { tenant: tenantId });
}

export function isMetricsEnabled(): boolean {
  return metricsEnabled;
}