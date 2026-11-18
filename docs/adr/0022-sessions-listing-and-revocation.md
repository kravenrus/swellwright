# ADR 0022: Listing and ending sessions

Status: accepted

## Context
Sessions existed since ADR 0014, but nobody could see them or end one short of resetting a user's credentials. A stolen cookie is the realistic attack on a signed-in browser (ADR 0017), and the answer to "I think someone has my session" has to be a button, not an operation on the account. The design lists Sessions as a page of the Security section.

## Decision
- **Everyone sees and ends their own sessions.** `GET /auth/sessions`, `DELETE /auth/sessions/{id}` and `POST /auth/sessions/revoke-others` are open to any signed-in user (they join `ROUTES_OPEN_TO_ANY_SESSION` with `getMe`, `changePassword` and `stepUp`: your own account, nothing else). A session that belongs to someone else is reported as "not found" through these routes, so they cannot be used to probe other accounts. Ending your own sessions needs no second factor: it can only reduce what an attacker has.
- **Administrators see and end the sessions of others.** `sessions:read` lists the sessions of every user (owner and auditor); `sessions:revoke` ends one (`DELETE /sessions/{id}`) or all of a user (`POST /users/{id}/sessions/revoke`), always with a step-up (ADR 0017): ending someone else's session is a decision about another person, and a hijacked cookie must not be able to lock everyone out. `sessions:revoke` implies `sessions:read`. The owner has both.
- **The session in use is never ended by a request.** Through every route it is a 409 that says to sign out; a call cannot cut the branch it sits on, and "end all other sessions" keeps the current one. For your own account the bulk call is `revoke-others`; `/users/{id}/sessions/revoke` refuses it (409).
- **What is listed.** Active sessions only: fully signed in (`active`), not idle-expired, not past the absolute limit. A half-finished sign-in (`password_verified`) is not a session anyone can use and is not shown. Most recently used first, at most 500. For each: user, start, last use, idle and absolute expiry, address and browser as the server saw them at sign-in, whether it is the current one and whether it is elevated right now. The token and its hash are never sent.
- **Recorded.** `session.revoked` with the scope (`own`, `user`, `others`) and the user name; a bulk call records once, with the count, and nothing is recorded when there was nothing to end. Written in the same transaction as the deletion.
- **Six permissions join the catalogue** in this step, for this and the next slices of the Security section: `sessions:read`, `sessions:revoke`, `tokens:create`, `tokens:read`, `tokens:revoke`, `audit:export`. The last four have no routes yet. `sessions:revoke`, `tokens:create`, `tokens:revoke` and `audit:export` are in `STEP_UP_PERMISSIONS`, so a route holding one cannot omit `stepUp` (a test enforces it). The operator may create tokens in its own name; the auditor reads sessions, tokens and exports the log.

## Consequences
- "I think my cookie was stolen" has an answer a user can carry out alone, and an administrator can do the same for a user in two clicks with a code.
- A listing shows the address and browser recorded at sign-in, not the latest ones; a stolen cookie used from elsewhere shows as the original address. Showing the last address needs a write on every request, which ADR 0014 avoided; it can come with the token usage record.
- The cost of a bulk revoke is one delete and one audit record; there is no per-session record for the bulk case, only the count.
