"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ModelView } from "@asi/contracts";
import { useWorkspace } from "../shell/WorkspaceProvider";
import { CatalogProvider, useCatalogs, preferModel, type RoutingPolicy } from "./catalog";
import { ProviderList } from "./ProviderList";
import { ModelCatalog } from "./ModelCatalog";
import { ConnectionForm } from "./ConnectionForm";

function ModelsView() {
  const { client } = useWorkspace();
  const router = useRouter();
  const { providers, models } = useCatalogs();
  const [policy, setPolicy] = useState<RoutingPolicy>("redacted_cloud");
  const [notice, setNotice] = useState<string | null>(null);
  const demoMode = process.env.NEXT_PUBLIC_ASI_UI_MODE === "demo";

  useEffect(() => {
    let active = true;
    void (async () => {
      try { const settings = await client.getSettings(); if (active) setPolicy(settings.privacyMode); } catch { /* keep default policy */ }
    })();
    return () => { active = false; };
  }, [client]);

  const openInteraction = (href: string) => { setNotice("An approval was requested in Chat."); router.push(href); };
  const connectable = useMemo(() => providers?.availability === "ready" ? providers.items.find(provider => provider.status === "disconnected") ?? null : null, [providers]);
  const effectiveModelId = useMemo(() => models?.items.find(model => model.preferred)?.modelId ?? null, [models]);

  async function setPreference(model: ModelView) {
    const outcome = await preferModel(client, model.modelId, model.revision, openInteraction);
    if (outcome.kind === "applied") setNotice(`${model.displayName} is now the requested default.`);
    else if (outcome.kind === "error") setNotice(outcome.message);
  }

  return (
    <main className="section-page">
      <div className="section-kicker">WORKSPACE</div>
      <h1>Models &amp; Providers</h1>
      <p className="section-lede">Select a backend-authorized model and review the providers available to this workspace.</p>
      {notice ? <p role="status" className="section-notice">{notice}</p> : null}
      <section className="models-providers" aria-label="Providers">
        <h2>Providers</h2>
        <ProviderList catalog={providers} />
        {connectable ? <ConnectionForm mode={demoMode ? "demo" : "live"} providerId={connectable.providerId} submit={command => client.submitCommand(command)} onNavigate={openInteraction} /> : null}
      </section>
      <section className="models-catalog" aria-label="Models">
        <h2>Models</h2>
        <ModelCatalog catalog={models} policy={policy} effectiveModelId={effectiveModelId} onSetPreference={model => { void setPreference(model); }} />
      </section>
    </main>
  );
}

export default function ModelsPage() {
  const { client } = useWorkspace();
  return <CatalogProvider client={client}><ModelsView /></CatalogProvider>;
}
