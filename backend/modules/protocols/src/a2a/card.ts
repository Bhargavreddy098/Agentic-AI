import { z } from "zod";
import { boundedJsonObjectSchema } from "@asi/contracts";

export const A2A_AGENT_CARD_SCHEMA_VERSION = 1;

export const A2AAgentCardSchema = z.strictObject({
  schemaVersion: z.literal(A2A_AGENT_CARD_SCHEMA_VERSION),
  name: z.string().min(1).max(256),
  description: z.string().max(4096),
  url: z.string().url(),
  provider: z.object({
    organization: z.string().max(256),
    url: z.string().url().optional(),
  }).optional(),
  version: z.string().max(64),
  documentationUrl: z.string().url().optional(),
  capabilities: z.object({
    streaming: z.boolean().default(false),
    pushNotifications: z.boolean().default(false),
    stateTransitionHistory: z.boolean().default(false),
  }).default({ streaming: false, pushNotifications: false, stateTransitionHistory: false }),
  authentication: z.object({
    schemes: z.array(z.string()).min(1).max(8),
    credentials: z.string().optional(),
  }).optional(),
  defaultInputModes: z.array(z.string()).min(1).max(16).default(["text"]),
  defaultOutputModes: z.array(z.string()).min(1).max(16).default(["text"]),
  skills: z.array(z.strictObject({
    id: z.string().max(128),
    name: z.string().max(256),
    description: z.string().max(2048),
    tags: z.array(z.string()).max(16).optional(),
    examples: z.array(z.string()).max(8).optional(),
    inputModes: z.array(z.string()).max(16).optional(),
    outputModes: z.array(z.string()).max(16).optional(),
  })).max(64).default([]),
  security: z.array(z.object({
    scheme: z.string(),
    description: z.string().optional(),
  })).max(8).optional(),
  additionalInterfaces: z.array(z.string()).max(16).optional(),
  metadata: boundedJsonObjectSchema(4096).optional(),
});

export type A2AAgentCard = z.infer<typeof A2AAgentCardSchema>;

export function validateAgentCard(card: unknown): A2AAgentCard {
  return A2AAgentCardSchema.parse(card);
}

export function sanitizeAgentCard(card: A2AAgentCard): A2AAgentCard {
  const { metadata, ...rest } = card;
  void metadata;
  return rest as A2AAgentCard;
}