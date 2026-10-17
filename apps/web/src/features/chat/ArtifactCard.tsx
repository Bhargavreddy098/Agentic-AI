"use client";
import { useState } from "react";
import type { ArtifactView } from "@asi/contracts";
import { artifactContentHref, bounded, canAction, isPreviewable, PREVIEW_LIMIT } from "../../lib/artifacts";

export function ArtifactCard({ artifact, className }: { artifact: ArtifactView; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const previewable = artifact.preview !== undefined && isPreviewable(artifact.mediaType);
  const preview = artifact.preview ?? "";
  const output = bounded(preview, PREVIEW_LIMIT);
  const titleId = `artifact-title-${artifact.artifactId}`;
  return <section className={className ? `artifact-card ${className}` : "artifact-card"} data-testid={`artifact-${artifact.artifactId}`} data-media-type={artifact.mediaType} aria-labelledby={titleId}>
    <h3 id={titleId}>{artifact.title}</h3>
    <p className="artifact-meta">{artifact.mediaType}</p>
    {previewable ? <div className="artifact-preview">
      <pre>{expanded ? preview : output.text}{output.truncated && !expanded ? "…" : ""}</pre>
      {output.truncated ? <button type="button" onClick={() => setExpanded(value => !value)}>{expanded ? "Hide full preview" : "Show full preview"}</button> : null}
    </div> : <p className="artifact-preview-unavailable">Preview is isolated and unavailable for this type in the app context.</p>}
    <div className="artifact-actions">
      {canAction(artifact, "view") ? <a href={artifactContentHref(artifact.artifactId)} target="_blank" rel="noopener noreferrer">View artifact</a> : null}
      {canAction(artifact, "download") ? <a href={artifactContentHref(artifact.artifactId)} download rel="noopener noreferrer">Download artifact</a> : null}
    </div>
  </section>;
}
export default ArtifactCard;
