#!/bin/sh
# Prepares the test user from the environment, then runs sshd in the foreground.
set -eu
: "${SWTEST_PUBLIC_KEY:?SWTEST_PUBLIC_KEY is required}"
: "${SWTEST_SUDO_PASSWORD:?SWTEST_SUDO_PASSWORD is required}"

# The password is used by sudo only: sshd does not accept passwords (see sshd_config).
printf 'swtest:%s\n' "$SWTEST_SUDO_PASSWORD" | chpasswd
install -d -m 700 -o swtest -g swtest /home/swtest/.ssh
printf '%s\n' "$SWTEST_PUBLIC_KEY" > /home/swtest/.ssh/authorized_keys
chown swtest:swtest /home/swtest/.ssh/authorized_keys
chmod 600 /home/swtest/.ssh/authorized_keys
# The directory the tests fill and delete.
install -d -m 700 -o swtest -g swtest /var/lib/swellwright-test

mkdir -p /run/sshd
ssh-keygen -A
exec /usr/sbin/sshd -D -e
