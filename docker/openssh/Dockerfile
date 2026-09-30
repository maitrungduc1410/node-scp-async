# OpenSSH test server. MODE picks what the server offers:
#   full       SFTP and SCP (a normal Linux server)
#   sftp-only  ForceCommand internal-sftp, SCP is refused (hardened hosting)
#   no-sftp    no SFTP subsystem, SCP only (old or minimal systems)
FROM debian:stable-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssh-server openssh-client \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /run/sshd \
  && useradd -m -s /bin/sh test \
  && echo 'test:test' | chpasswd \
  && mkdir -p /home/test/.ssh \
  && chmod 700 /home/test/.ssh \
  && chown -R test:test /home/test/.ssh

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV MODE=full
EXPOSE 22
ENTRYPOINT ["/entrypoint.sh"]
