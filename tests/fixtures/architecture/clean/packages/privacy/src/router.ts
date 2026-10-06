import { generateText } from "ai";

export async function routeInference(prompt: string): Promise<string> {
  const { text } = await generateText({ model: "fixture-model", prompt });
  return text;
}
