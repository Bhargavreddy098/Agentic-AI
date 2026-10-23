export function resolveApiOrigin(env: Record<string, string | undefined> = process.env): string {
  if (env.ASI_API_ORIGIN) {
    return env.ASI_API_ORIGIN;
  }
  return 'http://127.0.0.1:4400';
}
