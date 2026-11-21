// Outputs of the facts script (collect-facts.sh) for the tests of the parser. The two Ubuntu 24.04 samples were captured
// by running the script on a real server (as a plain user, and as root through sudo); the host name was replaced. The
// other samples were written by hand from the documented formats of the tools of each system, with the values a node of
// a fleet has, and say so. Nothing here belongs to a real instance.

/** Captured on Ubuntu 24.04 as a plain user: root-only facts are marked `!error`. */
export const UBUNTU_2404_AS_USER = `@@swf script 1
@@swf begin user
uid=1000

@@swf end user
@@swf begin os
PRETTY_NAME="Ubuntu 24.04.5 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
VERSION="24.04.5 LTS (Noble Numbat)"
VERSION_CODENAME=noble
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"
PRIVACY_POLICY_URL="https://www.ubuntu.com/legal/terms-and-policies/privacy-policy"
UBUNTU_CODENAME=noble
LOGO=ubuntu-logo

@@swf end os
@@swf begin kernel
name=Linux
release=6.8.0-36-generic
arch=x86_64
hostname=node-1.example.com

@@swf end kernel
@@swf begin uptime
336130.61 332587.09

@@swf end uptime
@@swf begin loadavg
0.02 0.03 0.00 1/142 102811

@@swf end loadavg
@@swf begin cpu
cpus=1

@@swf end cpu
@@swf begin memory
MemTotal:        2015392 kB
MemAvailable:    1574724 kB
SwapTotal:        524284 kB
SwapFree:         523504 kB

@@swf end memory
@@swf begin disks
Filesystem     1024-blocks    Used Available Capacity Mounted on
tmpfs               201540    1972    199568       1% /run
/dev/vda1         15394840 4859788   9732528      34% /
tmpfs              1007696       0   1007696       0% /dev/shm
tmpfs                 5120       0      5120       0% /run/lock
tmpfs               201536      16    201520       1% /run/user/1000

@@swf end disks
@@swf begin time
epoch=1795285600
timezone=Etc/UTC
Timezone=Etc/UTC
NTPSynchronized=no

@@swf end time
@@swf begin systemd
state=degraded
failed: fwupd-refresh.service loaded failed failed Refresh fwupd metadata and update motd
failed: fwupd.service         loaded failed failed Firmware update daemon
failed: ifup-eth0.service     loaded failed failed ifup for eth0
failed: networking.service    loaded failed failed Raise network interfaces

@@swf end systemd
@@swf begin reboot
required=yes

@@swf end reboot
@@swf begin ports
LISTEN 0      4096         0.0.0.0:22        0.0.0.0:*          
LISTEN 0      511          0.0.0.0:80        0.0.0.0:*          
LISTEN 0      511        127.0.0.1:8444      0.0.0.0:*          
LISTEN 0      4096            [::]:22           [::]:*          

@@swf end ports
@@swf begin services
unit=ssh
LoadState=loaded
ActiveState=active
unit=sshd
LoadState=not-found
ActiveState=inactive
unit=docker
LoadState=loaded
ActiveState=active
unit=haproxy
LoadState=not-found
ActiveState=inactive
unit=nginx
LoadState=loaded
ActiveState=active
unit=fail2ban
LoadState=loaded
ActiveState=active
unit=ufw
LoadState=loaded
ActiveState=active

@@swf end services
@@swf begin versions
docker=Docker version 29.10.0, build fdd4b8e
nginx=nginx version: nginx/1.30.6
fail2ban=Fail2Ban v1.0.2

@@swf end versions
@@swf begin containers
!error

@@swf end containers
@@swf begin ufw
!error

@@swf end ufw
@@swf begin sshd
!error

@@swf end sshd
@@swf begin updates
manager=apt
upgradable=17

@@swf end updates
@@swf done
`;

