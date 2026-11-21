// Typed errors of the SSH layer. Every error has a stable `code` that callers can switch on, and a message that
// never contains a secret: text taken from a third party (the ssh2 library, a remote shell) goes through `redact`
// with the secrets of the operation first.

/** Stable machine-readable error codes. */
export type SshErrorCode =
  | 'ssh_invalid_input'
  | 'ssh_connect_failed'
  | 'ssh_auth_failed'
  | 'ssh_key_invalid'
  | 'ssh_host_key_mismatch'
  | 'ssh_timeout'
  | 'ssh_aborted'
  | 'ssh_exec_failed'
  | 'ssh_connection_lost'
  | 'ssh_sftp_failed'
  | 'ssh_hash_mismatch'
  | 'ssh_pool_closed'
  | 'ssh_step_failed'
  | 'ssh_step_not_found'
  | 'ssh_step_conflict'
  | 'ssh_step_incomplete';

export interface SshErrorOptions {
  cause?: unknown;
}

/** Base class of every error the SSH layer throws. */
export class SshError extends Error {
  readonly code: SshErrorCode;
  /** True when trying again (possibly on a new connection) can succeed without any change. */
  readonly retryable: boolean;

  constructor(
    code: SshErrorCode,
    message: string,
    retryable = false,
    options: SshErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.retryable = retryable;
  }
}

/** A value passed to the library is not acceptable (a hostile step id, a malformed fingerprint, a bad port, ...). */
export class SshInputError extends SshError {
  constructor(message: string) {
    super('ssh_invalid_input', message);
  }
}

export type SshConnectReason =
  'refused' | 'unreachable' | 'dns' | 'reset' | 'handshake' | 'closed' | 'other';

/** The transport could not be established: TCP, DNS or the SSH handshake failed. */
export class SshConnectError extends SshError {
  readonly reason: SshConnectReason;

  constructor(message: string, reason: SshConnectReason, options: SshErrorOptions = {}) {
    super('ssh_connect_failed', message, reason !== 'handshake', options);
    this.reason = reason;
  }
}

/** The server refused the credentials, or the private key given to the library cannot be used. */
export class SshAuthError extends SshError {
  constructor(
    message: string,
    code: 'ssh_auth_failed' | 'ssh_key_invalid' = 'ssh_auth_failed',
    options: SshErrorOptions = {},
  ) {
    super(code, message, false, options);
  }
}

/** The key the server presented is not one of the pinned fingerprints. Raised before any credential is sent. */
export class HostKeyMismatchError extends SshError {
  /** The pinned fingerprints the key was checked against. */
  readonly expected: readonly string[];
  /** The fingerprint the server presented. */
  readonly actual: string;

  constructor(expected: readonly string[], actual: string) {
    super(
      'ssh_host_key_mismatch',
      `The server presented the host key ${actual}, which is not one of the ${String(expected.length)} pinned fingerprint(s).`,
    );
    this.expected = expected;
    this.actual = actual;
  }
}

export type SshTimeoutPhase = 'connect' | 'exec' | 'sftp' | 'keepalive' | 'pool' | 'step';

/** A deadline passed. `phase` tells which one. */
export class SshTimeoutError extends SshError {
  readonly phase: SshTimeoutPhase;
  readonly timeoutMs: number;

  constructor(phase: SshTimeoutPhase, timeoutMs: number, options: SshErrorOptions = {}) {
    super(
      'ssh_timeout',
      `Timed out after ${String(timeoutMs)} ms (${phase}).`,
      phase !== 'exec' && phase !== 'step',
      options,
    );
    this.phase = phase;
    this.timeoutMs = timeoutMs;
  }
}

/** The caller's AbortSignal fired. */
export class SshAbortError extends SshError {
  constructor(message = 'The operation was aborted.') {
    super('ssh_aborted', message);
  }
}

/** The command could not be started or ended abnormally (the server refused the exec request, ...). */
export class SshExecError extends SshError {
  constructor(message: string, options: SshErrorOptions = {}) {
    super('ssh_exec_failed', message, false, options);
  }
}

/** The connection dropped while an operation was in flight. The remote side effect is unknown. */
export class SshConnectionLostError extends SshError {
  constructor(message = 'The SSH connection was lost.', options: SshErrorOptions = {}) {
    super('ssh_connection_lost', message, true, options);
  }
}

/** An SFTP request failed. `sftpStatus` is the SFTP status code when the server sent one. */
export class SshSftpError extends SshError {
  readonly sftpStatus: number | undefined;

  constructor(message: string, sftpStatus?: number, options: SshErrorOptions = {}) {
    super('ssh_sftp_failed', message, false, options);
    this.sftpStatus = sftpStatus;
  }
}

/** The SHA-256 of a transferred file is not the one that was expected. */
export class SshHashMismatchError extends SshError {
  readonly expected: string;
  readonly actual: string;

  constructor(expected: string, actual: string) {
    super(
      'ssh_hash_mismatch',
      `The SHA-256 of the transferred data is ${actual}, expected ${expected}.`,
    );
    this.expected = expected;
    this.actual = actual;
  }
}

/** The pool was closed while something waited for it, or a lease was requested after `closeAll()`. */
export class SshPoolClosedError extends SshError {
  constructor() {
    super('ssh_pool_closed', 'The SSH pool was closed.');
  }
}

/** A detached step could not be started, found or controlled. */
export class SshStepError extends SshError {
  constructor(
    code: 'ssh_step_failed' | 'ssh_step_not_found' | 'ssh_step_conflict' | 'ssh_step_incomplete',
    message: string,
    options: SshErrorOptions = {},
  ) {
    super(code, message, false, options);
  }
}

/** Replaces every occurrence of a secret in `text` with `[redacted]`. Empty and very short secrets are ignored. */
export function redact(text: string, secrets: readonly (string | undefined)[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret !== undefined && secret.length >= 3) out = out.split(secret).join('[redacted]');
  }
  return out;
}

/** The message of an unknown thrown value, without ever throwing. */
export function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message;
  return typeof value === 'string' ? value : 'unknown error';
}
