import { z } from "zod";

export const sendMessageSchema = z.object({ text: z.string().min(1) });

export function normalizeInput(input: unknown): string {
  return sendMessageSchema.parse(input).text;
}
