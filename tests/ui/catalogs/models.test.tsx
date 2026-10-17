// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CatalogProvider, useCatalogs, isModelSelectable, modelUnavailableReason, filterModels, optionalDetail, preferModel } from "@asi/web/features/models/catalog.tsx";
import { ModelCatalog } from "@asi/web/features/models/ModelCatalog.tsx";
import { ProviderList } from "@asi/web/features/models/ProviderList.tsx";
import { ModelViewSchema, ProviderViewSchema, type Catalog, type ModelView, type ProviderView } from "../../../packages/contracts/src/ui/index.js";

const makeModel = (overrides = {}): ModelView => ModelViewSchema.parse({ modelId: "m1", providerId: "p1", displayName: "Local Fast", locality: "local", status: "available", preferred: false, revision: 1, allowedActions: ["model.preference.set"], ...overrides });
const modelCatalog = (items: ModelView[]): Catalog<ModelView> => ({ items, revision: 1, availability: "ready" });
const makeProvider = (overrides = {}): ProviderView => ProviderViewSchema.parse({ providerId: "p1", displayName: "Local Provider", status: "connected", revision: 1, allowedActions: [], ...overrides });
const providerCatalog = (items: ProviderView[]): Catalog<ProviderView> => ({ items, revision: 1, availability: "ready" });
afterEach(cleanup);

describe("ModelCatalog authorization and display", () => {
  it("marks locality/status and enables preference only for permitted models", () => {
    render(<ModelCatalog catalog={modelCatalog([makeModel(), makeModel({ modelId: "m2", displayName: "Cloud Max", locality: "cloud" }), makeModel({ modelId: "m3", displayName: "Blocked", status: "blocked" }), makeModel({ modelId: "m4", displayName: "No Permission", allowedActions: [] })])} policy="redacted_cloud" />);
    expect(screen.getByTestId("model-m1")).toHaveAttribute("data-locality", "local");
    expect(screen.getByTestId("model-m2")).toHaveAttribute("data-locality", "cloud");
    expect(screen.getByTestId("model-m3")).toHaveAttribute("data-status", "blocked");
    const buttons = screen.getAllByRole("button", { name: "Set as default" });
    expect(buttons[0]).toBeEnabled();
    expect(buttons[1]).toBeEnabled();
    expect(buttons[2]).toBeDisabled();
    expect(buttons[3]).toBeDisabled();
    expect(isModelSelectable(makeModel(), "redacted_cloud")).toBe(true);
    expect(isModelSelectable(makeModel({ status: "blocked" }), "redacted_cloud")).toBe(false);
  });

  it("labels unknown backend-supplied detail instead of inventing it", () => {
    expect(optionalDetail(undefined, "Capabilities")).toBe("Capabilities: Not provided by the backend");
    expect(optionalDetail(8192, "Context tokens")).toBe("Context tokens: 8192");
    render(<ModelCatalog catalog={modelCatalog([makeModel()])} />);
    expect(screen.getByText("Capabilities: Not provided by the backend")).toBeTruthy();
    expect(screen.queryByText(/price|cost|usd|\$/i)).toBeNull();
  });

  it("shows the requested preference beside the backend effective model", () => {
    render(<ModelCatalog catalog={modelCatalog([makeModel(), makeModel({ modelId: "m2", displayName: "Cloud Max", locality: "cloud" })])} requestedModelId="m2" effectiveModelId="m1" />);
    expect(screen.getByTestId("effective-model")).toHaveTextContent("m1");
    const requested = screen.getByTestId("requested-model");
    expect(requested).toHaveAttribute("data-mismatch", "true");
    expect(requested).toHaveTextContent("m2");
  });

  it("prevents a cloud model from overriding local-only routing policy", () => {
    render(<ModelCatalog catalog={modelCatalog([makeModel({ modelId: "m2", displayName: "Cloud Max", locality: "cloud" })])} policy="local_only" />);
    const button = screen.getAllByRole("button", { name: "Set as default" })[0]!;
    expect(button).toBeDisabled();
    expect(screen.getByTestId("model-reason-m2")).toHaveTextContent(/local-only/i);
    expect(modelUnavailableReason(makeModel({ locality: "cloud" }), "local_only")).toMatch(/local-only/i);
  });

  it("filters the shared catalog by search", () => {
    expect(filterModels([makeModel(), makeModel({ modelId: "m2", displayName: "Cloud Max" })], "cloud").map(m => m.modelId)).toEqual(["m2"]);
    render(<ModelCatalog catalog={modelCatalog([makeModel(), makeModel({ modelId: "m2", displayName: "Cloud Max" })])} />);
    fireEvent.change(screen.getByLabelText("Search models"), { target: { value: "cloud" } });
    expect(screen.queryByTestId("model-m1")).toBeNull();
    expect(screen.getByTestId("model-m2")).toBeTruthy();
  });
});

