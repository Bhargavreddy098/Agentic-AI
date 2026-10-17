// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { serve } from "@hono/node-server";
import { createDemoGateway } from "../../../apps/gateway-fixture/src/scenarios.js";
import { WorkspaceSessionSchema, ConversationSnapshotSchema, isCurrentVerification, type UiEvent } from "../../../packages/contracts/src/ui/index.js";
import { HttpGatewayClient } from "../../../apps/web/src/lib/gateway/http-client.js";
import type { GatewayClient } from "../../../apps/web/src/lib/gateway/client.js";
import { runGatewayContractTests } from "./harness.js";

let base = "";
let server: ReturnType<typeof serve>;
beforeAll(async () => {
  server = serve({ fetch: createDemoGateway().fetch, hostname: "127.0.0.1", port: 0 });
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server missing port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

runGatewayContractTests(async () => { const client = new HttpGatewayClient("demo", base); await client.getMe(); return client; });

const open = async (text: string, suffix: string) => {
  const client = new HttpGatewayClient("demo", base);
  await client.getMe();
  const conversation = await client.createConversation(`v2-scenario-create-${suffix}`);
  await client.sendMessage(conversation.conversationId, { commandId: `v2-scenario-send-${suffix}`, clientMessageId: `v2-scenario-message-${suffix}`, expectedConversationRevision: 0, text, attachmentIds: [], requestedSkillIds: [] });
  return { client, conversationId: conversation.conversationId };
};

const collect = async (client: GatewayClient, conversationId: string, after: number): Promise<UiEvent[]> => {
  const controller = new AbortController();
  const events: UiEvent[] = [];
  for await (const event of client.subscribe(conversationId, after, controller.signal)) {
    events.push(event);
    if (events.length > 256) controller.abort();
  }
  return events;
};

it("runs a bounded goal to plan to artifact to verification scenario over loopback HTTP and SSE", async () => {
  const { client, conversationId } = await open("/goal", "goal");
  const snapshot = ConversationSnapshotSchema.parse(await client.getSnapshot(conversationId));
  expect(snapshot.goals?.[0]).toMatchObject({ conversationId, status: "verified" });
  expect(snapshot.plans?.[0]).toMatchObject({ conversationId, status: "completed", goalId: snapshot.goals?.[0]?.goalId });
  expect(snapshot.artifacts?.[0]).toMatchObject({ conversationId, mediaType: "text/plain" });
  expect(snapshot.verifications?.[0]).toMatchObject({ conversationId, status: "verified" });
  const goal = snapshot.goals![0]!;
  expect(isCurrentVerification(snapshot.verifications![0]!, { goalId: goal.goalId, revision: goal.revision })).toBe(true);
  expect(snapshot.runStatus).toBe("completed");

  const events = await collect(client, conversationId, 0);
  expect(events.map(event => event.sequence)).toEqual(events.map((_, index) => index + 1));
  expect(events.at(-1)?.sequence).toBe(snapshot.lastEventSequence);
  expect(events.map(event => event.eventType)).toEqual(expect.arrayContaining(["goal.updated", "plan.updated", "artifact.ready", "verification.completed"]));
  expect(await collect(client, conversationId, snapshot.lastEventSequence)).toHaveLength(0);
});

it("keeps an unknown criterion explicit instead of reporting success", async () => {
  const { client, conversationId } = await open("/unmet", "unmet");
  const snapshot = await client.getSnapshot(conversationId);
  expect(snapshot.goals?.[0]?.status).toBe("unmet");
  const verification = snapshot.verifications![0]!;
  expect(verification.status).toBe("unmet");
  expect(verification.criterionResults[0]?.satisfied).toBeNull();
  const goal = snapshot.goals![0]!;
  expect(isCurrentVerification(verification, { goalId: goal.goalId, revision: goal.revision })).toBe(false);
});

it("recovers the identical canonical snapshot for a fresh client after full replay", async () => {
  const { conversationId } = await open("/goal", "recover");
  const original = new HttpGatewayClient("demo", base);
  await original.getMe();
  const canonical = ConversationSnapshotSchema.parse(await original.getSnapshot(conversationId));
  const reloaded = new HttpGatewayClient("demo", base);
  await reloaded.getMe();
  expect(ConversationSnapshotSchema.parse(await reloaded.getSnapshot(conversationId))).toEqual(canonical);
  const events = await collect(reloaded, conversationId, 0);
  expect(events.at(-1)?.sequence).toBe(canonical.lastEventSequence);
  expect(events.filter(event => event.eventType === "verification.completed")).toHaveLength(canonical.verifications?.length ?? 0);
});

it("keeps budget exhaustion and cancellation outcomes explicit and terminal", async () => {
  const budget = await open("/budget", "budget");
  expect((await budget.client.getSnapshot(budget.conversationId)).runStatus).toBe("budget_exhausted");

  const cancelled = await open("/question", "cancel");
  const interaction = (await cancelled.client.getSnapshot(cancelled.conversationId)).interactions[0]!;
  expect((await cancelled.client.cancelRun(interaction.runId, "v2-scenario-cancel")).status).toBe("applied");
  const after = await cancelled.client.getSnapshot(cancelled.conversationId);
  expect(after.runStatus).toBe("cancelled");
  expect(after.interactions[0]?.status).toBe("cancelled");
});

it("stays a Demo fixture that refuses production and never uses real accounts", async () => {
  const session = WorkspaceSessionSchema.parse(await new HttpGatewayClient("demo", base).getMe());
  expect(session.demoMode).toBe(true);
  expect(session.subjectId).toBe("demo-user");
  const headers = await fetch(`${base}/api/ui/v1/me`);
  expect(headers.headers.get("x-asi-demo")).toBe("true");
  const client = new HttpGatewayClient("demo", base);
  await client.getMe();
  const connect = await client.submitCommand({ type: "provider.connect", commandId: "v2-connect", expectedRevision: 0, providerId: "real-provider", credential: "sk-live" });
  expect(connect.status).toBe("rejected");
  expect(JSON.stringify(connect)).not.toContain("sk-live");

  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    expect(() => createDemoGateway()).toThrow(/production/);
  } finally {
    process.env.NODE_ENV = previous;
  }
});
