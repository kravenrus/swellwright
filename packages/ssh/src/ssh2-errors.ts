// Turns the errors ssh2 emits into the typed errors of this package. ssh2 tags its errors with a `level`
// ('client-socket', 'client-timeout', 'client-authentication', 'handshake', 'protocol', ...) and Node adds `code`.

import {
  SshAuthError,
  SshConnectError,
  SshConnectionLostError,
  SshTimeoutError,
  messageOf,
  redact,
  type SshConnectReason,
  type SshError,
} from './errors.js';

export interface Ssh2ErrorLike extends Error {
  code?: string | number;
  level?: string;
}

export function reasonOf(code: string | number | undefined): SshConnectReason {
  switch (code) {
    case 'ECONNREFUSED':
      return 'refused';
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
    case 'EAI_FAIL':
      return 'dns';
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
    case 'EADDRNOTAVAIL':
      return 'unreachable';
    case 'ECONNRESET':
    case 'EPIPE':
      return 'reset';
    default:
      return 'other';
  }
}

/** An error that happened before the connection was ready (TCP, key exchange, authentication). */
export function mapHandshakeError(
  error: Ssh2ErrorLike,
  timeoutMs: number,
  secrets: readonly (string | undefined)[],
): SshError {
  const message = redact(messageOf(error), secrets);
  const code = typeof error.code === 'string' ? error.code : undefined;
  switch (error.level) {
    case 'client-authentication':
      return new SshAuthError('The server rejected the credentials.', 'ssh_auth_failed', {
        cause: error,
      });
    case 'client-timeout':
      return new SshTimeoutError('connect', timeoutMs, { cause: error });
    case 'client-dns':
      return new SshConnectError(`Name resolution failed: ${message}`, 'dns', { cause: error });
    case 'client-socket':
      if (code === 'ETIMEDOUT') return new SshTimeoutError('connect', timeoutMs, { cause: error });
      return new SshConnectError(
        `The TCP connection failed${code === undefined ? '' : ` (${code})`}.`,
        reasonOf(code),
        {
          cause: error,
        },
      );
    case 'handshake':
    case 'protocol':
      return new SshConnectError(`The SSH handshake failed: ${message}`, 'handshake', {
        cause: error,
      });
    default:
      break;
  }
  if (message.includes('All configured authentication methods failed')) {
    return new SshAuthError('The server rejected the credentials.', 'ssh_auth_failed', {
      cause: error,
    });
  }
  if (
    message.startsWith('Cannot parse privateKey') ||
    message.includes('privateKey value does not contain')
  ) {
    return new SshAuthError(`The private key cannot be used: ${message}`, 'ssh_key_invalid', {
      cause: error,
    });
  }
  return new SshConnectError(`The SSH connection failed: ${message}`, reasonOf(code), {
    cause: error,
  });
}

/** An error on a connection that had been ready: the connection is dead. */
export function mapRuntimeError(error: Ssh2ErrorLike, keepaliveMs: number): SshError {
  if (error.level === 'client-timeout') {
    return new SshTimeoutError('keepalive', keepaliveMs, { cause: error });
  }
  return new SshConnectionLostError(`The SSH connection was lost: ${messageOf(error)}`, {
    cause: error,
  });
}
