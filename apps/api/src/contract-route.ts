import {
  applyDecorators,
  HttpCode,
  RequestMapping,
  RequestMethod,
  SetMetadata,
} from '@nestjs/common';
import { type HttpMethod, type RouteDef } from '@swellwright/contracts';

export const ROUTE_METADATA = Symbol('swellwright:route');
export const API_PREFIX = 'api/v1';

const METHODS: Record<HttpMethod, RequestMethod> = {
  get: RequestMethod.GET,
  post: RequestMethod.POST,
  put: RequestMethod.PUT,
  patch: RequestMethod.PATCH,
  delete: RequestMethod.DELETE,
};

/** OpenAPI `/runs/{id}` to Express `/runs/:id`. */
export function toExpressPath(path: string): string {
  return path.replace(/\{([^}]+)\}/gu, ':$1');
}

/**
 * Binds a handler to a route of the contract registry. The path and method come from the registry,
 * so the OpenAPI document and the server cannot drift apart.
 */
export function ContractRoute(route: RouteDef): MethodDecorator {
  // Nest answers 201 to a POST by default. The status the contract lists first is the one to send;
  // a handler that picks among several (the readiness probe) sets its own and keeps the default here.
  const success = Object.keys(route.responses)
    .map(Number)
    .find((status) => status >= 200 && status < 300);
  const nestDefault = route.method === 'post' ? 201 : 200;
  return applyDecorators(
    RequestMapping({ path: toExpressPath(route.path), method: METHODS[route.method] }),
    SetMetadata(ROUTE_METADATA, route),
    ...(success !== undefined && success !== nestDefault ? [HttpCode(success)] : []),
  );
}
