import {
  type HealthResponse,
  HealthResponseSchema,
  type ReadyResponse,
  ReadyResponseSchema,
  type VersionResponse,
  VersionResponseSchema,
} from '@swellwright/contracts';
const BASE = '/api/v1';

export class ApiUnreachableError extends Error {
  constructor() {
    super('The API did not answer.');
  }
}

/** Reads a JSON body and checks it against the contract, so a drifting server fails loudly. */
async function getJson<T>(path: string, schema: { parse: (data: unknown) => T }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } });
  } catch {
    throw new ApiUnreachableError();
  }
  // A body that is not JSON (a proxy error page, an empty 502) means the API is not behind this address.
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiUnreachableError();
  }
  // /ready answers 503 with the same body shape; any other mismatch fails the schema below.
  return schema.parse(body);
}

export interface SystemStatus {
  health: HealthResponse;
  ready: ReadyResponse;
  version: VersionResponse;
}

export async function loadSystemStatus(): Promise<SystemStatus> {
  const [health, ready, version] = await Promise.all([
    getJson('/health', HealthResponseSchema),
    getJson('/ready', ReadyResponseSchema),
    getJson('/version', VersionResponseSchema),
  ]);
  return { health, ready, version };
}
