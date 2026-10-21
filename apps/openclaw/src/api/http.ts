// Same-origin HTTP transport primitives for the OpenClaw-derived frontend.
//
// The adapter only ever issues RELATIVE paths. It never accepts a client-
// supplied backend origin, bearer secret or cookie value: the browser's
// same-origin cookie jar is the only credential carrier, and the CSRF token
// obtained from /me is the only mutation header. Every failure surfaces as a
// typed TransportFailure so callers can clear cached projections without
// inspecting error internals.

import type { z } from "zod";

export class TransportFailure extends Error {
  public readonly status: number | null;

  constructor(status: number | null, message: string) {
    super(message);
    this.name = "TransportFailure";
    this.status = status;
  }
}

/** A product operation the server has not advertised as live. Fail closed. */
export class OperationDeniedError extends Error {
  public readonly operation: string;

  constructor(operation: string) {
    super(`Operation "${operation}" is not live or supported on this ASI gateway.`);
    this.name = "OperationDeniedError";
    this.operation = operation;
  }
}

export interface JsonRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | undefined;
  body?: unknown;
  csrfToken?: string | undefined;
  query?: string | undefined;
  signal?: AbortSignal | undefined;
}

/**
 * Issue a relative same-origin JSON request and validate the response against
 * a shared contract schema. A non-OK status, an unreachable server and a
 * malformed projection all become TransportFailure; raw error text from the
 * server is never propagated to callers.
 */
export async function asiJsonRequest<T>(
  fetchImpl: typeof fetch,
  path: string,
  schema: z.ZodType<T>,
  options: JsonRequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.csrfToken) headers["x-csrf-token"] = options.csrfToken;

  let response: Response;
  try {
    response = await fetchImpl(path + (options.query ?? ""), {
      method: options.method ?? "GET",
      headers,
      credentials: "include",
      cache: "no-store",
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new TransportFailure(null, "The ASI gateway is unreachable.");
  }

  if (!response.ok) {
    throw new TransportFailure(
      response.status,
      response.status === 401
        ? "Sign in again to continue."
        : "The ASI gateway request could not be completed.",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new TransportFailure(response.status, "The ASI gateway returned an unreadable response.");
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new TransportFailure(response.status, "The ASI gateway returned a malformed projection.");
  }
  return parsed.data;
}