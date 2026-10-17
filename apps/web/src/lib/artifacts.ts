import type { ArtifactView } from "@asi/contracts";

export const PREVIEW_LIMIT = 4096;
export const SUMMARY_LIMIT = 280;
const PREVIEWABLE = new Set(["text/plain", "text/markdown"]);

export function isPreviewable(mediaType: string): boolean {
  return PREVIEWABLE.has(mediaType.trim().toLowerCase());
}

export function canAction(artifact: ArtifactView, action: string): boolean {
  return artifact.allowedActions.includes(action);
}

export function artifactContentHref(artifactId: string): string {
  return `/api/ui/v1/artifacts/${encodeURIComponent(artifactId)}/content`;
}

export const downloadHref = artifactContentHref;

export function bounded(text: string, limit = SUMMARY_LIMIT): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit), truncated: true };
}
