// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { applyAppearance, readAppearance, deriveCapabilities, applyLocalPreference, hasUnsavedChanges, validateDraft, buildSettingsCommand, submitSettings } from "@asi/web/features/settings/settings.ts";
import { SettingsPanel } from "@asi/web/features/settings/SettingsPanel.tsx";
import { SettingsViewSchema, type SettingsView } from "../../../packages/contracts/src/ui/index.js";

const makeSettings = (overrides = {}): SettingsView => SettingsViewSchema.parse({ revision: 4, allowedActions: ["settings.update"], availability: "ready", privacyMode: "redacted_cloud", spendLimitMicroUsd: null, retentionDays: 7, notifications: true, scheduleEnabled: false, ...overrides });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); delete document.documentElement.dataset.theme; delete document.documentElement.dataset.reducedMotion; });

describe("appearance is applied locally", () => {
  it("changes the theme without contacting the gateway", () => {
    applyAppearance({ theme: "dark", reducedMotion: true });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.reducedMotion).toBe("true");
    expect(readAppearance()).toEqual({ theme: "dark", reducedMotion: true });
    expect(window.localStorage.getItem("asi.ui.appearance")).toContain("dark");
    const submitCommand = vi.fn();
    render(<SettingsPanel settings={makeSettings()} displayName="Ada" workspaceId="w1" client={{ submitCommand }} />);
    fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "light" } });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(submitCommand).not.toHaveBeenCalled();
  });
});

describe("server preferences use versioned Gateway commands", () => {
  it("builds a settings.update command and submits with the current revision", async () => {
    expect(buildSettingsCommand({ retentionDays: 30 }, 4, "c1")).toEqual({ commandId: "c1", expectedRevision: 4, type: "settings.update", changes: { retentionDays: 30 } });
    const submitCommand = vi.fn(async (command: { commandId: string }) => ({ commandId: command.commandId, status: "applied" as const, revision: 5 }));
    render(<SettingsPanel settings={makeSettings()} displayName="Ada" workspaceId="w1" client={{ submitCommand }} />);
    fireEvent.change(screen.getByLabelText("Retention days"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(submitCommand).toHaveBeenCalledTimes(1));
    expect(submitCommand.mock.calls[0]![0]).toMatchObject({ type: "settings.update", expectedRevision: 4, changes: { retentionDays: 30 } });
  });

  it("routes a gated change to the owning Chat", async () => {
    const submit = vi.fn(async (command: { commandId: string }) => ({ commandId: command.commandId, status: "approval_required" as const, revision: 0, conversationId: "conv-2", interactionId: "inter-2" }));
    const onNavigate = vi.fn();
    const outcome = await submitSettings({ submitCommand: submit }, { privacyMode: "local_only" }, 4, onNavigate);
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ type: "settings.update", expectedRevision: 4, changes: { privacyMode: "local_only" } }));
    expect(outcome).toEqual({ kind: "navigate", href: "/chat/conv-2?interaction=inter-2" });
    expect(onNavigate).toHaveBeenCalledWith("/chat/conv-2?interaction=inter-2");
  });

  it("does not assign a capability from a mode preference", () => {
    const settings = makeSettings({ allowedActions: ["settings.update"] });
    expect(deriveCapabilities(settings)).toEqual(["settings.update"]);
    const changed = applyLocalPreference(settings, { privacyMode: "local_only" });
    expect(changed.privacyMode).toBe("local_only");
    expect(deriveCapabilities(changed)).toEqual(deriveCapabilities(settings));
  });
});

describe("validation and unsaved state", () => {
  it("requires integer monetary units and non-negative retention", () => {
    expect(validateDraft({ spendLimitMicroUsd: 12.5 }).valid).toBe(false);
    expect(validateDraft({ spendLimitMicroUsd: 12.5 }).errors.join(" ")).toMatch(/integer/i);
    expect(validateDraft({ retentionDays: -5 }).valid).toBe(false);
    expect(validateDraft({ retentionDays: 30 }).valid).toBe(true);
    expect(validateDraft({}).valid).toBe(false);
  });

  it("preserves original values on a conflicting change and shows unsaved state", async () => {
    const settings = makeSettings({ retentionDays: 7 });
    const submitCommand = vi.fn(async () => ({ commandId: "c", status: "conflict" as const, revision: 4, error: { code: "STALE_WRITER" as const, safeMessage: "Settings changed; refresh.", retryable: true } }));
    const onRefresh = vi.fn();
    render(<SettingsPanel settings={settings} displayName="Ada" workspaceId="w1" client={{ submitCommand }} onRefresh={onRefresh} />);
    expect(hasUnsavedChanges(settings, {})).toBe(false);
    fireEvent.change(screen.getByLabelText("Retention days"), { target: { value: "30" } });
    expect(screen.getByTestId("unsaved")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Settings changed; refresh.");
    expect(onRefresh).toHaveBeenCalled();
    expect((screen.getByLabelText("Retention days") as HTMLInputElement).value).toBe("7");
  });
});

describe("unsupported administration settings", () => {
  it("stays unavailable rather than offering fake controls", () => {
    render(<SettingsPanel settings={makeSettings()} displayName="Ada" workspaceId="w1" client={{ submitCommand: vi.fn() }} />);
    expect(screen.getByTestId("settings-admin-unavailable")).toHaveTextContent(/unavailable/i);
    expect(screen.queryByLabelText(/manage users/i)).toBeNull();
  });
});
