---
description: "Upload and download files and folders with node-scp: exact destinations, filters, permissions and times, parallel SFTP copies and the one call helpers."
---

# Upload and download

Two methods move files, and they mirror each other:

```ts
await client.upload(localPath, remotePath, options); // your machine -> server
await client.download(remotePath, localPath, options); // server -> your machine
```

Both copy a single file as is. For folders, add `recursive: true`, like `scp -r`:

```ts
await client.upload('./report.pdf', '/srv/reports/2026-09.pdf');
await client.upload('./dist', '/var/www/app', { recursive: true });
await client.download('/etc/nginx', './backup/nginx', { recursive: true });
```

Both resolve to a summary of what was copied:

```ts
const result = await client.upload('./dist', '/var/www/app', { recursive: true });
// { files: 42, directories: 7, bytes: 1048576 }
```

## Where do files end up?

The destination you pass is **the exact path** of the copy, never "a folder to put it in". Try
the options below to see what happens on the server:

<DestinationDemo />

In short:

- `upload('dist', '/var/www/app')` makes `/var/www/app` hold what `dist` holds.
- The remote **parent** (`/var/www`) must already exist. Local parents are created for downloads.
- Copying into an existing folder merges: files with the same name are replaced, other files stay.
- The [CLI and the GitHub Action](./cli#where-files-end-up) follow `scp` rules instead, where an
  existing folder or a trailing `/` means "copy into it".

::: tip Need to create the remote folder first?
Over SFTP use [`client.fs.mkdir(path, { recursive: true })`](./remote-fs). Over SCP there are no
filesystem operations; run `mkdir -p` through [`client.ssh`](./remote-fs#run-commands).
:::

## Pick what to copy

`filter` is called for every file and folder. Return `false` to skip it; skipping a folder skips
everything inside.

```ts
await client.upload('./project', '/srv/project', {
  recursive: true,
  filter: (path, entry) => {
    if (entry.type === 'directory') return path !== 'node_modules' && !path.startsWith('.git');
    return !path.endsWith('.map') && entry.size < 50_000_000;
  },
});
```

- `path` is relative to what you copy and always uses `/`, for example `src/index.ts`.
- `entry` has `type`, `size` and `mode`. Symlinks are followed and entries that are neither files
  nor directories (sockets, devices) are skipped, so `type` is always `'file'` or `'directory'`.

## Permissions and times

| | New files | Existing files | Modification times |
| --- | --- | --- | --- |
| default | permission bits of the source, reduced by the umask | keep their mode | set to now |
| `preserve: true` | full mode of the source, including setuid, setgid and sticky | get the source mode | copied from the source |

`preserve` works like `scp -p`. Some network devices reject it; leave it off for those.

## Copy faster

Over SFTP, directory copies send several files at once. `concurrency` sets how many:

```ts
await client.upload('./photos', '/srv/photos', { recursive: true, concurrency: 16 });
```

The default of 4 is a good balance. Raise it for many small files over a slow link. SCP always
copies one file at a time, so the option has no effect there.

## One call helpers

When you copy once and do not need the client afterwards, `upload()` and `download()` connect,
copy and disconnect for you. The remote side is written like in `scp`:

```ts
import { download, upload } from 'node-scp';

await upload('./dist', 'deploy@example.com:/var/www/app', { recursive: true, privateKey });
await download('root@192.168.1.1:/etc/config', './backup/config', { recursive: true, password });
```

The options object takes connection options and transfer options together. Accepted forms:

| Written as | Means |
| --- | --- |
| `host:path` | user from `username` in the options |
| `user@host:path` | user and host |
| `user@[2001:db8::1]:path` | IPv6 address in brackets |
| `host:` | the login directory |
| `scp://user@host:2222/var/www` | a custom port, here with the path `/var/www` |
| `user@host:relative/path` | a path relative to the login directory |
| `{ host, port, username, path }` | an object, when you already have the parts |

[`parseTarget()` and `formatTarget()`](/api/node-scp/functions/parseTarget) convert between the
string and the object form if you build your own tooling. The `user@host:path` form has no place
for a port, so `formatTarget()` leaves it out.

## Next

- Show progress and cancel long copies: [Progress and cancelling](./progress).
- Send a generated file without touching the disk: [Files in memory](./files-in-memory).
