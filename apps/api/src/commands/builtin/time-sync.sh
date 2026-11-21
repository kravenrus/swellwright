#!/bin/sh
# swellwright-script: time-sync v1
#
# The clock: the time now, the time zone, whether the system says it is synchronised, and which time service runs
# (systemd-timesyncd, chrony or ntpd) with what it knows. Nothing is set and nothing is asked of a time server.
#
# What it promises (a test of the repository checks the text for it):
#   - read-only: it writes no file, changes no setting, starts and stops nothing, installs nothing;
#   - no network access from the machine (it reads what the local time service already knows);
#   - bounded: every list is cut to a fixed length;
#   - plain POSIX sh (dash is enough), LC_ALL=C so that the output is the same in every language.

LC_ALL=C
export LC_ALL
PATH="$PATH:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export PATH

have() { command -v "$1" >/dev/null 2>&1; }
section() { printf '\n== %s ==\n' "$*"; }

section clock
printf 'now (UTC):  %s\n' "$(date -u '+%Y-%m-%d %H:%M:%S')"
printf 'epoch:      %s\n' "$(date -u +%s)"

section system view
if have timedatectl; then
  timedatectl status 2>&1 | head -n 14
else
  echo 'timedatectl is not installed'
fi

section time services
if have systemctl; then
  for unit in systemd-timesyncd chrony chronyd ntp ntpd; do
    state=$(systemctl is-active "$unit" 2>/dev/null)
    case $state in
      active | activating | failed) printf '%s: %s\n' "$unit" "$state" ;;
    esac
  done
fi

if have timedatectl; then
  section timesyncd
  timedatectl timesync-status 2>&1 | head -n 14
fi

if have chronyc; then
  section chrony
  chronyc tracking 2>&1 | head -n 14
fi
