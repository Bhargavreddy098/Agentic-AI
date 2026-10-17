"use client";
import type { UsageView } from "@asi/contracts";
import { usageLabel } from "./activity";

export function ActivityUsage({ usage }: { usage: UsageView }) {
  return (
    <dl className="activity-usage" data-testid="activity-usage">
      <dt>Input tokens</dt>
      <dd data-testid="usage-input">{usageLabel(usage.inputTokens, "tokens")}</dd>
      <dt>Output tokens</dt>
      <dd data-testid="usage-output">{usageLabel(usage.outputTokens, "tokens")}</dd>
      <dt>Cost</dt>
      <dd data-testid="usage-cost">{usageLabel(usage.costMicroUsd, "micro-USD")}</dd>
    </dl>
  );
}

export default ActivityUsage;
