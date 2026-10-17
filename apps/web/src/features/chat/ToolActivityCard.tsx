"use client";
import { useState } from "react";
import type { ToolView } from "@asi/contracts";
import { artifactContentHref, bounded, SUMMARY_LIMIT } from "../../lib/artifacts";

const TOOL_LABELS: Record<ToolView["status"], string> = { planned: "Planned", executing: "Executing", succeeded: "Succeeded", failed: "Failed", unknown: "Unknown outcome" };

export function ToolActivityCard({ tool, className }: { tool: ToolView; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const output = bounded(tool.summary, SUMMARY_LIMIT);
  const artifactRef = tool.evidenceRefs[0];
  const titleId = `tool-title-${tool.toolId}`;
  return <section className={className ? `tool-card ${className}` : "tool-card"} data-testid={`tool-${tool.toolId}`} data-status={tool.status} data-run-id={tool.runId} data-artifact-ref={artifactRef} aria-labelledby={titleId}>
    <h3 id={titleId}>Tool activity</h3>
    <p className="tool-status" role="status" aria-live="polite">{TOOL_LABELS[tool.status]}</p>
    <p className="tool-summary">{expanded ? tool.summary : output.text}{output.truncated && !expanded ? "…" : ""}</p>
    {output.truncated ? <button type="button" onClick={() => setExpanded(value => !value)}>{expanded ? "Hide full summary" : "Show full summary"}</button> : null}
    {artifactRef && output.truncated ? <a className="tool-artifact-link" href={artifactContentHref(artifactRef)} rel="noopener noreferrer">Full output artifact {artifactRef}</a> : null}
  </section>;
}
export default ToolActivityCard;
