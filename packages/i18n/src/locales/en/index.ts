import { audit } from './audit.js';
import { auth } from './auth.js';
import { common } from './common.js';
import { errors } from './errors.js';
import { nav } from './nav.js';
import { overview } from './overview.js';
import { roles } from './roles.js';
import { users } from './users.js';

/** English is the source: the key set of every other language must equal this one (see messages.test.ts). */
export const en = { common, nav, errors, auth, users, roles, audit, overview } as const;
