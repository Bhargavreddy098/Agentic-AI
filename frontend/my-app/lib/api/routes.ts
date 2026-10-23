import {MANIFEST_ROUTES,routeKey} from './manifest.ts';
import type {createClient,RequestOptions} from './client.ts';
import type {ApiResult} from './types.ts';
export const ROUTE_FUNCTIONS:Record<string,(client:ReturnType<typeof createClient>,args?:RequestOptions)=>Promise<ApiResult<unknown>>>={};
for(const route of MANIFEST_ROUTES)ROUTE_FUNCTIONS[routeKey(route.method,route.path)]=(client,args={})=>client.request(route,args);
export function getRouteFunction(method:string,path:string){return ROUTE_FUNCTIONS[routeKey(method,path)];}
