import type { TFunction } from 'i18next';

import type { Namespace } from '@swellwright/i18n';

import { ApiRequestError, ApiUnreachableError, StepUpCancelledError } from '../api.js';

/**
 * What the person sees for a failed call, in the language of the console. `unauthorized` reads differently on
 * each screen, so the caller says what it means there (already translated).
 */
export function describeError(
  t: TFunction<Namespace[]>,
  error: unknown,
  whenUnauthorized: string,
  whenForbidden?: string,
): string {
  if (error instanceof ApiUnreachableError) {
    return t('errors:unreachable');
  }
  if (error instanceof StepUpCancelledError) {
    return t('errors:stepUpCancelled');
  }
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'unauthorized':
        return whenUnauthorized;
      case 'rate_limited': {
        const minutes = error.retryAfterSeconds
          ? Math.ceil(error.retryAfterSeconds / 60)
          : undefined;
        return minutes ? t('errors:rateLimited', { count: minutes }) : t('errors:rateLimitedShort');
      }
      case 'forbidden':
        return whenForbidden ?? t('errors:forbidden');
      case 'vault_sealed':
        return t('errors:vaultSealed');
      case 'step_up_required':
        return t('errors:stepUpRequired');
      case 'not_ready':
        return t('errors:notReady');
      case 'conflict':
      case 'bad_request':
        // The server says what is in the way (a name that is taken, the last owner, a secret of the wrong kind);
        // it speaks English.
        return error.message;
      case 'validation_failed':
        return t('errors:validation');
      default:
        return t('errors:server');
    }
  }
  return t('errors:generic');
}
