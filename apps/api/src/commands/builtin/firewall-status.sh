#!/bin/sh
# swellwright-script: firewall-status v1
#
# The firewall as it is now: ufw (verbose), and the rules of iptables, ip6tables and nftables as the kernel holds
# them. Reading the rules needs root, hence sudo. Nothing is enabled, disabled, added or deleted.
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

found=0

if have ufw; then
  found=1
  section ufw
  ufw status verbose 2>&1 | head -n 80
fi

if have iptables; then
  found=1
  section iptables rules
  iptables -S 2>&1 | head -n 200
fi

if have ip6tables; then
  found=1
  section ip6tables rules
  ip6tables -S 2>&1 | head -n 100
fi

if have nft; then
  found=1
  section nftables ruleset
  nft list ruleset 2>&1 | head -n 200
fi

if [ "$found" = 0 ]; then
  echo 'no firewall tool found (ufw, iptables, ip6tables, nft)' >&2
  exit 3
fi
