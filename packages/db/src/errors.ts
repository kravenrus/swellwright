export type SchemaProblem = 'MIGRATIONS_PENDING' | 'SCHEMA_AHEAD';

/** A failed readiness probe. `code` is a short, secret-free reason; the message never carries driver text. */
export class DatabaseNotReadyError extends Error {
  readonly code: SchemaProblem;

  constructor(code: SchemaProblem, message: string) {
    super(message);
    this.name = 'DatabaseNotReadyError';
    this.code = code;
  }
}
