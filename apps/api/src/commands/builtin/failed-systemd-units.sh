#!/bin/sh
# swellwright-script: failed-systemd-units v1
#
# The units systemd lists as failed, the state of the system as a whole and, for the first few failed units, the last
# lines of their status. Nothing is restarted or reset.
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

if ! have systemctl; then
  echo 'systemd is not there' >&2
  exit 3
fi

section "system state: $(systemctl is-system-running 2>/dev/null)"

section failed units
failed=$(systemctl --failed --no-legend --plain --no-pager 2>/dev/null | head -n 30)
if [ -z "$failed" ]; then
  echo 'none'
else
  printf '%s\n' "$failed"
  printf '%s\n' "$failed" | awk '{print $1}' | head -n 5 | while read -r unit; do
    section "status of $unit"
    systemctl status --no-pager --full -n 8 -- "$unit" 2>/dev/null | head -n 16
  done
fi
