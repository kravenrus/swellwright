import { ApiRequestError, ApiUnreachableError, StepUpCancelledError } from '../api.js';

/** What the person sees for a failed call. `unauthorized` reads differently on each screen. */
export function describeError(
  error: unknown,
  whenUnauthorized: string,
  whenForbidden = 'The server refused this request.',
): string {
  if (error instanceof ApiUnreachableError) {
    return 'The API does not answer. Check that the server is running.';
  }
  if (error instanceof StepUpCancelledError) {
    return 'You did not confirm with a code, so nothing was changed.';
  }
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'unauthorized':
        return whenUnauthorized;
      case 'rate_limited': {
        const minutes = error.retryAfterSeconds
          ? Math.ceil(error.retryAfterSeconds / 60)
          : undefined;
        return minutes
          ? `Too many failed attempts. Try again in about ${String(minutes)} minute${minutes === 1 ? '' : 's'}.`
          : 'Too many attempts. Try again in a moment.';
      }
      case 'forbidden':
        return whenForbidden;
      case 'step_up_required':
        return 'Confirm with a code from your authenticator, then try again.';
      case 'not_ready':
        return 'The server cannot sign anyone in yet: it has no database.';
      case 'conflict':
        return error.message;
      case 'validation_failed':
        return 'Some of the values are not valid.';
      default:
        return 'Something went wrong on the server. Try again.';
    }
  }
  return 'Something went wrong. Try again.';
}
