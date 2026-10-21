import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { PrincipalSchema, type Principal } from "@asi/contracts";

export interface McpEndpoint {
  endpoint: string;
  resource: string;
  audience: string;
}
export interface ResourceCredential {
  token: string;
  resource: string;
  audience: string;
  expiresAt: string;
}
export interface McpIdentity {
  /** Must authenticate canonical grant binding and revocation, not just parse claims. */
  verifyPrincipal(principal: Principal): Promise<void>;
  /** Trusted OAuth owner; never return an ASI supervisor/provider/signing credential. */
  credential(principal: Principal, endpoint: McpEndpoint): Promise<ResourceCredential>;
}
export interface McpNetwork {
  mode: "live" | "fixture";
  endpoints: readonly McpEndpoint[];
  maxBytes?: number;
  timeoutMs?: number;
  lookup?: (hostname: string) => Promise<readonly { address: string; family: number }[]>;
}
export function checkedPrincipal(principal: Principal): Principal {
  return PrincipalSchema.parse(principal);
}
export function checkedEndpoint(endpoint: string, network: McpNetwork): McpEndpoint {
  const url = new URL(endpoint);
  if (url.username || url.password || url.hash || url.search || url.href !== endpoint)
    throw new Error("MCP_ENDPOINT: noncanonical endpoint");
  const entry = network.endpoints.find(item => item.endpoint === endpoint);
  if (!entry || entry.resource !== endpoint || !entry.audience)
    throw new Error("MCP_ENDPOINT: unapproved resource");
  if (network.mode === "fixture") {
    if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname))
      throw new Error("MCP_SSRF: fixture requires literal loopback");
  } else if (network.mode !== "live" || url.protocol !== "https:") {
    throw new Error("MCP_TLS: HTTPS required");
  }
  return { ...entry };
}
/** Conservative public IPv4 policy; IPv6 is denied in live mode until qualified. */
export function isPublicMcpAddress(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const octets = address.split(".").map(Number);
  const a = octets[0]!, b = octets[1]!, c = octets[2]!;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 ||
      (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}
export function checkedCredential(value: ResourceCredential, endpoint: McpEndpoint): string {
  if (!value || value.resource !== endpoint.resource || value.audience !== endpoint.audience ||
      !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now() ||
      typeof value.token !== "string" || !/^[A-Za-z0-9\-._~+/]+=*$/.test(value.token) ||
      value.token.length > 8192)
    throw new Error("MCP_AUTH: invalid resource credential");
  return value.token;
}
export function positiveBound(value: number | undefined, fallback: number, max: number): number {
  const n = value ?? fallback;
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new Error("MCP_LIMIT: invalid bound");
  return n;
}
export async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error("MCP_CANCELLED"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([work, aborted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}
/**
 * HTTP only: official SDK owns MCP framing. Resolve every exchange, reject all
 * unsafe answers, then pin that exact address into the TLS socket's lookup.
 * Redirects, OAuth discovery and automatic effect retries are never followed.
 */
export function createMcpFetch(
  endpoint: McpEndpoint, principal: Principal, identity: McpIdentity, network: McpNetwork,
): typeof fetch {
  const maxBytes = positiveBound(network.maxBytes, 131072, 1048576);
  const timeoutMs = positiveBound(network.timeoutMs, 5000, 60000);
  const resolve = network.lookup ?? (async (hostname: string) => lookup(hostname, { all: true, verbatim: true }));
  return async (input, init) => {
    const href = input instanceof Request ? input.url : input.toString();
    if (href !== endpoint.endpoint || init?.method !== "POST" ||
        typeof init.body !== "string" || Buffer.byteLength(init.body) > maxBytes)
      throw new Error("MCP_HTTP: unapproved request");
    checkedEndpoint(href, network);
    const signal = AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(timeoutMs)]);
    signal.throwIfAborted();
    const validPrincipal = checkedPrincipal(principal);
    const url = new URL(href);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const answers = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await abortable(resolve(hostname), signal);
    if (answers.length < 1 || answers.length > 32 || answers.some(answer =>
      network.mode === "fixture" ? !["127.0.0.1", "::1"].includes(answer.address) :
        !isPublicMcpAddress(answer.address)))
      throw new Error("MCP_SSRF: unsafe DNS destination");
    const target = answers[0]!;
    await abortable(identity.verifyPrincipal(validPrincipal), signal);
    const credential = await abortable(identity.credential(validPrincipal, endpoint), signal);
    checkedPrincipal(validPrincipal);
    const token = checkedCredential(credential, endpoint);
    signal.throwIfAborted();
    const headers = new Headers(init.headers);
    headers.set("Authorization", "Bearer " + token);
    headers.delete("cookie");
    const requestHeaders: Record<string, string> = {};
    headers.forEach((value, key) => { requestHeaders[key] = value; });
    return new Promise<Response>((resolveResponse, reject) => {
      const send = url.protocol === "https:" ? httpsRequest : httpRequest;
      const req = send(url, {
        method: "POST", headers: requestHeaders, signal, agent: false,
        // Keep the original hostname/SNI and standard certificate validation.
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [{ address: target.address, family: target.family }]);
          else callback(null, target.address, target.family);
        },
      }, response => {
        try {
        const status = response.statusCode ?? 500;
        const encoding = response.headers["content-encoding"];
        const length = Number(response.headers["content-length"] ?? 0);
        if (status < 200 || status > 599 || status === 204 || status === 205 || (status >= 300 && status < 400) || (encoding && encoding !== "identity") ||
            !Number.isFinite(length) || length > maxBytes) {
          response.destroy(); reject(new Error("MCP_HTTP: redirect or oversized/encoded response")); return;
        }
        let received = 0;
        let terminal = false;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            response.on("data", (chunk: Buffer) => {
              if (terminal) return;
              received += chunk.length;
              if (received > maxBytes) {
                terminal = true; controller.error(new Error("MCP_OUTPUT_LIMIT")); response.destroy(); return;
              }
              controller.enqueue(new Uint8Array(chunk));
              response.pause();
            });
            response.on("end", () => { if (!terminal) { terminal = true; controller.close(); } });
            const interrupted = () => { if (!terminal) { terminal = true; controller.error(new Error("MCP_HTTP: response interrupted")); } };
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
        } catch { response.destroy(); reject(new Error("MCP_HTTP: invalid response")); }
      });
      req.on("error", () => reject(new Error(signal.aborted ? "MCP_CANCELLED" : "MCP_HTTP: connection failed")));
      req.end(init.body);
    });
  };
}
