"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/api/client';
import { findRoute } from '@/lib/api/manifest';

type AnyRecord = Record<string, any>;

export function ItemList({
  method,
  path,
  pathParams,
  csrfToken,
  label,
  render
}: {
  method: string;
  path: string;
  pathParams?: Record<string, string>;
  csrfToken?: string | null;
  label: string;
  render?: (item: AnyRecord) => React.ReactNode;
}) {
  const [items, setItems] = useState<AnyRecord[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const route = findRoute(method, path);
    if (!route) { setError(`No manifest route for ${method} ${path}`); return; }
    // Wait until a session exists; otherwise every list would 401 on first paint.
    if (!csrfToken) { setItems(null); setError(''); return; }
    const client = createClient({ getCsrfToken: () => csrfToken });
    client.request(route, { pathParams }).then((res: any) => {
      if (res.ok) {
        const d = res.data;
        setItems(Array.isArray(d) ? d : (d?.items ?? []));
      } else if (res.problem.status === 401) {
        setError('Session required');
      } else {
        setError(`${res.problem.code}: ${res.problem.title}`);
      }
    });
  }, [method, path, csrfToken, pathParams?.projectId]);

  if (error) return <p className="text-xs text-red-500 p-2">{error}</p>;
  if (!items) return <p className="text-xs text-muted-foreground p-2">Connect a session to load {label}.</p>;
  if (!items.length) return <p className="text-xs text-muted-foreground p-2">No {label} yet.</p>;

  return (
    <ul className="text-xs divide-y">
      {items.map((item, i) => (
        <li key={item.id ?? i} className="p-2">
          {render ? render(item) : (
            <span className="font-mono">{String(item.name ?? item.displayName ?? item.modelId ?? item.id ?? i)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
