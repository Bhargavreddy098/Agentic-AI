import { MANIFEST_ROUTES, findRoute, routeKey } from './manifest.ts';
import type { ApiResult } from './types.ts';

export const ROUTE_FUNCTIONS: Record<string, (client: any, args?: any) => Promise<ApiResult<unknown>>> = {};

for (const route of MANIFEST_ROUTES) {
  const k = routeKey(route.method, route.path);
  ROUTE_FUNCTIONS[k] = async (client: any, args: any = {}) => {
    return client.request(route, {
      pathParams: args.pathParams,
      query: args.query,
      body: args.body,
      ifMatch: args.ifMatch,
      operation: args.operation,
      signal: args.signal
    });
  };
}

export function getRouteFunction(method: string, path: string) {
  return ROUTE_FUNCTIONS[routeKey(method, path)];
}
