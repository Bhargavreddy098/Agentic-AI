import { generateText } from "ai";

export async function replyToPrompt(prompt: string): Promise<string> {
  const { text } = await generateText({ model: "fixture-model", prompt });
  return text;
}
