// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SkillsProvider, useSkills, isSkillSelectable, skillSelectabilityReason, filterSkills, permissionExpansion, reconcileSelection, submitSkillCommand, installSkill, enableSkill, disableSkill, revokeSkill } from "@asi/web/features/skills/catalog.tsx";
import { SkillCatalog } from "@asi/web/features/skills/SkillCatalog.tsx";
import { SkillViewSchema, type Catalog, type SkillView } from "../../../packages/contracts/src/ui/index.js";

const makeSkill = (overrides = {}): SkillView => SkillViewSchema.parse({ skillId: "s1", displayName: "Summarize", description: "Summarizes text.", skillVersion: "1.0.0", status: "enabled", trustStatus: "verified", requiredPermissions: [], revision: 1, allowedActions: ["skill.enable", "skill.disable", "skill.revoke"], ...overrides });
const skillCatalog = (items: SkillView[]): Catalog<SkillView> => ({ items, revision: 1, availability: "ready" });
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete (window as unknown as { __sk_executed?: boolean }).__sk_executed; });

describe("SkillCatalog status and selectability", () => {
  it("renders verified/disabled/revoked/unavailable distinctly and blocks selection", () => {
    const disabled = makeSkill({ skillId: "s2", displayName: "Disabled", status: "disabled" });
    const revoked = makeSkill({ skillId: "s3", displayName: "Revoked", trustStatus: "revoked" });
    const pending = makeSkill({ skillId: "s4", displayName: "Pending", trustStatus: "pending" });
    const unavailable = makeSkill({ skillId: "s5", displayName: "Unavailable", status: "unavailable" });
    render(<SkillCatalog catalog={skillCatalog([makeSkill(), disabled, revoked, pending, unavailable])} />);
    expect(screen.getByTestId("skill-s1")).toHaveAttribute("data-status", "enabled");
    expect(screen.getByTestId("skill-s1")).toHaveAttribute("data-trust", "verified");
    expect(screen.getByTestId("skill-s2")).toHaveAttribute("data-status", "disabled");
    expect(screen.getByTestId("skill-s3")).toHaveAttribute("data-trust", "revoked");
    expect(screen.getByTestId("skill-s4")).toHaveAttribute("data-trust", "pending");
    expect(screen.getByTestId("skill-s5")).toHaveAttribute("data-status", "unavailable");
    expect(screen.getByTestId("skill-select-s1")).toBeEnabled();
    expect(screen.getByTestId("skill-select-s2")).toBeDisabled();
    expect(screen.getByTestId("skill-select-s3")).toBeDisabled();
    expect(screen.getByTestId("skill-select-s5")).toBeDisabled();
    expect(screen.getByTestId("skill-reason-s3")).toHaveTextContent(/revoked/i);
    expect(screen.getByTestId("skill-reason-s4")).toHaveTextContent(/pending/i);
    expect(isSkillSelectable(makeSkill())).toBe(true);
    expect(isSkillSelectable(revoked)).toBe(false);
    expect(isSkillSelectable(unavailable)).toBe(false);
    expect(skillSelectabilityReason(revoked)).toMatch(/revoked/i);
  });

  it("filters the shared catalog by search", () => {
    expect(filterSkills([makeSkill(), makeSkill({ skillId: "s2", displayName: "Translate" })], "trans").map(s => s.skillId)).toEqual(["s2"]);
    render(<SkillCatalog catalog={skillCatalog([makeSkill(), makeSkill({ skillId: "s2", displayName: "Translate" })])} />);
    fireEvent.change(screen.getByLabelText("Search skills"), { target: { value: "trans" } });
    expect(screen.queryByTestId("skill-s1")).toBeNull();
    expect(screen.getByTestId("skill-s2")).toBeTruthy();
  });

  it("surfaces empty, permission-denied and pending-trust states", () => {
    const { unmount } = render(<SkillCatalog catalog={{ items: [], revision: 0, availability: "ready" }} />);
    expect(screen.getByTestId("skill-catalog-status")).toHaveTextContent(/no skills/i);
    unmount();
    const denied = render(<SkillCatalog catalog={{ items: [], revision: 0, availability: "permission_denied" }} />);
    expect(screen.getByTestId("skill-catalog-status")).toHaveTextContent(/permission/i);
    denied.unmount();
    render(<SkillCatalog catalog={skillCatalog([makeSkill({ skillId: "s4", trustStatus: "pending" })])} />);
    expect(screen.getByTestId("skill-reason-s4")).toHaveTextContent(/pending/i);
  });

  it("keeps revoked skills out of the selection and read-only in history", () => {
    const catalog = skillCatalog([makeSkill()]);
    expect(reconcileSelection(["s1", "s3"], catalog)).toEqual({ selectable: ["s1"], dropped: ["s3"] });
    render(<SkillCatalog catalog={catalog} selected={["s3"]} historicReferences={["s3"]} />);
    expect(screen.queryByTestId("skill-select-s3")).toBeNull();
    expect(screen.getByTestId("skill-historic-s3")).toHaveTextContent(/read-only/i);
  });
});

