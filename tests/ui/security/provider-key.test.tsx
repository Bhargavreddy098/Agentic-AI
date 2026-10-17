// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { UiCommandResult } from "../../../packages/contracts/src/ui/index.js";
import { ConnectionForm, type ProviderConnectCommand } from "../../../apps/web/src/features/models/ConnectionForm.tsx";

const SECRET = "sk-live-secret-0001";
const applied = (commandId: string): UiCommandResult => ({ commandId, status: "applied", revision: 2 });
const rejected = (commandId: string): UiCommandResult => ({ commandId, status: "rejected", revision: 1, error: { code: "POLICY_DENIED", safeMessage: "Credential rejected.", retryable: false } });

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("provider credential handling", () => {
  it("keeps the key write-only and absent from URL, storage, DOM and logs", async () => {
    const spies = (["log", "info", "debug", "warn", "error"] as const).map(name => vi.spyOn(console, name).mockImplementation(() => {}));
    const submit = vi.fn(async (command: ProviderConnectCommand): Promise<UiCommandResult> => applied(command.commandId));
    render(<ConnectionForm mode="live" providerId="p1" submit={submit} />);
    const input = screen.getByLabelText("Provider key") as HTMLInputElement;
    expect(input).toHaveAttribute("type", "password");
    fireEvent.change(input, { target: { value: SECRET } });
    expect(input.value).toBe(SECRET);
    fireEvent.click(screen.getByRole("button", { name: "Connect provider" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(input.value).toBe("");
    expect(submit.mock.calls[0]![0]).toMatchObject({ type: "provider.connect", providerId: "p1", credential: SECRET });
    expect(window.location.href).not.toContain(SECRET);
    expect(JSON.stringify(window.localStorage)).not.toContain(SECRET);
    expect(JSON.stringify(window.sessionStorage)).not.toContain(SECRET);
    expect(document.body.innerHTML).not.toContain(SECRET);
    for (const spy of spies) for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain(SECRET);
  });

  it("clears the key even when the credential is rejected", async () => {
    const submit = vi.fn(async (command: ProviderConnectCommand): Promise<UiCommandResult> => rejected(command.commandId));
    render(<ConnectionForm mode="demo" providerId="p1" submit={submit} />);
    const input = screen.getByLabelText("Provider key") as HTMLInputElement;
    fireEvent.change(input, { target: { value: SECRET } });
    fireEvent.click(screen.getByRole("button", { name: "Connect provider" }));
    await screen.findByText("Credential rejected.");
    expect(input.value).toBe("");
  });

  it("clearly separates demo and live credential submission", () => {
    const submit = vi.fn(async (command: ProviderConnectCommand): Promise<UiCommandResult> => applied(command.commandId));
    const { unmount } = render(<ConnectionForm mode="demo" providerId="p1" submit={submit} />);
    expect(screen.getByText(/demo mode/i)).toBeTruthy();
    unmount();
    render(<ConnectionForm mode="live" providerId="p1" submit={submit} />);
    expect(screen.getByText(/live mode/i)).toBeTruthy();
    expect(screen.queryByText(/demo mode/i)).toBeNull();
    expect(screen.getByText(/never stored in the browser/i)).toBeTruthy();
  });

  it("refuses to submit an empty credential", () => {
    const submit = vi.fn(async (command: ProviderConnectCommand): Promise<UiCommandResult> => applied(command.commandId));
    render(<ConnectionForm mode="demo" providerId="p1" submit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect provider" }));
    expect(submit).not.toHaveBeenCalled();
  });
});