describe("shared catalog query ownership", () => {
  it("serves the page and any composer consumer from one query result", async () => {
    const getModels = vi.fn(async () => modelCatalog([makeModel()]));
    const getProviders = vi.fn(async () => providerCatalog([makeProvider()]));
    const seen: string[] = [];
    function Consumer({ name }: { name: string }) { const { models } = useCatalogs(); seen.push(`${name}:${models?.items[0]?.modelId ?? "none"}`); return <span data-testid={`consumer-${name}`}>{models?.items[0]?.modelId}</span>; }
    render(<CatalogProvider client={{ getModels, getProviders }}><Consumer name="page" /><Consumer name="composer" /></CatalogProvider>);
    await waitFor(() => expect(screen.getByTestId("consumer-page")).toHaveTextContent("m1"));
    expect(getModels).toHaveBeenCalledTimes(1);
    expect(getProviders).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("consumer-page")).toHaveTextContent("m1");
    expect(screen.getByTestId("consumer-composer")).toHaveTextContent("m1");
    expect(seen).toContain("page:m1");
    expect(seen).toContain("composer:m1");
  });
});

describe("model preference command outcomes", () => {
  it("routes an approval_required preference to the owning Chat", async () => {
    const submitCommand = vi.fn(async () => ({ commandId: "c", status: "approval_required" as const, revision: 0, conversationId: "conv-1", interactionId: "inter-1" }));
    const onNavigate = vi.fn();
    const outcome = await preferModel({ submitCommand }, "m2", 4, onNavigate);
    expect(submitCommand).toHaveBeenCalledWith(expect.objectContaining({ type: "model.preference.set", modelId: "m2", expectedRevision: 4 }));
    expect(outcome).toEqual({ kind: "navigate", href: "/chat/conv-1?interaction=inter-1" });
    expect(onNavigate).toHaveBeenCalledWith("/chat/conv-1?interaction=inter-1");
  });

  it("reports applied and error outcomes without navigating", async () => {
    const onNavigate = vi.fn();
    expect(await preferModel({ submitCommand: vi.fn(async () => ({ commandId: "c", status: "applied" as const, revision: 9 })) }, "m1", 1, onNavigate)).toEqual({ kind: "applied", revision: 9 });
    expect(await preferModel({ submitCommand: vi.fn(async () => ({ commandId: "c", status: "rejected" as const, error: { code: "POLICY_DENIED" as const, safeMessage: "No.", retryable: false } })) }, "m1", 1, onNavigate)).toEqual({ kind: "error", code: "POLICY_DENIED", message: "No." });
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe("ProviderList", () => {
  it("renders connected, disconnected, unavailable and blocked distinctly", () => {
    render(<ProviderList catalog={providerCatalog([makeProvider(), makeProvider({ providerId: "p2", displayName: "D", status: "disconnected" }), makeProvider({ providerId: "p3", displayName: "U", status: "unavailable" }), makeProvider({ providerId: "p4", displayName: "B", status: "blocked" })])} />);
    for (const [id, status] of [["p1", "connected"], ["p2", "disconnected"], ["p3", "unavailable"], ["p4", "blocked"]] as const) expect(screen.getByTestId(`provider-${id}`)).toHaveAttribute("data-status", status);
  });

  it("surfaces an unavailable catalog and its reason", () => {
    const { unmount } = render(<ProviderList catalog={{ items: [], revision: 0, availability: "unavailable", reason: "Real backend is not connected." }} />);
    expect(screen.getByTestId("provider-list-status")).toHaveTextContent(/unavailable/i);
    unmount();
    render(<ProviderList catalog={{ items: [], revision: 0, availability: "permission_denied" }} />);
    expect(screen.getByTestId("provider-list-status")).toHaveTextContent(/permission/i);
  });
});
