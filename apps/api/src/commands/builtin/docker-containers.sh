#!/bin/sh
# swellwright-script: docker-containers v1
#
# The containers (with SW_PARAM_ALL=1 the stopped ones too), their images, and how much disk Docker uses. Docker answers
# the root user and the members of the docker group, hence sudo.
#
# What it promises (a test of the repository checks the text for it):
#   - read-only: it writes no file, changes no setting, starts and stops nothing, installs nothing;
#   - no network access from the machine (it only asks the local Docker daemon what it already knows);
#   - bounded: every list is cut to a fixed length;
#   - plain POSIX sh (dash is enough), LC_ALL=C so that the output is the same in every language.

LC_ALL=C
export LC_ALL
PATH="$PATH:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export PATH

have() { command -v "$1" >/dev/null 2>&1; }
section() { printf '\n== %s ==\n' "$*"; }

if ! have docker; then
  echo 'docker is not installed' >&2
  exit 3
fi

all=${SW_PARAM_ALL:-1}
case $all in
  1) flag=-a ;;
  *) flag= ;;
esac

section version
docker --version 2>/dev/null | head -n 1

section containers
# $flag is empty or one option; it is never user text.
# shellcheck disable=SC2086
docker ps $flag --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>&1 | head -n 80

section images
docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}' 2>&1 | head -n 40

section disk used by docker
docker system df 2>&1 | head -n 10