/** Captured on Ubuntu 24.04 as root (through sudo). */
export const UBUNTU_2404_AS_ROOT = `@@swf script 1
@@swf begin user
uid=0

@@swf end user
@@swf begin os
PRETTY_NAME="Ubuntu 24.04.5 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
VERSION="24.04.5 LTS (Noble Numbat)"
VERSION_CODENAME=noble
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"
PRIVACY_POLICY_URL="https://www.ubuntu.com/legal/terms-and-policies/privacy-policy"
UBUNTU_CODENAME=noble
LOGO=ubuntu-logo

@@swf end os
@@swf begin kernel
name=Linux
release=6.8.0-36-generic
arch=x86_64
hostname=node-1.example.com

@@swf end kernel
@@swf begin uptime
336137.81 332587.98

@@swf end uptime
@@swf begin loadavg
0.09 0.04 0.01 1/146 102953

@@swf end loadavg
@@swf begin cpu
cpus=1

@@swf end cpu
@@swf begin memory
MemTotal:        2015392 kB
MemAvailable:    1522372 kB
SwapTotal:        524284 kB
SwapFree:         523504 kB

@@swf end memory
@@swf begin disks
Filesystem     1024-blocks    Used Available Capacity Mounted on
tmpfs               201540    2000    199540       1% /run
/dev/vda1         15394840 4859820   9732496      34% /
tmpfs              1007696       0   1007696       0% /dev/shm
tmpfs                 5120       0      5120       0% /run/lock
tmpfs               201536      16    201520       1% /run/user/1000

@@swf end disks
@@swf begin time
epoch=1795285607
timezone=Etc/UTC
Timezone=Etc/UTC
NTPSynchronized=no

@@swf end time
@@swf begin systemd
state=degraded
failed: fwupd-refresh.service loaded failed failed Refresh fwupd metadata and update motd
failed: fwupd.service         loaded failed failed Firmware update daemon
failed: ifup-eth0.service     loaded failed failed ifup for eth0
failed: networking.service    loaded failed failed Raise network interfaces

@@swf end systemd
@@swf begin reboot
required=yes

@@swf end reboot
@@swf begin ports
LISTEN 0      4096         0.0.0.0:22        0.0.0.0:*    users:(("sshd",pid=28709,fd=3),("systemd",pid=1,fd=110)) 
LISTEN 0      511          0.0.0.0:80        0.0.0.0:*    users:(("nginx",pid=61727,fd=7),("nginx",pid=61726,fd=7))
LISTEN 0      511        127.0.0.1:8444      0.0.0.0:*    users:(("nginx",pid=61727,fd=6),("nginx",pid=61726,fd=6))
LISTEN 0      4096            [::]:22           [::]:*    users:(("sshd",pid=28709,fd=4),("systemd",pid=1,fd=112)) 

@@swf end ports
@@swf begin services
unit=ssh
LoadState=loaded
ActiveState=active
unit=sshd
LoadState=not-found
ActiveState=inactive
unit=docker
LoadState=loaded
ActiveState=active
unit=haproxy
LoadState=not-found
ActiveState=inactive
unit=nginx
LoadState=loaded
ActiveState=active
unit=fail2ban
LoadState=loaded
ActiveState=active
unit=ufw
LoadState=loaded
ActiveState=active

@@swf end services
@@swf begin versions
docker=Docker version 29.10.0, build fdd4b8e
nginx=nginx version: nginx/1.30.6
fail2ban=Fail2Ban v1.0.2

@@swf end versions
@@swf begin containers


@@swf end containers
@@swf begin ufw
Status: active

@@swf end ufw
@@swf begin sshd
port 22
permitrootlogin yes
passwordauthentication yes

@@swf end sshd
@@swf begin updates
manager=apt
upgradable=18

@@swf end updates
@@swf done
`;

