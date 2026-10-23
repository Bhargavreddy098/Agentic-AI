import { generateSystemPrompt } from "@openuidev/lang-core";
import type { LibrarySpec, SystemPromptOptions } from "@openuidev/lang-core";
import OpenAI from "openai";
import librarySpec from "@/lib/generated/beui-library.spec.json";

const { promptOptions, ...library } = librarySpec as LibrarySpec & {
  promptOptions?: SystemPromptOptions;
};

const ASI_CONTEXT = [
  "Current ASI roadmap status as of 2026-10-22.",
  "Stages 02 through 06 are locally qualified: PostgreSQL with pgvector, identity and sessions, projects/conversations/artifacts, policy/approvals/budgets/audit, and the provider layer.",
  "Stage 06 is qualified with a capped live call against an operator-allowlisted OpenAI-compatible endpoint plus live revoked-auth, 429 and timeout paths. The official OpenAI target remains live-unverified.",
  "Stages 07 through 18 are not qualified. Durable execution is stage 07 and is next.",
  "Never upgrade this status from a component or a button click.",
].join("\n");

const SYSTEM_PROMPT = `${generateSystemPrompt({
  library,
  promptOptions,
})}\n\n## Current ASI context\n${ASI_CONTEXT}`;

type ChatRole = "user" | "assistant";

type ChatTurn = {
  role: ChatRole;
  content: string;
};

type Provider = {
  client: OpenAI;
  model: string;
};

function resolveProvider(): Provider | null {
  const compatibleBaseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL;
  if (compatibleBaseUrl) {
    const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY;
    const model = process.env.OPENAI_COMPATIBLE_MODEL;
    if (!apiKey || !model) return null;
    return {
      client: new OpenAI({ apiKey, baseURL: compatibleBaseUrl }),
      model,
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || !model) return null;

  return {
    client: new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL,
    }),
    model,
  };
}

function isTurn(value: unknown): value is ChatTurn {
  if (typeof value !== "object" || value === null) return false;
  const turn = value as Record<string, unknown>;
  return (
    (turn.role === "user" || turn.role === "assistant") &&
    typeof turn.content === "string" &&
    turn.content.length > 0 &&
    turn.content.length <= 4_000
  );
}

function readHistory(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isTurn).slice(-10);
}

export async function POST(request: Request) {
  let message = "";
  let history: ChatTurn[] = [];

  try {
    const body = (await request.json()) as {
      message?: unknown;
      history?: unknown;
    };
    if (typeof body.message === "string") message = body.message.trim();
    history = readHistory(body.history);
  } catch {
    return Response.json({ error: "expected a JSON body" }, { status: 400 });
  }

  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }
  if (message.length > 4_000) {
    return Response.json({ error: "message is too long" }, { status: 400 });
  }

  const provider = resolveProvider();
  if (!provider) {
    return Response.json(
      {
        error:
          "No model is configured. Set OPENAI_COMPATIBLE_BASE_URL, OPENAI_COMPATIBLE_API_KEY and OPENAI_COMPATIBLE_MODEL in frontend/my-app/.env.local, or the matching OPENAI_* variables.",
      },
      { status: 503 },
    );
  }

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), {
    once: true,
  });

  const completion = provider.client.chat.completions.create(
    {
      model: provider.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.map((turn) => ({
          role: turn.role,
          content: turn.content,
        })),
        { role: "user", content: message },
      ],
      temperature: 0.3,
      max_tokens: 1_200,
      stream: true,
    },
    { signal: abort.signal },
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };

      send({ type: "start" });

      try {
        for await (const chunk of await completion) {
          if (request.signal.aborted) break;
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) send({ type: "delta", content: delta });
        }
        send({ type: "done" });
      } catch {
        send({
          type: "error",
          content:
            "The model stream failed. Check the provider configuration and try again.",
        });
      } finally {
        controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
