# A small sshd for the real-server tests of @swellwright/ssh (packages/ssh/src/*.integration.test.ts).
# For tests only: key logins only, one user, a throwaway key and a throwaway sudo password handed over at start.
#
#   docker build -t swellwright-test-sshd packages/ssh/test/sshd
#   docker run -d --init -p 127.0.0.1:2222:22 -e SWTEST_PUBLIC_KEY="$(cat key.pub)" -e SWTEST_SUDO_PASSWORD=... swellwright-test-sshd
#
# Run it with --init: detached steps leave orphans that something has to reap, as init does on a real server.
# Ubuntu 24.04 like the servers the tool is built for: dash as /bin/sh, util-linux (setsid), coreutils, sudo.
# The base image is pinned by digest; Dependabot proposes new ones.
FROM ubuntu:24.04@sha256:9c7f200c07e3d4a03e7249d2c16bf66a51120fb876aa2242cf31451412543289

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssh-server sudo procps \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --shell /bin/bash swtest \
 && echo 'swtest ALL=(ALL) ALL' > /etc/sudoers.d/swtest \
 && chmod 440 /etc/sudoers.d/swtest \
 && install -d -m 755 /run/sshd

COPY sshd_config /etc/ssh/sshd_config.d/10-swellwright-test.conf
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 755 /usr/local/bin/entrypoint.sh

EXPOSE 22
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
