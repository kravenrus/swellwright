// Running a command as root through sudo without the password ever appearing in a command line, an environment
// variable or a file.
//
// The remote side is a small POSIX sh program. With a password, the first line of the standard input is the
// password: the wrapper reads it itself, so it can never end up on the standard input of the command, and then
// decides how to run:
//
//   * already root: run the command directly (sudo would not ask root for a password anyway);
//   * sudo needs no password (NOPASSWD, or a cached ticket): `sudo -n`, the password line is simply dropped;
//   * otherwise: `sudo -S -p ''` fed by a pipe that carries the password line and then the rest of the standard input.
//
// The decision matters: a plain `sudo -S` that does not ask for a password would hand the password line to the
// command, which is how a secret ends up in a file written by `cat > file`.

import { shellQuote } from './shell.js';

// $1 is the command. The probe `sudo -n -- sh -c :` goes through the same program (`sh`) as the real call, so a
// sudoers rule that names `sh` applies to both.
const WITH_PASSWORD = [
  'IFS= read -r SWPW',
  'if [ "$(id -u)" = 0 ]; then SWPW=; exec sh -c "$1"; fi',
  'if sudo -n -- sh -c : >/dev/null 2>&1; then SWPW=; exec sudo -n -- sh -c "$1"; fi',
  `{ printf '%s\\n' "$SWPW"; cat; } | sudo -S -p '' -- sh -c "$1"`,
].join('\n');

const WITHOUT_PASSWORD = [
  'if [ "$(id -u)" = 0 ]; then exec sh -c "$1"; fi',
  'exec sudo -n -- sh -c "$1"',
].join('\n');

/** The command line to send for `command` run as root. With a password the caller must send `password + "\n"` first. */
export function sudoCommandLine(command: string, withPassword: boolean): string {
  return `sh -c ${shellQuote(withPassword ? WITH_PASSWORD : WITHOUT_PASSWORD)} swellwright-sudo ${shellQuote(command)}`;
}

/**
 * A shell function `as_root PROGRAM ARGS...` for scripts that already run as the SSH user and need root for one
 * call. `$SWPW` holds the password (read from the first line of the standard input by the script itself).
 */
export const AS_ROOT_FUNCTION = [
  'as_root() {',
  '  if [ "$(id -u)" = 0 ]; then "$@"; return $?; fi',
  '  if sudo -n -- sh -c : >/dev/null 2>&1; then sudo -n -- "$@"; return $?; fi',
  `  printf '%s\\n' "$SWPW" | sudo -S -p '' -- "$@"`,
  '}',
].join('\n');
