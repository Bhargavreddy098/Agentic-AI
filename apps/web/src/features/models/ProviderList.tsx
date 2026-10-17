"use client";
import type { Catalog, ProviderView } from "@asi/contracts";
import { optionalDetail } from "./catalog";

const PROVIDER_LABELS: Record<ProviderView["status"], string> = { connected: "Connected", disconnected: "Disconnected", unavailable: "Unavailable", blocked: "Blocked" };

export function ProviderList({ catalog }: { catalog: Catalog<ProviderView> | null }) {
  if (!catalog) return <p role="status" data-testid="provider-list-status">Providers loading…</p>;
  if (catalog.availability !== "ready") return <p role="status" data-testid="provider-list-status">{catalog.availability === "permission_denied" ? "Permission denied for provider access in this workspace." : "Providers are unavailable."}{catalog.reason ? ` (${catalog.reason})` : ""}</p>;
  if (catalog.items.length === 0) return <p data-testid="provider-list-status">No providers are available to this workspace.</p>;
  return (
    <ul className="provider-list">
      {catalog.items.map(provider => (
        <li key={provider.providerId} className="provider-row" data-testid={`provider-${provider.providerId}`} data-status={provider.status}>
          <span className="provider-name">{provider.displayName}</span>
          <span className="provider-status">{PROVIDER_LABELS[provider.status]}</span>
          <span className="provider-credential">{provider.credentialLabel ? optionalDetail(provider.credentialLabel, "Credential") : "No credential on file"}</span>
        </li>
      ))}
    </ul>
  );
}

export default ProviderList;
