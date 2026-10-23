import manifestData from '../../../../docs/backend/api/frontend-stage01-06.manifest.json' with { type: 'json' };
import type { ApiRoute, EnvelopeShape } from './types.ts';

const ENVELOPE_MAP: Record<string, EnvelopeShape> = {
  'Unwrapped JSON': 'unwrapped',
  '{data:responseDto,meta:{requestId,version?,nextCursor?}}': 'enveloped',
  'No body': 'none',
  'Raw bytes': 'bytes'
};

function toPath(canonicalRoute: string): string {
  if (canonicalRoute.startsWith('/api/v1')) {
    return canonicalRoute.replace(/^\/api\/v1/, '') || '/';
  }
  if (canonicalRoute.startsWith('/health')) {
    return canonicalRoute;
  }
  return canonicalRoute;
}

function normalizeRoute(r: any): ApiRoute {
  const canonicalRoute = r.canonicalRoute || r.path;
  const path = r.path && (r.path.startsWith('/') ? r.path : toPath(canonicalRoute)) || toPath(canonicalRoute);
  const rawEnvelope = r.responseEnvelope || 'Unwrapped JSON';
  return {
    stage: r.stage,
    method: r.method,
    path,
    canonicalRoute,
    authProfile: r.authProfile,
    csrfRequired: !!r.csrfRequired,
    idempotencyKeyRequired: !!r.idempotencyKeyRequired,
    ifMatchRequired: !!r.ifMatchRequired,
    successStatus: r.successStatus,
    responseEnvelope: ENVELOPE_MAP[rawEnvelope] || 'unwrapped',
    implementationFile: r.implementationFile,
    limitations: r.limitations || [],
    requestDto: r.requestDto,
    responseDto: r.responseDto,
    contractErrors: r.contractErrors,
    idempotencyMechanism: r.idempotencyMechanism,
    responseEnvelopeRaw: rawEnvelope
  };
}

const rawRoutes = (manifestData as any).routes || [];
export const MANIFEST_ROUTES: ApiRoute[] = rawRoutes.map(normalizeRoute);

export function routeKey(method: string, path: string): string {
  return `${method} ${path}`;
}

export function findRoute(method: string, path: string): ApiRoute | undefined {
  return MANIFEST_ROUTES.find(r => r.method === method && r.path === path);
}

export function coverage() {
  const byStage: Record<number, number> = {};
  for (const r of MANIFEST_ROUTES) {
    byStage[r.stage] = (byStage[r.stage] || 0) + 1;
  }
  const expected = MANIFEST_ROUTES.length;
  const implemented = MANIFEST_ROUTES.filter(r => r.implemented !== false).length;
  return {
    expected,
    implemented,
    byStage,
    csrf: MANIFEST_ROUTES.filter(r => r.csrfRequired).length,
    idempotency: MANIFEST_ROUTES.filter(r => r.idempotencyKeyRequired).length,
    ifMatch: MANIFEST_ROUTES.filter(r => r.ifMatchRequired).length
  };
}

export const ENVELOPE_SHAPES = ENVELOPE_MAP;
