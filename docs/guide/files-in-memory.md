---
description: "Write a string, Buffer or stream straight to a remote file and read remote files into memory with writeFile() and readFile(), over SFTP and SCP alike."
---

# Files in memory

Not everything you send lives on disk. `writeFile()` and `readFile()` move data straight between
memory and a remote file, over SFTP and SCP alike.

```mermaid
flowchart LR
  A["string, Buffer<br/>or stream"] -- "writeFile()" --> R[("remote file")]
  R -- "readFile()" --> B["Buffer"]
```

## Write a remote file

```ts
// A string or bytes.
await client.writeFile('/etc/motd', 'Welcome to prod\n');
await client.writeFile('/srv/app/config.json', JSON.stringify(config, null, 2), { mode: 0o600 });

// A stream, for data too large to hold in memory.
import { createReadStream, statSync } from 'node:fs';

const file = './backup.tar.gz';
await client.writeFile('/srv/backups/latest.tar.gz', createReadStream(file), {
  size: statSync(file).size,
});
```

| Option | Default | Meaning |
| --- | --- | --- |
| `mode` | `0o644` | Permissions for a newly created file. |
| `size` | | Length of a stream in bytes. |
| `signal` | | Cancels the write. |

::: warning Streams over SCP need a size
The SCP protocol announces the file size before the data. Without `size`, node-scp reads the
whole stream into memory first. When `size` is given, the stream must be exactly that long, on
both protocols, otherwise the write fails.
:::

## Read a remote file

`readFile()` returns a `Buffer` with the whole content:

```ts
const raw = await client.readFile('/srv/app/config.json');
const config = JSON.parse(raw.toString('utf8'));
```

For large files, [`download()`](./transfers) to disk instead: it streams and reports progress.

## Example: edit a remote config

```ts
const path = '/etc/config/system';
const current = (await client.readFile(path)).toString();
const updated = current.replace(/option hostname '.*'/, "option hostname 'office-router'");
if (updated !== current) await client.writeFile(path, updated);
```
