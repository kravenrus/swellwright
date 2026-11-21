#!/bin/sh
# swellwright-script: top-processes v1
#
# The processes that use the most processor time and the most memory (SW_PARAM_COUNT of each, 15 by default). One
# snapshot of `ps`, not a live view.
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

count=${SW_PARAM_COUNT:-15}
case $count in '' | *[!0-9]*) count=15 ;; esac
[ "$count" -gt 50 ] && count=50
[ "$count" -lt 1 ] && count=1
lines=$((count + 1))

if ! have ps; then
  echo 'ps is not installed' >&2
  exit 3
fi

section "by processor time (top $count)"
ps -eo pid,user,%cpu,%mem,etime,comm --sort=-%cpu 2>&1 | head -n "$lines"

section "by memory (top $count)"
ps -eo pid,user,%cpu,%mem,rss,etime,comm --sort=-rss 2>&1 | head -n "$lines"

section "process count"
printf 'processes: %s\n' "$(ps -e --no-headers 2>/dev/null | wc -l | tr -d ' ')"