/** Crafted: a Debian 12 node with haproxy, nginx, docker containers, a failed unit and ufw. */
export const DEBIAN_12_NODE = `@@swf script 1
@@swf begin user
uid=0

@@swf end user
@@swf begin os
PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"
NAME="Debian GNU/Linux"
VERSION_ID="12"
VERSION="12 (bookworm)"
VERSION_CODENAME=bookworm
ID=debian
HOME_URL="https://www.debian.org/"
SUPPORT_URL="https://www.debian.org/support"
BUG_REPORT_URL="https://bugs.debian.org/"

@@swf end os
@@swf begin kernel
name=Linux
release=6.1.0-28-amd64
arch=x86_64
hostname=node-2.example.com

@@swf end kernel
@@swf begin uptime
336137.81 332587.98

@@swf end uptime
@@swf begin loadavg
0.09 0.04 0.01 1/146 102953

@@swf end loadavg
@@swf begin cpu
cpus=1

@@swf end cpu
@@swf begin memory
MemTotal:        2015392 kB
MemAvailable:    1522372 kB
SwapTotal:        524284 kB
SwapFree:         523504 kB

@@swf end memory
@@swf begin disks
Filesystem     1024-blocks    Used Available Capacity Mounted on
tmpfs               201540    2000    199540       1% /run
/dev/vda1         15394840 4859820   9732496      34% /
tmpfs              1007696       0   1007696       0% /dev/shm
tmpfs                 5120       0      5120       0% /run/lock
tmpfs               201536      16    201520       1% /run/user/1000

@@swf end disks
@@swf begin time
epoch=1795285500
timezone=Etc/UTC
Timezone=Etc/UTC
NTPSynchronized=yes

@@swf end time
@@swf begin systemd
state=running

@@swf end systemd
@@swf begin reboot
required=no

@@swf end reboot
@@swf begin ports
LISTEN 0      4096         0.0.0.0:443       0.0.0.0:*    users:(("haproxy",pid=811,fd=7))
LISTEN 0      4096         0.0.0.0:22        0.0.0.0:*    users:(("sshd",pid=701,fd=3))
LISTEN 0      511        127.0.0.1:8444      0.0.0.0:*    users:(("nginx",pid=820,fd=6),("nginx",pid=819,fd=6))
LISTEN 0      4096       127.0.0.1:62050     0.0.0.0:*    users:(("docker-proxy",pid=950,fd=4))
LISTEN 0      4096            [::]:22           [::]:*    users:(("sshd",pid=701,fd=4))
LISTEN 0      4096   127.0.0.53%lo:53        0.0.0.0:*    users:(("systemd-resolve",pid=402,fd=14))

@@swf end ports
@@swf begin services
unit=ssh
LoadState=loaded
ActiveState=active
unit=sshd
LoadState=not-found
ActiveState=inactive
unit=docker
LoadState=loaded
ActiveState=active
unit=haproxy
LoadState=loaded
ActiveState=active
unit=nginx
LoadState=loaded
ActiveState=active
unit=fail2ban
LoadState=loaded
ActiveState=failed
unit=ufw
LoadState=loaded
ActiveState=active

@@swf end services
@@swf begin versions
docker=Docker version 27.3.1, build ce12230
haproxy=HAProxy version 2.6.12-1+deb12u1 2023/09/21 - https://haproxy.org/
nginx=nginx version: nginx/1.22.1
fail2ban=Fail2Ban v1.0.2

@@swf end versions
@@swf begin containers
remnanode|remnawave/node:3.4.6|running|Up 3 days
edge-proxy|registry.example.com:5000/team/proxy:1.2.3@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef|running|Up 2 hours (healthy)
old-job|alpine|exited|Exited (0) 5 weeks ago
untagged|sha256:0123456789ab|created|Created

@@swf end containers
@@swf begin ufw
Status: active

@@swf end ufw
@@swf begin sshd
port 22
permitrootlogin yes
passwordauthentication yes

@@swf end sshd
@@swf begin updates
manager=apt
upgradable=18

@@swf end updates
@@swf done
`;

/** Crafted: an Ubuntu 22.04 node, reboot pending, clock not synchronised. */
export const UBUNTU_2204_NODE = `@@swf script 1
@@swf begin user
uid=0

@@swf end user
@@swf begin os
PRETTY_NAME="Ubuntu 22.04.5 LTS"
NAME="Ubuntu"
VERSION_ID="22.04"
VERSION="22.04.5 LTS (Jammy Jellyfish)"
VERSION_CODENAME=jammy
ID=ubuntu
ID_LIKE=debian

@@swf end os
@@swf begin kernel
name=Linux
release=5.15.0-125-generic
arch=x86_64
hostname=node-3.example.com

@@swf end kernel
@@swf begin uptime
336137.81 332587.98

@@swf end uptime
@@swf begin loadavg
0.09 0.04 0.01 1/146 102953

@@swf end loadavg
@@swf begin cpu
cpus=1

@@swf end cpu
@@swf begin memory
MemTotal:        2015392 kB
MemAvailable:    1522372 kB
SwapTotal:        524284 kB
SwapFree:         523504 kB

@@swf end memory
@@swf begin disks
Filesystem     1024-blocks    Used Available Capacity Mounted on
tmpfs               201540    2000    199540       1% /run
/dev/vda1         15394840 4859820   9732496      34% /
tmpfs              1007696       0   1007696       0% /dev/shm
tmpfs                 5120       0      5120       0% /run/lock
tmpfs               201536      16    201520       1% /run/user/1000

@@swf end disks
@@swf begin time
epoch=1795285500
Timezone=Europe/Berlin
NTPSynchronized=no

@@swf end time
@@swf begin systemd
state=running

@@swf end systemd
@@swf begin reboot
required=yes

@@swf end reboot
@@swf begin ports
LISTEN 0      4096         0.0.0.0:443       0.0.0.0:*    users:(("haproxy",pid=811,fd=7))
LISTEN 0      4096         0.0.0.0:22        0.0.0.0:*    users:(("sshd",pid=701,fd=3))
LISTEN 0      511        127.0.0.1:8444      0.0.0.0:*    users:(("nginx",pid=820,fd=6),("nginx",pid=819,fd=6))
LISTEN 0      4096       127.0.0.1:62050     0.0.0.0:*    users:(("docker-proxy",pid=950,fd=4))
LISTEN 0      4096            [::]:22           [::]:*    users:(("sshd",pid=701,fd=4))
LISTEN 0      4096   127.0.0.53%lo:53        0.0.0.0:*    users:(("systemd-resolve",pid=402,fd=14))

@@swf end ports
@@swf begin services
unit=ssh
LoadState=loaded
ActiveState=active
unit=sshd
LoadState=not-found
ActiveState=inactive
unit=docker
LoadState=loaded
ActiveState=active
unit=haproxy
LoadState=loaded
ActiveState=active
unit=nginx
LoadState=loaded
ActiveState=active
unit=fail2ban
LoadState=loaded
ActiveState=failed
unit=ufw
LoadState=loaded
ActiveState=active

@@swf end services
@@swf begin versions
docker=Docker version 24.0.7, build afdd53b
nginx=nginx version: nginx/1.18.0 (Ubuntu)

@@swf end versions
@@swf begin containers
remnanode|remnawave/node:3.4.6|running|Up 3 days
edge-proxy|registry.example.com:5000/team/proxy:1.2.3@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef|running|Up 2 hours (healthy)
old-job|alpine|exited|Exited (0) 5 weeks ago
untagged|sha256:0123456789ab|created|Created

@@swf end containers
@@swf begin ufw
Status: active

@@swf end ufw
@@swf begin sshd
port 22
permitrootlogin yes
passwordauthentication yes

@@swf end sshd
@@swf begin updates
manager=apt
upgradable=18

@@swf end updates
@@swf done
`;

