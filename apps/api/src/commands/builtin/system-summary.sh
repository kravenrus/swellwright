#!/bin/sh
# swellwright-script: system-summary v1
#
# One screen about the machine: host name, system, kernel, uptime, load, processors, memory, the root disk, the state
# of systemd, whether a reboot is pending and what kind of virtual machine it is.
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

section host
printf 'hostname:   %s\n' "$(hostname 2>/dev/null)"
printf 'login:      %s (uid %s)\n' "$(id -un 2>/dev/null)" "$(id -u 2>/dev/null)"
printf 'date (UTC): %s\n' "$(date -u '+%Y-%m-%d %H:%M:%S')"

section system
if [ -r /etc/os-release ]; then
  # Only the lines this script asks for are looked at; the file is not run.
  grep -E '^(PRETTY_NAME|VERSION_ID|ID)=' /etc/os-release | head -n 3
else
  echo 'no /etc/os-release'
fi
printf 'kernel:     %s %s\n' "$(uname -sr)" "$(uname -m)"
if have systemd-detect-virt; then
  printf 'virtual:    %s\n' "$(systemd-detect-virt 2>/dev/null)"
fi

section uptime and load
uptime 2>/dev/null || cat /proc/uptime /proc/loadavg 2>/dev/null

section processors
if have nproc; then printf 'cpus:       %s\n' "$(nproc)"; fi
if [ -r /proc/cpuinfo ]; then
  grep -m 1 'model name' /proc/cpuinfo
fi

section memory
if [ -r /proc/meminfo ]; then
  grep -E '^(MemTotal|MemAvailable|SwapTotal|SwapFree):' /proc/meminfo
else
  echo 'no /proc/meminfo'
fi

section root disk
df -P -h / 2>/dev/null | head -n 2

section systemd
if have systemctl; then
  printf 'state:      %s\n' "$(systemctl is-system-running 2>/dev/null)"
  systemctl --failed --no-legend --plain --no-pager 2>/dev/null | head -n 10
else
  echo 'systemd is not there'
fi

section reboot
if [ -e /var/run/reboot-required ]; then
  echo 'reboot required: yes'
else
  echo 'reboot required: no'
fi
