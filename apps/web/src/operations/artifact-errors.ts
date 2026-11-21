import type { TFunction } from 'i18next';

import { ArtifactHashMismatchDetailsSchema } from '@swellwright/contracts';
import type { Namespace } from '@swellwright/i18n';

import { ApiRequestError } from '../api.js';
import { sshErrorText } from '../fleet/ssh-errors.js';
import { notifyError } from '../shell/feedback.js';

/**
 * What the person reads when an artifact operation did not go through. The errors that only artifacts have (a file that
 * is broken in the catalogue, a push to the other place, a copy that arrived damaged, a login that cannot use sudo) are
 * told here; everything else is what every SSH operation says (`sshErrorText`).
 */
export function artifactErrorText(
  t: TFunction<Namespace[]>,
  error: unknown,
  whenUnauthorized: string,
  whenForbidden?: string,
): string {
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'artifact_broken':
        return t('artifacts:errors.broken');
      case 'artifact_busy':
        return t('artifacts:errors.busy');
      case 'artifact_destination_conflict':
        return t('artifacts:errors.destinationConflict');
      case 'sudo_unavailable':
        return t('artifacts:errors.sudoUnavailable');
      case 'artifact_hash_mismatch': {
        const details = ArtifactHashMismatchDetailsSchema.safeParse(error.details);
        if (!details.success) {
          return t('artifacts:errors.hashMismatch');
        }
        const what =
          details.data.stage === 'upload'
            ? t('artifacts:errors.hashMismatch')
            : t('artifacts:errors.hashMismatchFinal');
        return `${what} ${t('artifacts:errors.expected')}: ${details.data.expected}. ${t('artifacts:errors.actual')}: ${details.data.actual}.`;
      }
      default:
        break;
    }
  }
  return sshErrorText(t, error, whenUnauthorized, whenForbidden);
}

/** A red toast named after the action, with `artifactErrorText` as its text. */
export function notifyArtifactFailure(
  t: TFunction<Namespace[]>,
  title: string,
  error: unknown,
  whenUnauthorized: string,
  whenForbidden?: string,
): void {
  notifyError(title, artifactErrorText(t, error, whenUnauthorized, whenForbidden));
}