/** Crafted: a minimal Debian container: no systemd, no ss, no docker, no ufw, no sshd. */
export const MINIMAL_CONTAINER = `@@swf script 1
@@swf begin user
uid=0

@@swf end user
@@swf begin os
PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"
ID=debian
VERSION_ID="12"

@@swf end os
@@swf begin kernel
name=Linux
release=6.8.0-36-generic
arch=x86_64
hostname=3f2a9c1d7b44

@@swf end kernel
@@swf begin uptime
86400.50 80000.10

@@swf end uptime
@@swf begin loadavg
0.10 0.05 0.01 1/200 1234

@@swf end loadavg
@@swf begin cpu
cpus=2

@@swf end cpu
@@swf begin memory
MemTotal:        2015392 kB
MemAvailable:    1595180 kB
SwapTotal:             0 kB
SwapFree:              0 kB

@@swf end memory
@@swf begin disks
Filesystem     1024-blocks    Used Available Capacity Mounted on
overlay           15394840 4859732   9732584      34% /
tmpfs                65536       0     65536       0% /dev
/dev/vda1         15394840 4859732   9732584      34% /etc/hosts

@@swf end disks
@@swf begin time
epoch=1795285500

@@swf end time
@@swf begin systemd
!absent

@@swf end systemd
@@swf begin reboot
required=no

@@swf end reboot
@@swf begin ports
!absent

@@swf end ports
@@swf begin services
!absent

@@swf end services
@@swf begin versions

@@swf end versions
@@swf begin containers
!absent

@@swf end containers
@@swf begin ufw
!absent

@@swf end ufw
@@swf begin sshd
!absent

@@swf end sshd
@@swf begin updates
manager=apt
upgradable=0

@@swf end updates
@@swf done
`;

/** Crafted: a BusyBox system: several tools and files are missing from the output. */
export const ALPINE_BOX = `@@swf script 1
@@swf begin user
uid=0

@@swf end user
@@swf begin os
NAME="Alpine Linux"
ID=alpine
VERSION_ID=3.20.3
PRETTY_NAME="Alpine Linux v3.20"

@@swf end os
@@swf begin kernel
name=Linux
release=6.6.52-0-virt
arch=aarch64
hostname=alpine-box

@@swf end kernel
@@swf begin uptime
120.00 100.00

@@swf end uptime
@@swf begin cpu
cpus=1

@@swf end cpu
@@swf begin memory
MemTotal:         494956 kB
MemAvailable:     401112 kB

@@swf end memory
@@swf begin disks
Filesystem           1024-blocks    Used Available Capacity Mounted on
/dev/vda3               8191416  214000   7541000   3% /
/dev/vda1                100000    5000     95000   5% /boot

@@swf end disks
@@swf begin time
epoch=1795285500

@@swf end time
@@swf begin systemd
!absent

@@swf end systemd
@@swf begin ports
!absent

@@swf end ports
@@swf begin updates
!absent

@@swf end updates
@@swf done
`;
