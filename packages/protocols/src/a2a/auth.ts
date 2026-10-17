import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { PrincipalSchema, type Principal } from "@asi/contracts";
import { A2A_REVISION } from "./versions.js";

export interface A2AEndpoint {
  endpoint: string;
  resource: string;
  audience: string;
}

export interface A2AResourceCredential {
  token: string;
  resource: string;
  audience: string;
  expiresAt: string;
}

export interface A2AIdentity {
  verifyPrincipal(principal: Principal): Promise<void>;
  credential(principal: Principal, endpoint: A2AEndpoint): Promise<A2AResourceCredential>;
}

export interface A2ANetwork {
  mode: "live" | "fixture";
  endpoints: readonly A2AEndpoint[];
  maxBytes?: number;
  timeoutMs?: number;
  lookup?: (hostname: string) => Promise<readonly { address: string; family: number }[]>;
}

export function checkedPrincipal(principal: Principal): Principal {
  return PrincipalSchema.parse(principal);
}

export function checkedEndpoint(endpoint: string, network: A2ANetwork): A2AEndpoint {
  const url = new URL(endpoint);
  if (url.username || url.password || url.hash || url.search || url.href !== endpoint) {
    throw new Error("A2A_ENDPOINT: noncanonical endpoint");
  }
  const entry = network.endpoints.find(item => item.endpoint === endpoint);
  if (!entry || entry.resource !== endpoint || !entry.audience) {
    throw new Error("A2A_ENDPOINT: unapproved resource");
  }
  if (network.mode === "fixture") {
    if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname)) {
      throw new Error("A2A_SSRF: fixture requires literal loopback");
    }
  } else if (network.mode !== "live" || url.protocol !== "https:") {
    throw new Error("A2A_TLS: HTTPS required");
  }
  return { ...entry };
}

export function isPublicA2aAddress(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const octets = address.split(".").map(Number);
  const a = octets[0]!, b = octets[1]!, c = octets[2]!;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 ||
      (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

export function checkedCredential(value: A2AResourceCredential, endpoint: A2AEndpoint): string {
  if (!value || value.resource !== endpoint.resource || value.audience !== endpoint.audience ||
      !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now() ||
      typeof value.token !== "string" || !/^[A-Za-z0-9\-._~+/]+=*$/.test(value.token) ||
      value.token.length > 8192) {
    throw new Error("A2A_AUTH: invalid resource credential");
  }
  return value.token;
}

export function positiveBound(value: number | undefined, fallback: number, max: number): number {
  const n = value ?? fallback;
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new Error("A2A_LIMIT: invalid bound");
  return n;
}

export async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error("A2A_CANCELLED"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([work, aborted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

const A2A_METHODS = new Set(["GET", "POST", "DELETE"]);

/**
 * HTTP binding for the A2A JSON-RPC transport. Resolves every exchange, rejects
 * unsafe destinations, then pins that exact address into the TLS socket lookup.
 * Requests are limited to the allowlisted base resource and its sub-paths;
 * redirects, cookies and automatic retries are never followed.
 */
export function createA2aFetch(
  base: A2AEndpoint, principal: Principal, identity: A2AIdentity, network: A2ANetwork,
): typeof fetch {
  const maxBytes = positiveBound(network.maxBytes, 131072, 1048576);
  const timeoutMs = positiveBound(network.timeoutMs, 5000, 60000);
  const resolve = network.lookup ?? (async (hostname: string) => lookup(hostname, { all: true, verbatim: true }));
  return async (input, init) => {
    const href = input instanceof Request ? input.url : input.toString();
    const requestUrl = new URL(href);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const body = init?.body;
    if ((href !== base.endpoint && !href.startsWith(base.endpoint + "/")) ||
        requestUrl.username || requestUrl.password || requestUrl.hash || requestUrl.search ||
        !A2A_METHODS.has(method) ||
        (body !== undefined && body !== null && (typeof body !== "string" || Buffer.byteLength(body) > maxBytes)))
      throw new Error("A2A_HTTP: unapproved request");
    checkedEndpoint(base.endpoint, network);
    const signal = AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(timeoutMs)]);
    signal.throwIfAborted();
    const validPrincipal = checkedPrincipal(principal);
    const hostname = requestUrl.hostname.replace(/^\[|\]$/g, "");
    const answers = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await abortable(resolve(hostname), signal);
    if (answers.length < 1 || answers.length > 32 || answers.some(answer =>
      network.mode === "fixture" ? !["127.0.0.1", "::1"].includes(answer.address) :
        !isPublicA2aAddress(answer.address)))
      throw new Error("A2A_SSRF: unsafe DNS destination");
    const target = answers[0]!;
    await abortable(identity.verifyPrincipal(validPrincipal), signal);
    const credential = await abortable(identity.credential(validPrincipal, base), signal);
    const token = checkedCredential(credential, base);
    signal.throwIfAborted();
    const headers = new Headers(init?.headers);
    headers.set("Authorization", "Bearer " + token);
    headers.set("a2a-protocol-version", A2A_REVISION);
    headers.delete("cookie");
    const requestHeaders: Record<string, string> = {};
    headers.forEach((value, key) => { requestHeaders[key] = value; });
    return new Promise<Response>((resolveResponse, reject) => {
      const send = requestUrl.protocol === "https:" ? httpsRequest : httpRequest;
      const req = send(requestUrl, {
        method, headers: requestHeaders, signal, agent: false,
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [{ address: target.address, family: target.family }]);
          else callback(null, target.address, target.family);
        },
      }, response => {
        try {
          const status = response.statusCode ?? 500;
          const encoding = response.headers["content-encoding"];
          const length = Number(response.headers["content-length"] ?? 0);
          if (status < 200 || status > 599 || status === 204 || status === 205 || (status >= 300 && status < 400) ||
              (encoding && encoding !== "identity") || (method !== "DELETE" && (!Number.isFinite(length) || length > maxBytes))) {
            response.destroy(); reject(new Error("A2A_HTTP: redirect or oversized/encoded response")); return;
          }
          let received = 0;
          let terminal = false;
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              response.on("data", (chunk: Buffer) => {
                if (terminal) return;
                received += chunk.length;
                if (received > maxBytes) {
                  terminal = true; controller.error(new Error("A2A_OUTPUT_LIMIT")); response.destroy(); return;
                }
                controller.enqueue(new Uint8Array(chunk));
                response.pause();
              });
              response.on("end", () => { if (!terminal) { terminal = true; controller.close(); } });
              const interrupted = () => { if (!terminal) { terminal = true; controller.error(new Error("A2A_HTTP: response interrupted")); } };
              response.on("error", interrupted);
              response.on("aborted", interrupted);
            },
            pull() { response.resume(); },
            cancel() { terminal = true; response.destroy(); req.destroy(); },
          });
          const resultHeaders = new Headers();
          for (const [key, value] of Object.entries(response.headers)) {
            if (value !== undefined) resultHeaders.set(key, Array.isArray(value) ? value.join(", ") : value);
          }
          resolveResponse(new Response(stream, { status, headers: resultHeaders }));
        } catch { response.destroy(); reject(new Error("A2A_HTTP: invalid response")); }
      });
      req.on("error", () => reject(new Error(signal.aborted ? "A2A_CANCELLED" : "A2A_HTTP: connection failed")));
      if (typeof body === "string") req.end(body);
      else req.end();
    });
  };
}