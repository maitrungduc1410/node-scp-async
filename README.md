# node-scp

[![npm](https://img.shields.io/npm/v/node-scp)](https://www.npmjs.com/package/node-scp)
[![downloads](https://img.shields.io/npm/dw/node-scp)](https://www.npmjs.com/package/node-scp)
[![CI](https://github.com/maitrungduc1410/node-scp-async/actions/workflows/ci.yml/badge.svg)](https://github.com/maitrungduc1410/node-scp-async/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/node-scp)](LICENSE)

Copy files to and from any SSH server from Node.js, over SFTP or SCP.

Most libraries only speak SFTP. node-scp also speaks the real SCP protocol, so the same code
works on a cloud VM, a hardened SFTP only host, an OpenWrt router running Dropbear, or a switch
that only has `scp`. It picks the protocol for you.

```ts
import { connect } from 'node-scp';

await using client = await connect({ host: '192.168.1.1', username: 'root', password });
await client.upload('./build', '/tmp/build', { recursive: true });
```

- **Works where SFTP does not.** `protocol: 'auto'` uses SFTP when the server has it and SCP
  otherwise.
- **Fast.** Parallel SFTP transfers and `TCP_NODELAY`, which makes many small files up to 15
  times faster than other ssh2 based libraries ([numbers](#benchmarks)).
- **Safe.** Remote paths are shell quoted, file names from the server are checked against path
  traversal, and the CLI pins host keys.
- **Modern.** TypeScript, ESM and CommonJS, `AbortSignal`, `await using`, progress events,
  filters, and typed errors with stable codes.
- **Batteries.** A CLI (`npx node-scp`), a GitHub Action, and drop in layers for node-scp 0.x
  and `scp2`.

## Contents

- [Install](#install)
- [Usage](#usage)
  - [Connect, copy, close](#connect-copy-close)
  - [One shot helpers](#one-shot-helpers)
  - [Transfer options](#transfer-options)
  - [Files in memory](#files-in-memory)
  - [Remote filesystem](#remote-filesystem)
  - [Choosing the protocol](#choosing-the-protocol)
  - [Errors](#errors)
- [Command line](#command-line)
- [GitHub Action](#github-action)
- [Upgrading](#upgrading)
- [More reading](#more-reading)
- [Benchmarks](#benchmarks)
- [Contributing](#contributing)
- [License](#license)

## Install

```sh
npm install node-scp
```

Node.js 22 or newer is recommended. Node 20 still works but is past its end of life.

## Usage

### Connect, copy, close

```ts
import { readFileSync } from 'node:fs';
import { connect } from 'node-scp';

const client = await connect({
  host: 'example.com',
  username: 'deploy',
  privateKey: readFileSync('/home/me/.ssh/id_ed25519'),
});

try {
  await client.upload('./dist', '/var/www/app', { recursive: true });
  await client.download('/var/log/app.log', './logs/app.log');
  console.log(client.protocol); // 'sftp' or 'scp'
} finally {
  await client.close();
}
```

`await using client = await connect(...)` closes the connection automatically at the end of
the block. It needs Node 24+, or TypeScript 5.2+ which compiles it for older versions.

### One shot helpers

```ts
import { download, upload } from 'node-scp';

await upload('./dist', 'deploy@example.com:/var/www/app', { recursive: true, privateKey });
await download('root@192.168.1.1:/etc/config', './backup/config', { recursive: true, password });
```

### Transfer options

```ts
const controller = new AbortController();

const result = await client.upload('./site', '/srv/site', {
  recursive: true, // copy directories, like scp -r
  preserve: true, // keep times and full modes, like scp -p
  concurrency: 8, // files in parallel, SFTP only (default 4)
  filter: (path, entry) => !path.startsWith('node_modules') && !path.endsWith('.map'),
  onProgress: (p) => console.log(`${p.transferred}/${p.total} bytes, ${p.filesCompleted} files`),
  signal: controller.signal,
});
// result: { files: 42, directories: 7, bytes: 1048576 }
```

Destinations are exact paths: `upload('dist', '/srv/site')` makes `/srv/site` a copy of `dist`.
The remote parent (`/srv`) must exist. Local parent directories are created for downloads.

### Files in memory

Works over both protocols:

```ts
await client.writeFile('/etc/motd', 'Hello\n', { mode: 0o644 });
await client.writeFile('/tmp/big.bin', createReadStream('big.bin'), { size: 1_000_000 });
const config = await client.readFile('/etc/config/network');
```

Over SCP a stream needs `size` up front, otherwise it is buffered first. When `size` is given,
the stream must be exactly that long on both protocols.

### Remote filesystem

When the connection uses SFTP, `client.fs` has the usual operations. It is `undefined` over SCP.

```ts
if (client.fs) {
  await client.fs.mkdir('/srv/app/releases/42', { recursive: true });
  const entries = await client.fs.list('/srv/app/releases'); // [{ name, type, size, mtime, ... }]
  await client.fs.rename('/srv/app/current.tmp', '/srv/app/current');
  await client.fs.rm('/srv/app/releases/1', { recursive: true, force: true });
  await client.fs.exists('/srv/app/current'); // 'file' | 'directory' | 'symlink' | 'other' | false
}
```

`client.sftp` and `client.ssh` expose the underlying ssh2 objects for anything else.

### Choosing the protocol

| `protocol` | Behaviour |
| --- | --- |
| `'auto'` (default) | SFTP when the server offers it, otherwise SCP. |
| `'sftp'` | SFTP only. Fails with `ERR_SFTP_UNAVAILABLE` if the server has no SFTP. |
| `'scp'` | SCP only. Fails with `ERR_SCP_UNAVAILABLE` if the server cannot run `scp`. |

Other connection options: everything ssh2 accepts (`host`, `port`, `username`, `password`,
`privateKey`, `passphrase`, `agent`, `readyTimeout`, `keepaliveInterval`, `hostVerifier`, `sock`
for jump hosts, ...) plus:

| Option | Default | Meaning |
| --- | --- | --- |
| `remoteOs` | `'posix'` | `'win32'` for Windows OpenSSH servers: backslash paths, and quoting that is safe for `cmd.exe` and PowerShell. |
| `scpCommand` | `'scp'` | Remote SCP command, for example `/usr/bin/scp` when `scp` is not on the remote `PATH`. |
| `noDelay` | `true` | Disable Nagle's algorithm. Leave it on unless you have a reason. |
| `signal` | | Abort the connection attempt. |
| `beforeConnect` | | Gets the ssh2 client before connecting, to add `keyboard-interactive` or `banner` listeners. |

`readyTimeout` (default 20 s) also bounds how long the server may take to answer the SFTP or SCP
handshake.

### Errors

Every error is a `ScpError` with a stable `code`, the `path` involved, and the original error
as `cause`:

```ts
import { ErrorCode, isScpError } from 'node-scp';

try {
  await client.download('/missing', './x');
} catch (err) {
  if (isScpError(err, ErrorCode.NotFound)) console.log('no such file:', err.path);
  else throw err;
}
```

| Code | When |
| --- | --- |
| `ERR_AUTH_FAILED`, `ERR_CONNECTION_FAILED`, `ERR_TIMEOUT` | Connecting failed. |
| `ERR_SFTP_UNAVAILABLE`, `ERR_SCP_UNAVAILABLE` | The requested protocol is not offered. |
| `ERR_NOT_FOUND`, `ERR_PERMISSION_DENIED`, `ERR_NOT_A_DIRECTORY`, `ERR_IS_A_DIRECTORY`, `ERR_ALREADY_EXISTS` | Filesystem errors, same codes for both protocols. |
| `ERR_ABORTED` | The `signal` fired. |
| `ERR_CONNECTION_CLOSED`, `ERR_NOT_CONNECTED` | The connection went away. |
| `ERR_SCP_PROTOCOL` | The server broke the SCP protocol or sent an unsafe file name. |
| `ERR_INVALID_ARGUMENT`, `ERR_UNSUPPORTED`, `ERR_REMOTE`, `ERR_LOCAL` | Everything else. |

## Command line

```sh
npx node-scp -r ./dist deploy@example.com:/var/www/app
npx node-scp root@192.168.1.1:/etc/config/network ./backup/
npx node-scp -r --exclude node_modules --exclude '*.map' . deploy@host:/srv/app/
```

It works like `scp`: a trailing `/` or several sources copy into a directory. Passwords come
from `NODE_SCP_PASSWORD`, keys from `-i`, `NODE_SCP_PRIVATE_KEY` or ssh-agent. Pin the server
with `--fingerprint SHA256:...` (as printed by `ssh-keygen -lf`). Run `npx node-scp --help` for
every option.

## GitHub Action

```yaml
- uses: maitrungduc1410/node-scp-async@v1
  with:
    host: ${{ secrets.DEPLOY_HOST }}
    username: deploy
    private-key: ${{ secrets.DEPLOY_KEY }}
    fingerprint: ${{ secrets.DEPLOY_HOST_FINGERPRINT }}
    source: dist/
    target: /var/www/app
    exclude: '*.map'
```

See [docs/recipes/github-actions.md](docs/recipes/github-actions.md) for every input.

## Upgrading

- From node-scp 0.x: change the import to `node-scp/legacy` and everything keeps working, then
  move to the new API at your pace. See [docs/migration/from-0.x.md](docs/migration/from-0.x.md).
- From `scp2`: replace `require('scp2')` with `require('node-scp/scp2')`. See
  [docs/migration/from-scp2.md](docs/migration/from-scp2.md).

## More reading

- [SCP or SFTP in 2026?](docs/scp-vs-sftp.md) What changed with OpenSSH 9 and when each one wins.
- [OpenWrt and Dropbear](docs/recipes/openwrt-dropbear.md), [network devices](docs/recipes/network-devices.md)
- [How node-scp compares](docs/comparison.md) with ssh2-sftp-client and node-ssh
- [Architecture](ARCHITECTURE.md) and the [API reference](https://maitrungduc1410.github.io/node-scp-async/)

## Benchmarks

Uploads to OpenSSH on the same machine, Node 22, mean of several runs (`pnpm bench`):

| | node-scp SFTP | node-scp SCP | ssh2-sftp-client | node-ssh |
| --- | --- | --- | --- | --- |
| One 16 MiB file | 57 ms | 53 ms | 94 ms | 104 ms |
| 200 files of 4 KiB in 10 directories | 52 ms | 67 ms | 534 ms | 484 ms |

Most of the small file difference is `TCP_NODELAY`. Over a real network latency dominates, and
SFTP with parallel files pulls further ahead of SCP, which copies one file at a time.

## Contributing

```sh
pnpm install
pnpm test          # unit and end to end tests, needs sftp-server and scp installed locally
pnpm test:docker   # real OpenSSH and Dropbear servers through testcontainers
pnpm lint && pnpm typecheck
```

[AGENTS.md](AGENTS.md) describes the workflow and conventions, [ARCHITECTURE.md](ARCHITECTURE.md)
how the code fits together. Add a changeset (`pnpm changeset`) to pull requests that change
behaviour.

## License

[MIT](LICENSE)