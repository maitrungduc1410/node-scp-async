---
description: "Use node-scp with OpenWrt routers and Dropbear, which have no SFTP: back up /etc/config, push config files, upload a sysupgrade image and avoid common pitfalls."
---

# OpenWrt and Dropbear

OpenWrt routers run Dropbear as their SSH server. Dropbear can run `scp`, but it has no SFTP
server unless you install one, so most SFTP libraries fail with "Unable to start subsystem:
sftp". node-scp falls back to SCP automatically.

## Back up the configuration

```ts
import { download } from 'node-scp';

await download('root@192.168.1.1:/etc/config', `./backup/${Date.now()}`, {
  recursive: true,
  password: process.env.ROUTER_PASSWORD,
});
```

Or from the shell:

```sh
NODE_SCP_PASSWORD=secret npx node-scp -r root@192.168.1.1:/etc/config ./backup/
```

## Push a file and apply it

```ts
import { connect } from 'node-scp';

await using router = await connect({
  host: '192.168.1.1',
  username: 'root',
  password: process.env.ROUTER_PASSWORD,
});

await router.writeFile('/etc/config/wireless', wirelessConfig, { mode: 0o600 });

// Anything else goes through the ssh2 client.
router.ssh.exec('wifi reload', (err, stream) => {
  if (err) throw err;
  stream.resume();
});
```

## Upload a firmware image

Firmware files are large and `/tmp` is a RAM disk on OpenWrt, which is where `sysupgrade`
expects them:

```ts
await router.upload('./openwrt-sysupgrade.bin', '/tmp/sysupgrade.bin', {
  onProgress: (p) => process.stdout.write(`\r${Math.round((p.transferred / p.total!) * 100)}%`),
});
```

## Tips

- **Remote parents must exist.** A recursive upload creates the folders inside what you copy,
  but over SCP node-scp cannot create missing parents of the destination. Upload into
  directories that exist, or run `mkdir -p` first through `router.ssh.exec`.
- **Skip the SFTP probe** with `protocol: 'scp'` when you know the device. It saves one round
  trip and avoids a log line on the router.
- **Keys instead of passwords.** Put your public key in `/etc/dropbear/authorized_keys` on the
  router and pass `privateKey` to `connect`.
- **Want SFTP anyway?** Install `openssh-sftp-server` on the router (`opkg install
  openssh-sftp-server`, or `apk add openssh-sftp-server` on releases that use apk). node-scp will
  then pick SFTP on its own and `client.fs` becomes available.
- **Old Dropbear builds** may offer only old key exchange algorithms. Pass them through the
  ssh2 `algorithms` option if the handshake fails.
