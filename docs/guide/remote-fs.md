---
description: "Remote file operations in node-scp over SFTP: exists, stat, list, mkdir, rm, rename and realpath, plus the raw SFTP session and running commands over SSH."
---

# Remote filesystem

Over SFTP, `client.fs` gives you the everyday file operations on the server. SCP can only copy
files, so over SCP `client.fs` is `undefined`.

```ts
if (!client.fs) throw new Error(`need SFTP, the server only offers ${client.protocol}`);

await client.fs.mkdir('/srv/app/releases/42', { recursive: true });
```

::: tip Know the server has SFTP?
Connect with `protocol: 'sftp'`. The connection then fails early with `ERR_SFTP_UNAVAILABLE`
instead of later when you reach for `client.fs`.
:::

## The operations

| Method | Does | Resolves to |
| --- | --- | --- |
| `exists(path)` | Checks what is at `path`, following symlinks; `'symlink'` means a link whose target is missing | `'file'`, `'directory'`, `'symlink'`, `'other'` or `false` |
| `stat(path)` | Details, following symlinks | `{ type, size, mode, uid, gid, atime, mtime }` |
| `lstat(path)` | Details of a symlink itself | same as `stat` |
| `list(path)` | Directory entries, sorted by name, without `.` and `..`; symlinks are not followed | an array of `lstat` results plus `name` |
| `mkdir(path, { recursive, mode })` | Creates a directory; `recursive` works like `mkdir -p` | nothing |
| `rm(path, { recursive, force })` | Deletes a file, a symlink or, with `recursive`, a directory tree; `force` ignores missing paths | nothing |
| `rename(from, to)` | Moves or renames | nothing |
| `realpath(path)` | The absolute path, for example `.` becomes the home directory | a string |

Times are `Date` objects and `mode` holds the permission bits, for example `0o755`. Errors use the
same [codes](./errors) as transfers, such as `ERR_NOT_FOUND`.

## Examples

Keep the five newest releases and delete the rest:

```ts
const releases = (await client.fs.list('/srv/app/releases'))
  .filter((entry) => entry.type === 'directory')
  .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

for (const old of releases.slice(5)) {
  await client.fs.rm(`/srv/app/releases/${old.name}`, { recursive: true });
}
```

Upload only when the file changed size:

```ts
import { statSync } from 'node:fs';

const remote = '/srv/data/catalog.json';
const local = statSync('./catalog.json');
const existing = (await client.fs.exists(remote)) && (await client.fs.stat(remote));
if (!existing || existing.size !== local.size) await client.upload('./catalog.json', remote);
```

## Everything else: the raw SFTP session

`client.sftp` is the [ssh2 SFTP session](https://github.com/mscdex/ssh2/blob/master/SFTP.md) that
node-scp uses. It has the rest of the protocol with callbacks: `chmod`, `chown`, `utimes`,
`symlink`, `readlink`, `appendFile` and more.

```ts
import { promisify } from 'node:util';

const chmod = promisify(client.sftp!.chmod.bind(client.sftp!));
await chmod('/srv/app/bin/start.sh', 0o755);
```

## Run commands

`client.ssh` is the underlying [ssh2 client](https://github.com/mscdex/ssh2#client-methods). It is
there over both protocols, so you can run commands on the server, for example to create folders
over SCP or to restart a service after a deploy:

```ts
import type { ScpClient } from 'node-scp';

function run(client: ScpClient, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    client.ssh.exec(command, (err, stream) => {
      if (err) return reject(err);
      let output = '';
      stream.on('data', (chunk: Buffer) => (output += chunk));
      stream.stderr.resume();
      stream.on('close', (code: number) =>
        code === 0 ? resolve(output) : reject(new Error(`'${command}' exited with ${code}`)),
      );
    });
  });
}

await run(client, 'mkdir -p /tmp/upload');
await run(client, 'sudo systemctl restart app');
```

::: warning Quote what you put in a command
node-scp quotes the paths it sends for SCP, but a command you build yourself goes to the remote
shell as is. Never put untrusted input into it without quoting.
:::
