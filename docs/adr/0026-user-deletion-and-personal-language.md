# ADR 0026: Deleting users and a language of one's own

Status: accepted

## Context
ADR 0016 let an owner invite, change, disable and reset users but not remove them, and said so. A fleet console that keeps every account it ever created ends up with a list nobody trusts, and a disabled account that can never go away keeps its name taken. Separately, `users.language` defaulted to English: every account was "English" before anyone had chosen, so a person who opened the console in a Russian browser was switched to English by the server after signing in.

## Decision
- **Deleting is a second step after disabling.** `DELETE /users/{id}` (`users:write`, with a step-up, like every change of who may do what) removes an account that is already `disabled`, with everything that hangs on it: password, authenticator, recovery codes, sessions, tokens and the open invitation. An active or invited account answers 409 "Disable the account before deleting it": nobody loses an account by one slip, and the disabling is itself recorded and ends the sessions. Your own account answers 409 too, whatever its state, and an unknown id 404. The same advisory lock as the other user changes serialises it with them, so the "always an active owner" rule cannot be raced (a disabled account is never the last owner).
- **The history stays.** The audit log keeps no foreign key to users: an event stores the id and the name the account had then. Deleting the account removes the person from the user list and not from what happened: `user.deleted` records who deleted it, the name and the role in the same transaction, and everything the account did earlier is still there under its name. The name is free again afterwards and a new account may take it; the id differs, so the log never confuses the two.
- **A language is a choice or nothing.** `users.language` is now nullable and empty for every account (a migration sets existing rows to null: the old value was a default, not a choice). `PATCH /auth/preferences` with `{ language: "ru" | null }` (any signed-in person; the value is a language code, the console offers the ones it has texts for) keeps the choice on the account, so it follows the person to every browser. Null means "follow the browser" and is what the console does until someone picks. After signing in the console applies the saved language once per user; picking one in the account menu changes the browser at once and is saved in the background (a failure to save never blocks the switch). The theme stays a per-browser matter for now.

## Consequences
- Deleting cannot be undone, and the console says so in the confirmation; the way back is to invite the person again.
- A user whose tokens existed loses them at once (the rows are removed with the account), which is the point of deleting and not only disabling.
- A language changed on another browser is picked up at the next sign-in, not live. Reading the preference on every refresh would let an older answer undo what a person just picked.
- Not part of this step: custom roles, bulk user actions, retention rules for deleted accounts in the log (it is never pruned), deletion by the person themselves.
