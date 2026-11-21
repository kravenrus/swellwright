import type { TFunction } from 'i18next';

import { type HostKeyMismatchDetails, HostKeyMismatchDetailsSchema } from '@swellwright/contracts';
import type { Namespace } from '@swellwright/i18n';

import { ApiRequestError } from '../api.js';
import { describeError } from '../auth/messages.js';
import { notifyError } from '../shell/feedback.js';

/**
 * What the person reads when an SSH operation did not go through. The errors that only SSH has (a host key that is
 * not the pinned one, an address the policy refuses, a server that did not answer) are told in the console's language;
 * everything else is what every other call says.
 */
export function sshErrorText(
  t: TFunction<Namespace[]>,
  error: unknown,
  whenUnauthorized: string,
  whenForbidden?: string,
): string {
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'host_key_not_pinned':
        return t('errors:ssh.hostKeyNotPinned');
      case 'host_key_mismatch':
        return t('errors:ssh.hostKeyMismatch');
      case 'host_key_replace_required':
        return t('errors:ssh.hostKeyReplaceRequired');
      case 'address_not_allowed':
        return t('errors:ssh.addressNotAllowed');
      case 'no_access_entry':
        return t('errors:ssh.noAccessEntry');
      case 'ssh_connect_failed':
        return t('errors:ssh.connectFailed');
      case 'ssh_auth_failed':
        return t('errors:ssh.authFailed');
      case 'ssh_key_invalid':
        return t('errors:ssh.keyInvalid');
      case 'ssh_timeout':
        return t('errors:ssh.timeout');
      case 'ssh_failed':
        return t('errors:ssh.failed');
      case 'facts_unreadable':
        return t('errors:ssh.factsUnreadable');
      case 'rate_limited':
        return t('errors:ssh.rateLimited');
      default:
        break;
    }
  }
  return describeError(t, error, whenUnauthorized, whenForbidden);
}

/** A red toast named after the action, with `sshErrorText` as its text. */
export function notifySshFailure(
  t: TFunction<Namespace[]>,
  title: string,
  error: unknown,
  whenUnauthorized: string,
  whenForbidden?: string,
): void {
  notifyError(title, sshErrorText(t, error, whenUnauthorized, whenForbidden));
}

/** The two fingerprints of a host key that was not the expected one, when the error carries them. */
export function hostKeyMismatchOf(error: unknown): HostKeyMismatchDetails | null {
  if (!(error instanceof ApiRequestError) || error.code !== 'host_key_mismatch') {
    return null;
  }
  const parsed = HostKeyMismatchDetailsSchema.safeParse(error.details);
  return parsed.success ? parsed.data : null;
}
