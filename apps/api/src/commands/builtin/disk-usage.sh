#!/bin/sh
# swellwright-script: disk-usage v1
#
# Where the disk space went: the filesystems (space and inodes) and the biggest directories one level below a path
# (SW_PARAM_PATH, /var by default). The directory walk stays on one filesystem and gets a deadline when timeout(1)
# exists, so a huge tree cannot keep it for long.
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

# The path arrives in an environment variable and is only ever used as one quoted word after `--`.
path=${SW_PARAM_PATH:-/var}
case $path in
  /*) ;;
  *)
    echo "the path must be absolute: $path" >&2
    exit 2
    ;;
esac

section filesystems
df -P -h 2>/dev/null | head -n 40

section inodes
df -P -i 2>/dev/null | head -n 40

section "biggest directories below $path (one filesystem, at most 25 s)"
if [ ! -d "$path" ]; then
  echo "no such directory: $path" >&2
  exit 3
fi
if have timeout; then
  timeout 25 du -xk -d 1 -- "$path" 2>/dev/null | sort -rn | head -n 16
else
  du -xk -d 1 -- "$path" 2>/dev/null | sort -rn | head -n 16
fi
echo '(sizes in KiB; the first line is the path itself)'