describe("skill installation never executes scripts", () => {
  it("renders embedded script text literally and only submits a command", async () => {
    const malicious = makeSkill({ skillId: "s9", displayName: "Malicious", description: "<script>window.__sk_executed = true</script> bad" });
    render(<SkillCatalog catalog={skillCatalog([malicious])} />);
    expect((window as unknown as { __sk_executed?: boolean }).__sk_executed).toBeUndefined();
    expect(screen.getByText(/window.__sk_executed = true/)).toBeTruthy();
    const submitCommand = vi.fn(async (command: { commandId: string }) => ({ commandId: command.commandId, status: "applied" as const, revision: 2 }));
    await installSkill({ submitCommand }, malicious, () => {});
    expect(submitCommand).toHaveBeenCalledTimes(1);
    expect((window as unknown as { __sk_executed?: boolean }).__sk_executed).toBeUndefined();
  });
});

describe("skill command outcomes", () => {
  it("routes permission expansion to the owning Chat approval", async () => {
    const submitCommand = vi.fn(async (command: { commandId: string }) => ({ commandId: command.commandId, status: "approval_required" as const, revision: 0, conversationId: "conv-7", interactionId: "inter-7" }));
    const onNavigate = vi.fn();
    const outcome = await installSkill({ submitCommand }, makeSkill({ requiredPermissions: ["net.fetch"] }), onNavigate);
    expect(submitCommand).toHaveBeenCalledWith(expect.objectContaining({ type: "skill.install", skillId: "s1", skillVersion: "1.0.0", expectedRevision: 1 }));
    expect(outcome).toEqual({ kind: "navigate", href: "/chat/conv-7?interaction=inter-7" });
    expect(onNavigate).toHaveBeenCalledWith("/chat/conv-7?interaction=inter-7");
    expect(permissionExpansion(makeSkill({ requiredPermissions: ["net.fetch", "fs.read"] }), ["net.fetch"])).toEqual(["fs.read"]);
  });

  it("maps applied, conflict and rejected outcomes without navigating", async () => {
    const onNavigate = vi.fn();
    expect(await enableSkill({ submitCommand: vi.fn(async (command: { commandId: string }) => ({ commandId: command.commandId, status: "applied" as const, revision: 5 })) }, makeSkill(), onNavigate)).toEqual({ kind: "applied", revision: 5 });
    expect(await disableSkill({ submitCommand: vi.fn(async (command: { commandId: string }) => ({ commandId: command.commandId, status: "conflict" as const, revision: 1, error: { code: "STALE_WRITER" as const, safeMessage: "Stale.", retryable: true } })) }, makeSkill(), onNavigate)).toEqual({ kind: "error", code: "STALE_WRITER", message: "Stale." });
    expect(await revokeSkill({ submitCommand: vi.fn(async (command: { commandId: string }) => ({ commandId: command.commandId, status: "rejected" as const, revision: 1, error: { code: "POLICY_DENIED" as const, safeMessage: "Denied.", retryable: false } })) }, makeSkill(), onNavigate)).toEqual({ kind: "error", code: "POLICY_DENIED", message: "Denied." });
    expect(onNavigate).not.toHaveBeenCalled();
    const applied = vi.fn(async (command: { commandId: string }) => ({ commandId: command.commandId, status: "applied" as const, revision: 3 }));
    await submitSkillCommand({ submitCommand: applied }, { commandId: "c1", expectedRevision: 1, type: "skill.revoke", skillId: "s1" }, onNavigate);
    expect(applied).toHaveBeenCalledWith({ commandId: "c1", expectedRevision: 1, type: "skill.revoke", skillId: "s1" });
  });
});

describe("shared skill query ownership", () => {
  it("serves the page and any composer consumer from one query result", async () => {
    const getSkills = vi.fn(async () => skillCatalog([makeSkill()]));
    function Consumer({ name }: { name: string }) { const { skills } = useSkills(); return <span data-testid={`consumer-${name}`}>{skills?.items[0]?.skillId}</span>; }
    render(<SkillsProvider client={{ getSkills }}><Consumer name="page" /><Consumer name="composer" /></SkillsProvider>);
    await waitFor(() => expect(screen.getByTestId("consumer-page")).toHaveTextContent("s1"));
    expect(getSkills).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("consumer-composer")).toHaveTextContent("s1");
  });
});
