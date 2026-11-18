/** What the person sees for a failed call to the API (apps/web/src/auth/messages.ts). */
export const errors = {
  unreachable: 'The API does not answer. Check that the server is running.',
  stepUpCancelled: 'You did not confirm with a code, so nothing was changed.',
  rateLimited_one: 'Too many failed attempts. Try again in about {{count}} minute.',
  rateLimited_other: 'Too many failed attempts. Try again in about {{count}} minutes.',
  rateLimitedShort: 'Too many attempts. Try again in a moment.',
  forbidden: 'The server refused this request.',
  stepUpRequired: 'Confirm with a code from your authenticator, then try again.',
  notReady: 'The server cannot sign anyone in yet: it has no database.',
  validation: 'Some of the values are not valid.',
  server: 'Something went wrong on the server. Try again.',
  generic: 'Something went wrong. Try again.',
} as const;
