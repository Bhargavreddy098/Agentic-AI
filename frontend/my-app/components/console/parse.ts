import { COMMANDS } from './grammar.ts';
import { findRoute } from '../../lib/api/manifest.ts';

function tokenize(input: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (cur) { out.push(cur); cur = ''; }
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function parseCommand(input: string) {
  const tokens = tokenize(input.trim());
  if (!tokens.length) return { ok: false as const, error: 'Empty command' };

  let matched: { spec: typeof COMMANDS[number]; consumed: number } | null = null;
  for (const spec of COMMANDS) {
    const words = spec.name.split(' ');
    if (tokens.length < words.length) continue;
    if (words.every((w, i) => tokens[i].toLowerCase() === w)) {
      if (!matched || words.length > matched.consumed) matched = { spec, consumed: words.length };
    }
  }

  if (!matched) {
    const suggestions = COMMANDS.map(c => c.name).filter(n => n.split(' ')[0] === tokens[0].toLowerCase()).slice(0, 5);
    return { ok: false as const, error: `Unknown command: ${tokens[0]}`, suggestions };
  }

  const rest = tokens.slice(matched.consumed);
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    if (t.startsWith('--')) {
      const name = t.slice(2);
      if (!matched.spec.flags.includes(name)) {
        return { ok: false as const, error: `Unknown flag: --${name}. Allowed: ${matched.spec.flags.join(', ') || '(none)'}` };
      }
      flags[name] = rest[i + 1] ?? '';
      i++;
    } else {
      positional.push(t);
    }
  }

  if (positional.length < matched.spec.positional) {
    return { ok: false as const, error: `${matched.spec.name} needs ${matched.spec.positional} argument(s)` };
  }

  const [method, ...pathParts] = matched.spec.routeKey.split(' ');
  const path = pathParts.join(' ');
  const route = findRoute(method, path);
  if (!route) return { ok: false as const, error: `Route not in manifest: ${method} ${path}` };

  return { ok: true as const, command: matched.spec.name, route, positional, flags };
}

export function pathParamsFor(route: { path: string }, positional: string[]): Record<string, string> {
  const names = [...route.path.matchAll(/:([A-Za-z]+)/g)].map(m => m[1]);
  const out: Record<string, string> = {};
  names.forEach((n, i) => { if (positional[i]) out[n] = positional[i]; });
  return out;
}
