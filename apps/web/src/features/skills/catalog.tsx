"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Catalog, SkillView, UiCommandResult, UiMutationCommand } from "@asi/contracts";
import type { GatewayClient } from "../../lib/gateway/client";
import { handleManagementResult, type ManagementOutcome } from "../../lib/management";

export type SkillCommand = Extract<UiMutationCommand, { type: "skill.install" | "skill.enable" | "skill.disable" | "skill.revoke" }>;

export function isSkillSelectable(skill: SkillView): boolean {
  return skill.status === "enabled" && skill.trustStatus === "verified";
}

export function skillSelectabilityReason(skill: SkillView): string | null {
  if (skill.trustStatus === "revoked") return "Revoked by the security review; it cannot be selected.";
  if (skill.trustStatus === "pending") return "Trust verification is pending.";
  if (skill.status === "unavailable") return "Unavailable for this workspace.";
  if (skill.status === "disabled") return "Disabled for this workspace.";
  return null;
}

export function filterSkills(skills: SkillView[], query: string): SkillView[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return skills;
  return skills.filter(skill => skill.displayName.toLowerCase().includes(needle) || skill.skillId.toLowerCase().includes(needle) || skill.description.toLowerCase().includes(needle));
}

export function permissionExpansion(skill: SkillView, granted: readonly string[] = []): string[] {
  const have = new Set(granted);
  return skill.requiredPermissions.filter(permission => !have.has(permission));
}

export function reconcileSelection(selected: readonly string[], catalog: Catalog<SkillView> | null): { selectable: string[]; dropped: string[] } {
  const enabled = new Set(catalog?.items.filter(isSkillSelectable).map(skill => skill.skillId) ?? []);
  return { selectable: selected.filter(id => enabled.has(id)), dropped: selected.filter(id => !enabled.has(id)) };
}

export async function submitSkillCommand(client: Pick<GatewayClient, "submitCommand">, command: SkillCommand, onNavigate: (href: string) => void): Promise<ManagementOutcome> {
  const result: UiCommandResult = await client.submitCommand(command);
  const outcome = handleManagementResult(result);
  if (outcome.kind === "navigate") onNavigate(outcome.href);
  return outcome;
}

export const installSkill = (client: Pick<GatewayClient, "submitCommand">, skill: SkillView, onNavigate: (href: string) => void) => submitSkillCommand(client, { commandId: crypto.randomUUID(), expectedRevision: skill.revision, type: "skill.install", skillId: skill.skillId, skillVersion: skill.skillVersion }, onNavigate);
export const enableSkill = (client: Pick<GatewayClient, "submitCommand">, skill: SkillView, onNavigate: (href: string) => void) => submitSkillCommand(client, { commandId: crypto.randomUUID(), expectedRevision: skill.revision, type: "skill.enable", skillId: skill.skillId }, onNavigate);
export const disableSkill = (client: Pick<GatewayClient, "submitCommand">, skill: SkillView, onNavigate: (href: string) => void) => submitSkillCommand(client, { commandId: crypto.randomUUID(), expectedRevision: skill.revision, type: "skill.disable", skillId: skill.skillId }, onNavigate);
export const revokeSkill = (client: Pick<GatewayClient, "submitCommand">, skill: SkillView, onNavigate: (href: string) => void) => submitSkillCommand(client, { commandId: crypto.randomUUID(), expectedRevision: skill.revision, type: "skill.revoke", skillId: skill.skillId }, onNavigate);

export type SkillsState = { skills: Catalog<SkillView> | null; loading: boolean; refresh: () => Promise<void> };
const Context = createContext<SkillsState | null>(null);
export function useSkills(): SkillsState { const value = useContext(Context); if (!value) throw new Error("Skills provider missing"); return value; }

export function SkillsProvider({ client, children }: { client: Pick<GatewayClient, "getSkills">; children: ReactNode }) {
  const [skills, setSkills] = useState<Catalog<SkillView> | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setSkills(await client.getSkills()); }
    finally { setLoading(false); }
  }, [client]);
  useEffect(() => { void refresh(); }, [refresh]);
  return <Context.Provider value={{ skills, loading, refresh }}>{children}</Context.Provider>;
}
