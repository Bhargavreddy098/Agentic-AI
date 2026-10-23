/**
 * Backend origin for server-side rewrites.
 *
 * Resolution order:
 *   1. ASI_API_ORIGIN          - explicit frontend setting, always wins
 *   2. ASI_PORT / BACKEND_PORT - the backend's own configured port, if present
 *   3. http://127.0.0.1:3100   - this checkout's default backend port
 *
 * Generic PORT is deliberately ignored: Next.js uses PORT for its own server,
 * so treating it as the backend port would silently proxy to the wrong place.
 */
export function resolveApiOrigin(env: Record<string, string | undefined> = process.env): string {
  if (env.ASI_API_ORIGIN) return env.ASI_API_ORIGIN;

  const backendPort = env.ASI_PORT || env.BACKEND_PORT;
  if (backendPort && /^\d{1,5}$/.test(backendPort)) {
    return `http://127.0.0.1:${backendPort}`;
  }

  return 'http://127.0.0.1:3100';
}

