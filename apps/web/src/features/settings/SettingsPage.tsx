"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SettingsView } from "@asi/contracts";
import { useWorkspace } from "../shell/WorkspaceProvider";
import { SettingsPanel } from "./SettingsPanel";

export default function SettingsPage() {
  const { client, session } = useWorkspace();
  const router = useRouter();
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const refresh = useCallback(async () => {
    try { setSettings(await client.getSettings()); } catch { /* keep the last known settings */ }
  }, [client]);
  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <main className="section-page">
      <div className="section-kicker">WORKSPACE</div>
      <h1>Settings</h1>
      <p className="section-lede">Appearance applies locally; privacy, budget, retention and schedule changes go through the protected Gateway.</p>
      <SettingsPanel settings={settings} displayName={session?.displayName ?? "No authenticated workspace"} workspaceId={session?.workspaceId ?? "unknown"} client={client} onNavigate={href => router.push(href)} onRefresh={refresh} />
    </main>
  );
}
