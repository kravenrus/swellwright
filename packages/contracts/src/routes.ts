import { z } from 'zod';

import { ApiErrorSchema } from './errors.js';
import { HealthResponseSchema, ReadyResponseSchema, VersionResponseSchema } from './system.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Who may call a route. `none` is for probes and the public API description only. */
export type RouteAuth = 'none' | 'session' | 'token';

export interface ResponseDef {
  readonly description: string;
  readonly schema: z.ZodType;
}

export interface RouteDef {
  readonly operationId: string;
  readonly method: HttpMethod;
  /** Relative to the API base path (`/api/v1`), OpenAPI style: `/runs/{id}`. */
  readonly path: string;
  readonly tags: readonly string[];
  readonly summary: string;
  readonly description?: string;
  readonly auth: RouteAuth;
  readonly request?: {
    readonly params?: z.ZodObject<Record<string, z.ZodType>>;
    readonly query?: z.ZodObject<Record<string, z.ZodType>>;
    readonly body?: z.ZodType;
  };
  /** Successful and expected non-successful responses by HTTP status. */
  readonly responses: Readonly<Record<number, ResponseDef>>;
}

/** Keeps the literal types of a definition so handlers can be typed from it. */
export const defineRoute = <const T extends RouteDef>(route: T): T => route;

const ERROR = { description: 'Error envelope.', schema: ApiErrorSchema } as const;

export const healthRoute = defineRoute({
  operationId: 'getHealth',
  method: 'get',
  path: '/health',
  tags: ['system'],
  summary: 'Liveness probe',
  description: 'Answers while the process serves requests. It does not check dependencies.',
  auth: 'none',
  responses: { 200: { description: 'The process is alive.', schema: HealthResponseSchema } },
});

export const readyRoute = defineRoute({
  operationId: 'getReady',
  method: 'get',
  path: '/ready',
  tags: ['system'],
  summary: 'Readiness probe',
  description:
    'Checks every configured dependency. Answers 503 with the same body shape when one is down.',
  auth: 'none',
  responses: {
    200: { description: 'Every configured dependency answers.', schema: ReadyResponseSchema },
    503: { description: 'At least one dependency is down.', schema: ReadyResponseSchema },
  },
});

export const versionRoute = defineRoute({
  operationId: 'getVersion',
  method: 'get',
  path: '/version',
  tags: ['system'],
  summary: 'Build and API version',
  auth: 'none',
  responses: { 200: { description: 'Version information.', schema: VersionResponseSchema } },
});

export const openApiRoute = defineRoute({
  operationId: 'getOpenApi',
  method: 'get',
  path: '/openapi.json',
  tags: ['system'],
  summary: 'This API description',
  description: 'The OpenAPI 3.1 document generated from the route registry.',
  auth: 'none',
  responses: {
    200: { description: 'The OpenAPI document.', schema: z.record(z.string(), z.unknown()) },
  },
});

/** Every route of the public API. The server binds its handlers to these definitions. */
export const routes = [healthRoute, readyRoute, versionRoute, openApiRoute] as const;

/** Errors every route may return, documented once. */
export const commonErrors = { default: ERROR } as const;
