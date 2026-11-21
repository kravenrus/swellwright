#!/bin/sh
# swellwright-script: memory-and-load v1
#
# Memory, swap and load: free, the load averages, two seconds of vmstat and the pressure counters of the kernel when
# it keeps them. Look at the "available" memory and at whether the swap is in use, not at "free".
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

section free
if have free; then
  free -m 2>/dev/null | head -n 4
elif [ -r /proc/meminfo ]; then
  grep -E '^(MemTotal|MemFree|MemAvailable|SwapTotal|SwapFree):' /proc/meminfo
fi

section load
if [ -r /proc/loadavg ]; then
  printf 'load averages (1, 5, 15 minutes; running/total; last pid): %s\n' "$(cat /proc/loadavg)"
fi
if have nproc; then printf 'processors: %s\n' "$(nproc)"; fi

section vmstat
if have vmstat; then
  vmstat 1 2 2>/dev/null | head -n 4
else
  echo 'vmstat is not installed'
fi

section pressure
for kind in cpu memory io; do
  if [ -r "/proc/pressure/$kind" ]; then
    printf '%s: ' "$kind"
    head -n 1 "/proc/pressure/$kind"
  fi
done
if [ ! -r /proc/pressure/memory ]; then echo 'this kernel keeps no pressure counters'; fi
