import { expect, it } from "vitest";
import type { GatewayClient } from "../../../apps/web/src/lib/gateway/client.js";
import { WorkspaceSessionSchema, ConversationSummarySchema, ConversationSnapshotSchema, CatalogSchema, ProviderViewSchema } from "../../../packages/contracts/src/ui/index.js";

// U03 and U17 must call this unchanged against their HTTP clients.
export function runGatewayContractTests(createClient: () => Promise<GatewayClient>) {
  it("returns validated safe identity and readable provider projections", async () => {
    const client = await createClient();
    expect(WorkspaceSessionSchema.safeParse(await client.getMe()).success).toBe(true);
    expect(CatalogSchema(ProviderViewSchema).safeParse(await client.getProviders()).success).toBe(true);
  });
  it("creates one logical conversation for duplicate command identity", async () => {
    const client = await createClient();
    const first = await client.createConversation("contract-create");
    const second = await client.createConversation("contract-create");
    expect(first.conversationId).toBe(second.conversationId);
    expect(ConversationSummarySchema.safeParse(first).success).toBe(true);
    expect(ConversationSnapshotSchema.safeParse(await client.getSnapshot(first.conversationId)).success).toBe(true);
  });
}
