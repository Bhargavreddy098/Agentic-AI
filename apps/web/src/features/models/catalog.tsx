"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Catalog, ModelView, ProviderView } from "@asi/contracts";
import type { GatewayClient } from "../../lib/gateway/client";
import { handleManagementResult, type ManagementOutcome } from "../../lib/management";

export type RoutingPolicy = "local_only" | "redacted_cloud" | "unavailable";
export const LOCAL_ONLY_NOTICE = "Local-only routing policy keeps this cloud model unavailable.";

export function isModelSelectable(model: ModelView, policy: RoutingPolicy = "redacted_cloud"): boolean {
  if (model.status !== "available") return false;
  if (!model.allowedActions.includes("model.preference.set")) return false;
  if (policy === "local_only" && model.locality === "cloud") return false;
  return true;
}

export function modelUnavailableReason(model: ModelView, policy: RoutingPolicy = "redacted_cloud"): string | null {
  if (policy === "local_only" && model.locality === "cloud") return LOCAL_ONLY_NOTICE;
  if (model.status === "unavailable") return "Unavailable for this workspace.";
  if (model.status === "blocked") return "Blocked by workspace policy.";
  if (!model.allowedActions.includes("model.preference.set")) return "Changing the default preference is not permitted.";
  return null;
}

export function filterModels(models: ModelView[], query: string): ModelView[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return models;
  return models.filter(model => model.displayName.toLowerCase().includes(needle) || model.modelId.toLowerCase().includes(needle));
}

export function optionalDetail(value: string | number | null | undefined, label: string): string {
  return `${label}: ${value === null || value === undefined ? "Not provided by the backend" : value}`;
}

export async function preferModel(client: Pick<GatewayClient, "submitCommand">, modelId: string, expectedRevision: number, onNavigate: (href: string) => void): Promise<ManagementOutcome> {
  const result = await client.submitCommand({ commandId: crypto.randomUUID(), expectedRevision, type: "model.preference.set", modelId });
  const outcome = handleManagementResult(result);
  if (outcome.kind === "navigate") onNavigate(outcome.href);
  return outcome;
}

export type CatalogsState = { providers: Catalog<ProviderView> | null; models: Catalog<ModelView> | null; loading: boolean; refresh: () => Promise<void> };
const Context = createContext<CatalogsState | null>(null);
export function useCatalogs(): CatalogsState { const value = useContext(Context); if (!value) throw new Error("Catalog provider missing"); return value; }

export function CatalogProvider({ client, children }: { client: Pick<GatewayClient, "getProviders" | "getModels">; children: ReactNode }) {
  const [providers, setProviders] = useState<Catalog<ProviderView> | null>(null);
  const [models, setModels] = useState<Catalog<ModelView> | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { const [nextProviders, nextModels] = await Promise.all([client.getProviders(), client.getModels()]); setProviders(nextProviders); setModels(nextModels); }
    finally { setLoading(false); }
  }, [client]);
  useEffect(() => { void refresh(); }, [refresh]);
  return <Context.Provider value={{ providers, models, loading, refresh }}>{children}</Context.Provider>;
}
