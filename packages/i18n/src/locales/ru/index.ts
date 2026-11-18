import { audit } from './audit.js';
import { auth } from './auth.js';
import { common } from './common.js';
import { errors } from './errors.js';
import { nav } from './nav.js';
import { overview } from './overview.js';
import { roles } from './roles.js';
import { sessions } from './sessions.js';
import { tokens } from './tokens.js';
import { users } from './users.js';
import { vault } from './vault.js';

export const ru = {
  common,
  nav,
  errors,
  auth,
  users,
  roles,
  audit,
  overview,
  vault,
  sessions,
  tokens,
} as const;
