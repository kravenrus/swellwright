#!/bin/sh
# swellwright-script: sshd-effective-config v1
#
# The settings sshd really uses (`sshd -T`, which merges the main file, the drop-in files and the defaults), the ones
# that decide who can log in and how, and the drop-in files that are present. Needs root to read the host keys, hence
# sudo. Nothing is reloaded.
#
# What it promises (a test of the repository checks the text for it):
#   - read-only: it writes no file, changes no setting, starts and stops nothing, installs nothing;
#   - no network access from the machine;
#   - bounded: every list is cut to a fixed length;
#   - plain POSIX sh (dash is enough), LC_ALL=C so that the output is the same in every language.

LC_ALL=C
export LC_ALL
PATH="$PATH:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export PATH

have() { command -v "$1" >/dev/null 2>&1; }
section() { printf '\n== %s ==\n' "$*"; }

if ! have sshd; then
  echo 'sshd is not installed' >&2
  exit 3
fi

settings=$(sshd -T 2>&1 | head -n 400)

section "who may log in and how"
printf '%s\n' "$settings" | grep -E '^(port|listenaddress|permitrootlogin|passwordauthentication|pubkeyauthentication|kbdinteractiveauthentication|permitemptypasswords|allowusers|denyusers|allowgroups|denygroups|authenticationmethods|maxauthtries|logingracetime|x11forwarding|usepam) ' | head -n 60

section "all settings (first 120 lines)"
printf '%s\n' "$settings" | head -n 120

section "drop-in files"
if [ -d /etc/ssh/sshd_config.d ]; then
  ls -l /etc/ssh/sshd_config.d 2>&1 | head -n 30
else
  echo 'no /etc/ssh/sshd_config.d'
fi
