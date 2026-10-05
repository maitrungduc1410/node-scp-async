---
description: "Copy firmware and configuration files to routers, switches and appliances that only offer SCP, with tips on vendor quirks, legacy algorithms and common errors."
---

# Routers, switches and appliances

Many network devices accept SSH logins but implement only a small SCP server for moving
firmware and configuration files. There is no SFTP, often no shell, and sometimes paths look
like `flash:image.bin` instead of Unix paths.

## Connect with SCP directly

Skip the SFTP probe, and give the device time to answer:

```ts
import { connect } from 'node-scp';

await using device = await connect({
  host: '10.0.0.10',
  username: 'admin',
  password: process.env.DEVICE_PASSWORD,
  protocol: 'scp',
  readyTimeout: 30_000,
});

await device.upload('./firmware.bin', 'flash:firmware.bin');
await device.download('config.txt', './backup/config.txt');
```

The part after the host is passed to the device as is, so device specific names such as
`flash:firmware.bin` or `bootflash:` work when the device understands them. Paths with only
letters, digits and `_@%+=:,./-` are sent without quotes, which is what devices without a shell
expect.

## Things that differ between vendors

- **Enable the SCP server first.** Many devices ship with it off. Cisco IOS, for example, needs
  `ip scp server enable`.
- **Directory copies** (`recursive: true`) are often not supported. Copy files one by one.
- **Preserving times** (`preserve: true`) sends extra `T` records that some devices reject.
  Leave it off.
- **Legacy algorithms.** Older devices only offer old ciphers or key exchanges. Enable them
  explicitly through the ssh2 `algorithms` option, for example:

  ```ts
  await connect({
    host: '10.0.0.10',
    username: 'admin',
    password,
    protocol: 'scp',
    algorithms: { kex: { append: ['diffie-hellman-group14-sha1'] } },
  });
  ```

- **Keyboard interactive logins.** Some devices ask for the password through
  keyboard-interactive. Set `tryKeyboard: true` and answer in `beforeConnect`:

  ```ts
  await connect({
    host,
    username,
    tryKeyboard: true,
    protocol: 'scp',
    beforeConnect: (ssh) =>
      ssh.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) =>
        finish(prompts.map(() => password)),
      ),
  });
  ```

## When something fails

| Error | Usual cause |
| --- | --- |
| `ERR_SCP_UNAVAILABLE` | The SCP server is disabled, or the device only allows SFTP. |
| `ERR_SCP_PROTOCOL` | The device answered in an unexpected way. Try without `recursive` and `preserve`. |
| `ERR_PERMISSION_DENIED` | The account lacks the privilege level for file transfers. |
| `ERR_TIMEOUT` | The device is slow to accept the login; raise `readyTimeout`. |

If a device of yours needs something else, please open an issue with the device model and the
error message.
