"use client";
import { useEffect, useState } from "react";
import type { SettingsView } from "@asi/contracts";
import type { GatewayClient } from "../../lib/gateway/client";
import { DEFAULT_APPEARANCE, applyAppearance, hasUnsavedChanges, readAppearance, submitSettings, validateDraft, type AppearancePreference, type AppearanceTheme, type SettingsChanges } from "./settings";

export function SettingsPanel({ settings, displayName, workspaceId, client, onNavigate, onRefresh }: {
  settings: SettingsView | null;
  displayName: string;
  workspaceId: string;
  client: Pick<GatewayClient, "submitCommand">;
  onNavigate?: (href: string) => void;
  onRefresh?: () => void;
}) {
  const [appearance, setAppearance] = useState<AppearancePreference>(DEFAULT_APPEARANCE);
  const [draft, setDraft] = useState<SettingsChanges>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setAppearance(readAppearance()); }, []);

  const updateAppearance = (next: AppearancePreference) => { setAppearance(next); applyAppearance(next); };
  const patchDraft = (patch: SettingsChanges) => { setDraft(previous => ({ ...previous, ...patch })); setErrors([]); };

  async function save() {
    if (!settings || busy) return;
    const result = validateDraft(draft);
    if (!result.valid) { setErrors(result.errors); return; }
    setBusy(true);
    try {
      const outcome = await submitSettings(client, draft, settings.revision, href => onNavigate?.(href));
      setDraft({});
      if (outcome.kind === "applied") { onRefresh?.(); setMessage("Settings saved."); }
      else if (outcome.kind === "navigate") { setMessage("An approval was requested in Chat."); }
      else { onRefresh?.(); setMessage(outcome.message); }
    } catch {
      setMessage("Settings update unavailable.");
    } finally {
      setBusy(false);
    }
  }

  const unsaved = settings ? hasUnsavedChanges(settings, draft) : false;

  return (
    <div className="settings-panel" data-testid="settings-panel">
      <section className="settings-identity" aria-label="Profile and workspace">
        <h2>Profile and workspace</h2>
        <p className="settings-profile" data-testid="settings-profile">{displayName} · {workspaceId}</p>
      </section>

      <section className="settings-appearance" aria-label="Appearance">
        <h2>Appearance</h2>
        <label htmlFor="settings-theme">Theme</label>
        <select id="settings-theme" value={appearance.theme} onChange={event => updateAppearance({ ...appearance, theme: event.target.value as AppearanceTheme })}>
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
        <label htmlFor="settings-reduced-motion">Reduce motion</label>
        <input id="settings-reduced-motion" type="checkbox" checked={appearance.reducedMotion} onChange={event => updateAppearance({ ...appearance, reducedMotion: event.target.checked })} />
      </section>

      {settings ? (
        <section className="settings-server" aria-label="Server preferences">
          <h2>Server preferences</h2>
          <label htmlFor="settings-privacy">Privacy mode</label>
          <select id="settings-privacy" value={draft.privacyMode ?? settings.privacyMode} onChange={event => patchDraft({ privacyMode: event.target.value as SettingsChanges["privacyMode"] })}>
            {settings.privacyMode === "unavailable" ? <option value="unavailable">Unavailable</option> : null}
            <option value="local_only">Local only</option>
            <option value="redacted_cloud">Redacted cloud</option>
          </select>
          <label htmlFor="settings-notifications">Notifications</label>
          <input id="settings-notifications" type="checkbox" checked={draft.notifications ?? settings.notifications} onChange={event => patchDraft({ notifications: event.target.checked })} />
          <label htmlFor="settings-schedule">Scheduled runs</label>
          <input id="settings-schedule" type="checkbox" checked={draft.scheduleEnabled ?? settings.scheduleEnabled} onChange={event => patchDraft({ scheduleEnabled: event.target.checked })} />
          <label htmlFor="settings-spend">Spend limit (micro-USD)</label>
          <input id="settings-spend" type="number" value={draft.spendLimitMicroUsd ?? settings.spendLimitMicroUsd ?? ""} onChange={event => patchDraft({ spendLimitMicroUsd: event.target.value === "" ? undefined : Number(event.target.value) })} />
          <label htmlFor="settings-retention">Retention days</label>
          <input id="settings-retention" type="number" value={draft.retentionDays ?? settings.retentionDays ?? ""} onChange={event => patchDraft({ retentionDays: event.target.value === "" ? undefined : Number(event.target.value) })} />
          {errors.length > 0 ? <ul className="settings-errors" data-testid="settings-errors">{errors.map(error => <li key={error}>{error}</li>)}</ul> : null}
          {unsaved ? <p className="settings-unsaved" data-testid="unsaved">Unsaved changes</p> : null}
          <button type="button" onClick={() => { void save(); }} disabled={busy}>Save changes</button>
          {message ? <p role="status" className="settings-status">{message}</p> : null}
        </section>
      ) : <p role="status">Loading settings…</p>}

      <section className="settings-admin" data-testid="settings-admin-unavailable">
        <h2>Administration</h2>
        <p>Administration settings are unavailable in this build.</p>
      </section>
    </div>
  );
}

export default SettingsPanel;
