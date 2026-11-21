#!/bin/sh
# swellwright-facts: schema 1
#
# The script Swellwright runs on a managed server to learn what the server is (ADR 0037). Its SHA-256 is stored with
# every result. Changing anything here changes that hash, so the history shows which script produced which facts.
#
# What it promises:
#   - read-only: it writes no file, changes no setting, starts and stops nothing, installs nothing;
#   - no network access: it asks nothing outside the machine (package counts come from the lists already on disk);
#   - bounded: every external program gets a deadline when timeout(1) exists, and every list is cut to a fixed length;
#   - plain POSIX sh (dash is enough), no bashisms, LC_ALL=C so that the output is the same in every language.
#
# What it prints: a first line `@@swf script 1`, then sections `@@swf begin NAME` ... `@@swf end NAME`, then
# `@@swf done`. The raw output of the tools is inside the sections; Swellwright parses it strictly and ignores
# whatever it does not know. A section says `!absent` when the tool is not installed and `!error` when the tool
# failed (usually: it needs root), so "none found" and "could not look" are told apart.

LC_ALL=C
export LC_ALL
PATH="$PATH:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export PATH
# Whatever the tools complain about is not data.
exec 2>/dev/null

have() { command -v "$1" >/dev/null 2>&1; }

# Runs a program with a deadline when timeout(1) is there: bounded SECONDS PROGRAM ARGS...
bounded() {
  limit=$1
  shift
  if have timeout; then timeout "$limit" "$@"; else "$@"; fi
}

begin() { printf '@@swf begin %s\n' "$1"; }
finish() { printf '\n@@swf end %s\n' "$1"; }

printf '@@swf script 1\n'

begin user
printf 'uid=%s\n' "$(id -u)"
finish user

begin os
if [ -r /etc/os-release ]; then
  head -n 40 /etc/os-release
elif [ -r /usr/lib/os-release ]; then
  head -n 40 /usr/lib/os-release
else
  printf '!absent\n'
fi
finish os

begin kernel
printf 'name=%s\n' "$(uname -s)"
printf 'release=%s\n' "$(uname -r)"
printf 'arch=%s\n' "$(uname -m)"
printf 'hostname=%s\n' "$(uname -n)"
finish kernel

begin uptime
if [ -r /proc/uptime ]; then head -n 1 /proc/uptime; else printf '!absent\n'; fi
finish uptime

begin loadavg
if [ -r /proc/loadavg ]; then head -n 1 /proc/loadavg; else printf '!absent\n'; fi
finish loadavg

begin cpu
if have nproc; then
  printf 'cpus=%s\n' "$(nproc)"
elif [ -r /proc/cpuinfo ]; then
  printf 'cpus=%s\n' "$(grep -c '^processor' /proc/cpuinfo)"
else
  printf '!absent\n'
fi
finish cpu

begin memory
if [ -r /proc/meminfo ]; then
  grep -E '^(MemTotal|MemAvailable|SwapTotal|SwapFree):' /proc/meminfo
else
  printf '!absent\n'
fi
finish memory

begin disks
if have df; then
  bounded 10 df -P -k | head -n 64
else
  printf '!absent\n'
fi
finish disks

begin time
printf 'epoch=%s\n' "$(date -u +%s)"
if [ -r /etc/timezone ]; then
  printf 'timezone=%s\n' "$(head -n 1 /etc/timezone)"
elif [ -L /etc/localtime ]; then
  printf 'timezone=%s\n' "$(readlink /etc/localtime | sed 's|.*/zoneinfo/||')"
fi
if have timedatectl; then
  bounded 5 timedatectl show -p NTPSynchronized -p Timezone
fi
finish time

begin systemd
if have systemctl; then
  printf 'state=%s\n' "$(bounded 5 systemctl is-system-running)"
  bounded 5 systemctl --failed --no-legend --plain --no-pager | head -n 20 | sed 's/^/failed: /'
else
  printf '!absent\n'
fi
finish systemd

begin reboot
if [ -e /var/run/reboot-required ] || [ -e /run/reboot-required ]; then
  printf 'required=yes\n'
else
  printf 'required=no\n'
fi
finish reboot

begin ports
if have ss; then
  bounded 10 ss -ltnp | tail -n +2 | head -n 200
else
  printf '!absent\n'
fi
finish ports

begin services
if have systemctl; then
  for unit in ssh sshd docker haproxy nginx fail2ban ufw; do
    printf 'unit=%s\n' "$unit"
    bounded 5 systemctl show -p LoadState -p ActiveState "$unit.service"
  done
else
  printf '!absent\n'
fi
finish services

begin versions
if have docker; then printf 'docker=%s\n' "$(bounded 10 docker --version | head -n 1)"; fi
if have haproxy; then printf 'haproxy=%s\n' "$(bounded 10 haproxy -v | head -n 1)"; fi
if have nginx; then printf 'nginx=%s\n' "$(bounded 10 nginx -v 2>&1 | head -n 1)"; fi
if have fail2ban-client; then printf 'fail2ban=%s\n' "$(bounded 10 fail2ban-client --version | head -n 1)"; fi
finish versions

begin containers
if have docker; then
  list=$(bounded 15 docker ps -a --format '{{.Names}}|{{.Image}}|{{.State}}|{{.Status}}')
  if [ $? -eq 0 ]; then
    printf '%s\n' "$list" | head -n 200
  else
    printf '!error\n'
  fi
else
  printf '!absent\n'
fi
finish containers

begin ufw
if have ufw; then
  line=$(bounded 10 ufw status)
  if [ $? -eq 0 ]; then
    printf '%s\n' "$line" | head -n 1
  else
    printf '!error\n'
  fi
else
  printf '!absent\n'
fi
finish ufw

begin sshd
if have sshd; then
  settings=$(bounded 10 sshd -T)
  if [ $? -eq 0 ]; then
    printf '%s\n' "$settings" | grep -E '^(port|passwordauthentication|permitrootlogin) ' | head -n 20
  else
    printf '!error\n'
  fi
else
  printf '!absent\n'
fi
finish sshd

# The package lists the server already has; nothing is fetched. The package and source caches are switched off so that
# even as root nothing is written.
begin updates
if have apt-get; then
  simulated=$(bounded 20 apt-get -s -o Debug::NoLocking=1 -o Dir::Cache::pkgcache= -o Dir::Cache::srcpkgcache= upgrade)
  if [ $? -eq 0 ]; then
    printf 'manager=apt\n'
    printf 'upgradable=%s\n' "$(printf '%s\n' "$simulated" | grep -c '^Inst ')"
  else
    printf '!error\n'
  fi
else
  printf '!absent\n'
fi
finish updates

printf '@@swf done\n'
