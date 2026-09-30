#!/bin/sh
set -eu

ssh-keygen -A >/dev/null

if [ -n "${AUTHORIZED_KEY:-}" ]; then
  printf '%s\n' "$AUTHORIZED_KEY" > /home/test/.ssh/authorized_keys
  chmod 600 /home/test/.ssh/authorized_keys
  chown test:test /home/test/.ssh/authorized_keys
fi

config=/etc/ssh/sshd_config.d/node-scp.conf
{
  echo 'PasswordAuthentication yes'
  echo 'KbdInteractiveAuthentication no'
  echo 'PermitRootLogin no'
  echo 'LogLevel INFO'
} > "$config"

case "$MODE" in
  full) ;;
  sftp-only)
    echo 'ForceCommand internal-sftp' >> "$config"
    ;;
  no-sftp)
    sed -i '/^Subsystem/d' /etc/ssh/sshd_config
    ;;
  *)
    echo "unknown MODE '$MODE', expected full, sftp-only or no-sftp" >&2
    exit 1
    ;;
esac

exec /usr/sbin/sshd -D -e
