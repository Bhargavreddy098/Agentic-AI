export {
  configureTelemetry,
  startRunSpan,
  recordUsage,
  recordQuality,
  startTaskSpan,
  startEffectSpan,
  isTelemetryEnabled,
  type TraceHandle,
  type TelemetryConfig,
} from "./spans.js";

export {
  configureRedaction,
  redactString,
  redactSpanAttributes,
  redactObject,
  redactSpan,
  isRedactionEnabled,
  type RedactionRule,
  type RedactionConfig,
} from "./redaction.js";

export {
  configureMetrics,
  recordRunStart,
  recordRunEnd,
  recordUsage as recordMetricUsage,
  recordToolCall,
  recordMemoryWrite,
  recordMemoryQuery,
  recordPolicyDecision,
  recordApprovalRequest,
  recordApprovalDecision,
  setQueueDepth,
  setWriterLeaseActive,
  isMetricsEnabled,
} from "./metrics.js";