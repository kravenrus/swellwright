#!/bin/sh
# swellwright-script: pending-reboot-and-updates v1
#
# Whether the machine waits for a reboot (and for which packages), whether the running kernel is the newest installed,
# and which packages an upgrade would change, by the package lists the machine already has. The upgrade is only
# simulated (`apt-get -s`) with both caches switched off, so not even root writes anything and nothing is downloaded.
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

section reboot
if [ -e /var/run/reboot-required ]; then
  echo 'reboot required: yes'
  if [ -r /var/run/reboot-required.pkgs ]; then
    echo 'because of:'
    head -n 20 /var/run/reboot-required.pkgs
  fi
else
  echo 'reboot required: no'
fi

section kernel
printf 'running:    %s\n' "$(uname -r)"
if have dpkg-query; then
  echo 'installed kernel images (newest last):'
  dpkg-query -W -f '${Package} ${Version}\n' 'linux-image-[0-9]*' 2>/dev/null | sort -V | tail -n 5
fi

section "packages an upgrade would change (simulated, from the lists on disk)"
if have apt-get; then
  simulated=$(apt-get -s -o Debug::NoLocking=1 -o Dir::Cache::pkgcache= -o Dir::Cache::srcpkgcache= upgrade 2>/dev/null)
  count=$(printf '%s\n' "$simulated" | grep -c '^Inst ')
  printf 'upgradable: %s\n' "$count"
  security=$(printf '%s\n' "$simulated" | grep '^Inst ' | grep -ci 'security')
  printf 'of which from a security source: %s\n' "$security"
  printf '%s\n' "$simulated" | grep '^Inst ' | cut -c 1-160 | head -n 40
  echo '(the lists are as old as the last apt update on this machine)'
else
  echo 'apt-get is not there: this check knows only Debian and Ubuntu'
fi
