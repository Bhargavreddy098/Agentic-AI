import type { SettingsView, UiCommandResult, UiMutationCommand } from "@asi/contracts";
import type { GatewayClient } from "../../lib/gateway/client";
import { handleManagementResult, type ManagementOutcome } from "../../lib/management";

export const APPEARANCE_KEY = "asi.ui.appearance";
export type AppearanceTheme = "system" | "light" | "dark";
export type AppearancePreference = { theme: AppearanceTheme; reducedMotion: boolean };
export const DEFAULT_APPEARANCE: AppearancePreference = { theme: "system", reducedMotion: false };

export type SettingsChanges = Extract<UiMutationCommand, { type: "settings.update" }>["changes"];

export function readAppearance(): AppearancePreference {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(APPEARANCE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<AppearancePreference>;
    const theme = parsed.theme === "light" || parsed.theme === "dark" ? parsed.theme : "system";
    return { theme, reducedMotion: Boolean(parsed.reducedMotion) };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function resolveTheme(theme: AppearanceTheme): "light" | "dark" {
  if (theme !== "system") return theme;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyAppearance(preference: AppearancePreference): void {
  if (typeof document === "undefined") return;
  const target = document.documentElement;
  target.dataset.theme = resolveTheme(preference.theme);
  target.dataset.themePreference = preference.theme;
  target.dataset.reducedMotion = String(preference.reducedMotion);
  try { window.localStorage.setItem(APPEARANCE_KEY, JSON.stringify(preference)); } catch { /* appearance is best-effort local state */ }
}

export function deriveCapabilities(settings: SettingsView): string[] {
  return [...settings.allowedActions];
}

export function applyLocalPreference(settings: SettingsView, changes: Partial<Pick<SettingsView, "privacyMode" | "notifications" | "scheduleEnabled" | "retentionDays" | "spendLimitMicroUsd">>): SettingsView {
  return { ...settings, ...changes };
}

export function hasUnsavedChanges(settings: SettingsView, draft: SettingsChanges): boolean {
  return Object.entries(draft).some(([key, value]) => value !== undefined && value !== (settings as unknown as Record<string, unknown>)[key]);
}

export function validateDraft(changes: SettingsChanges): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (Object.keys(changes).length === 0) errors.push("Select at least one change to save.");
  if (changes.spendLimitMicroUsd !== undefined && (!Number.isInteger(changes.spendLimitMicroUsd) || changes.spendLimitMicroUsd < 0)) errors.push("Spend limit must be a whole number of micro-USD (integer, not negative).");
  if (changes.retentionDays !== undefined && (!Number.isInteger(changes.retentionDays) || changes.retentionDays < 0)) errors.push("Retention days must be a whole number (integer, not negative).");
  return { valid: errors.length === 0, errors };
}

export function buildSettingsCommand(changes: SettingsChanges, expectedRevision: number, commandId: string): Extract<UiMutationCommand, { type: "settings.update" }> {
  return { commandId, expectedRevision, type: "settings.update", changes };
}

export async function submitSettings(client: Pick<GatewayClient, "submitCommand">, changes: SettingsChanges, expectedRevision: number, onNavigate: (href: string) => void): Promise<ManagementOutcome> {
  const result: UiCommandResult = await client.submitCommand(buildSettingsCommand(changes, expectedRevision, crypto.randomUUID()));
  const outcome = handleManagementResult(result);
  if (outcome.kind === "navigate") onNavigate(outcome.href);
  return outcome;
}
