#!/bin/sh
# swellwright-script: recent-errors v1
#
# The errors of the journal in the last SW_PARAM_MINUTES minutes (60 by default), at most SW_PARAM_LINES lines (200 by
# default, newest last), each line cut to 300 characters, and the kernel's own errors. A non-root login sees only its
# own part of the journal; the built-in entry runs as root, hence sudo.
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

# Both numbers arrive in environment variables; anything that is not a plain number falls back to the default.
minutes=${SW_PARAM_MINUTES:-60}
lines=${SW_PARAM_LINES:-200}
case $minutes in '' | *[!0-9]*) minutes=60 ;; esac
case $lines in '' | *[!0-9]*) lines=200 ;; esac
[ "$minutes" -gt 1440 ] && minutes=1440
[ "$minutes" -lt 1 ] && minutes=1
[ "$lines" -gt 500 ] && lines=500
[ "$lines" -lt 1 ] && lines=1

if ! have journalctl; then
  echo 'journalctl is not installed (no systemd journal)' >&2
  exit 3
fi

section "journal: priority err and worse, last $minutes minutes, newest $lines lines"
journalctl -p err --since "-${minutes}min" --no-pager -q -o short-iso 2>&1 | tail -n "$lines" | cut -c 1-300

section "kernel ring buffer: errors"
if have dmesg; then
  dmesg --level=err,crit,alert,emerg 2>&1 | tail -n 30 | cut -c 1-300
else
  echo 'dmesg is not installed'
fi
