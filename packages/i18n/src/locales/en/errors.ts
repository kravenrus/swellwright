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
  vaultSealed: 'The vault is sealed. Unseal it with the passphrase first.',
  validation: 'Some of the values are not valid.',
  server: 'Something went wrong on the server. Try again.',
  generic: 'Something went wrong. Try again.',
  ssh: {
    hostKeyNotPinned:
      'No host key is pinned for this server. Scan its host key and confirm the fingerprint first.',
    hostKeyMismatch: 'The server shows another host key than the pinned one. No login was sent.',
    hostKeyReplaceRequired:
      'Other host keys are pinned for this server. Confirm that they are to be replaced, or find out why the key changed.',
    addressNotAllowed:
      'The address of this server is not allowed by the policy of this installation.',
    noAccessEntry: 'This server has no way to log in. Add an access entry first.',
    connectFailed: 'The server could not be reached over SSH.',
    authFailed: 'The server did not accept the login.',
    keyInvalid: 'The private key in the vault cannot be used.',
    timeout: 'The server did not answer in time.',
    failed: 'The SSH connection failed.',
    factsUnreadable: 'The server did not answer with the output of the facts script.',
    rateLimited: 'Too many SSH operations. Try again in a minute.',
  },
} as const;
