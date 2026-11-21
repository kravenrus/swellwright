#!/bin/sh
# swellwright-script: fail2ban-status v1
#
# fail2ban: whether the service runs, the jails, and for each jail how many addresses are banned now and which. The
# client talks to the daemon over its socket, which is for root, hence sudo. Nothing is banned or unbanned.
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

if ! have fail2ban-client; then
  echo 'fail2ban is not installed' >&2
  exit 3
fi

section service
if have systemctl; then
  printf 'systemd says: %s\n' "$(systemctl is-active fail2ban 2>/dev/null)"
fi

section jails
overview=$(fail2ban-client status 2>&1 | head -n 20)
printf '%s\n' "$overview"

jails=$(printf '%s\n' "$overview" | sed -n 's/.*Jail list:[[:space:]]*//p' | tr ',' ' ')
count=0
for jail in $jails; do
  count=$((count + 1))
  if [ "$count" -gt 20 ]; then
    echo '(more jails than the 20 shown)'
    break
  fi
  # A jail name comes from the daemon; it is used as one word, and only letters, digits and a few signs pass.
  case $jail in
    *[!A-Za-z0-9_.-]*) continue ;;
  esac
  section "jail $jail"
  fail2ban-client status "$jail" 2>&1 | head -n 14
done
