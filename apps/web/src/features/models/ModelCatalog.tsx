"use client";
import { useState } from "react";
import type { Catalog, ModelView } from "@asi/contracts";
import { filterModels, isModelSelectable, modelUnavailableReason, optionalDetail, type RoutingPolicy } from "./catalog";

const LOCALITY_LABELS = { local: "Local", cloud: "Cloud" } as const;
const STATUS_LABELS = { available: "Available", unavailable: "Unavailable", blocked: "Blocked" } as const;

export function ModelCatalog({ catalog, policy = "redacted_cloud", requestedModelId = null, effectiveModelId = null, onSetPreference }: {
  catalog: Catalog<ModelView> | null;
  policy?: RoutingPolicy;
  requestedModelId?: string | null;
  effectiveModelId?: string | null;
  onSetPreference?: (model: ModelView) => void;
}) {
  const [query, setQuery] = useState("");
  if (!catalog) return <p role="status" data-testid="model-catalog-status">Models loading…</p>;
  if (catalog.availability !== "ready") return <p role="status" data-testid="model-catalog-status">{catalog.availability === "permission_denied" ? "Permission denied for model access in this workspace." : "Models are unavailable."}{catalog.reason ? ` (${catalog.reason})` : ""}</p>;
  const items = filterModels(catalog.items, query);
  const mismatch = Boolean(requestedModelId && effectiveModelId && requestedModelId !== effectiveModelId);
  return (
    <div className="model-catalog" data-testid="model-catalog">
      <label htmlFor="model-search">Search models</label>
      <input id="model-search" className="model-search" value={query} onChange={event => setQuery(event.target.value)} />
      {effectiveModelId ? <p className="effective-model" data-testid="effective-model">Effective model: {effectiveModelId}</p> : null}
      {mismatch ? <p className="requested-model" data-testid="requested-model" data-mismatch="true">Requested preference {requestedModelId} differs from the effective model {effectiveModelId}.</p> : null}
      {items.length === 0 ? <p className="model-empty">No models match this search.</p> : (
        <ul className="model-list">
          {items.map(model => {
            const selectable = isModelSelectable(model, policy);
            const reason = modelUnavailableReason(model, policy);
            return (
              <li key={model.modelId} className="model-row" data-testid={`model-${model.modelId}`} data-locality={model.locality} data-status={model.status}>
                <span className="model-name">{model.displayName}</span>
                <span className="model-locality">{LOCALITY_LABELS[model.locality]}</span>
                <span className="model-status">{STATUS_LABELS[model.status]}</span>
                {model.preferred ? <span className="model-preferred">Current preference</span> : null}
                <span className="model-details" data-testid={`model-details-${model.modelId}`}>{optionalDetail(undefined, "Capabilities")}</span>
                <button type="button" disabled={!selectable} onClick={() => onSetPreference?.(model)}>Set as default</button>
                {!selectable && reason ? <span className="model-reason" data-testid={`model-reason-${model.modelId}`}>{reason}</span> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default ModelCatalog;
