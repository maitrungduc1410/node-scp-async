# Dropbear with scp and no SFTP server, the setup found on OpenWrt routers and many
# embedded Linux devices.
FROM alpine:3.24

RUN apk add --no-cache dropbear dropbear-scp \
  && adduser -D -s /bin/sh test \
  && echo 'test:test' | chpasswd \
  && mkdir -p /etc/dropbear

EXPOSE 22
# -R creates host keys on first start, -F stays in the foreground, -E logs to stderr.
CMD ["dropbear", "-R", "-F", "-E", "-p", "22"]
