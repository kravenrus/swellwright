import type { TFunction } from 'i18next';

import type { Namespace } from '@swellwright/i18n';

import { StepUpCancelledError } from '../api.js';
import { describeError } from '../auth/messages.js';
import { notifyError, notifyWarning } from '../shell/feedback.js';

/**
 * Tells the person that an action did not go through, as the panel does: a red toast named after the action with
 * the reason as its text. A code prompt that was dismissed is not a failure (nothing was attempted), so it is an
 * orange warning instead. `whenUnauthorized` and `whenForbidden` are what `describeError` says for those two
 * refusals, already translated.
 */
export function notifyFailure(
  t: TFunction<Namespace[]>,
  title: string,
  error: unknown,
  whenUnauthorized: string,
  whenForbidden?: string,
): void {
  const message = describeError(t, error, whenUnauthorized, whenForbidden);
  if (error instanceof StepUpCancelledError) {
    notifyWarning(title, message);
  } else {
    notifyError(title, message);
  }
}
