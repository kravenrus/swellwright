#!/bin/sh
# swellwright-script: listening-ports v1
#
# What listens on the network, with the process that owns each socket (the owners are visible to root only, hence
# sudo). SW_PARAM_PROTOCOL is tcp (default), udp or all.
#
# What it promises (a test of the repository checks the text for it):
#   - read-only: it writes no file, changes no setting, starts and stops nothing, installs nothing;
#   - no network access from the machine (it reads the table of sockets of the kernel, it connects to nothing);
#   - bounded: every list is cut to a fixed length;
#   - plain POSIX sh (dash is enough), LC_ALL=C so that the output is the same in every language.

LC_ALL=C
export LC_ALL
PATH="$PATH:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export PATH

have() { command -v "$1" >/dev/null 2>&1; }
section() { printf '\n== %s ==\n' "$*"; }

protocol=${SW_PARAM_PROTOCOL:-tcp}
case $protocol in
  tcp) flags=-ltnp ;;
  udp) flags=-lunp ;;
  all) flags=-ltunp ;;
  *)
    echo "protocol must be tcp, udp or all, not: $protocol" >&2
    exit 2
    ;;
esac

if have ss; then
  section "listening sockets ($protocol)"
  ss $flags 2>/dev/null | head -n 200
elif have netstat; then
  section "listening sockets ($protocol, netstat)"
  netstat $flags 2>/dev/null | head -n 200
else
  echo 'neither ss nor netstat is installed' >&2
  exit 3
fi
