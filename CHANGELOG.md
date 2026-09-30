# Changelog

All notable changes to this project are documented here. From 1.0.0 on, entries are generated
from [changesets](https://github.com/changesets/changesets).

## 1.0.0

A rewrite. The 0.x API is still available from `node-scp/legacy`; see
[docs/migration/from-0.x.md](docs/migration/from-0.x.md).

### Breaking changes

- New API: `connect()` returns a client with `upload`, `download`, `writeFile`, `readFile` and
  `fs`. The 0.x `Client` moved to `node-scp/legacy`.
- Every error is a `ScpError` with a stable `code` and the original error as `cause`.
- Destinations are exact paths, and remote parent directories must exist.
- Node.js 20 or newer is required.

### Features

- Real SCP protocol support for servers without SFTP, such as Dropbear, OpenWrt and network
  devices. `protocol: 'auto'` (the default) prefers SFTP and falls back to SCP.
- Transfer options for both protocols: `recursive`, `concurrency`, `filter`, `preserve`,
  `onProgress` and `signal`.
- `writeFile` and `readFile` for buffers and streams. A stream with `size` must match it
  exactly, otherwise the write fails with `ERR_INVALID_ARGUMENT`.
- `await using` support through `Symbol.asyncDispose`.
- One shot `upload()` and `download()` helpers that take `user@host:path`.
- `TCP_NODELAY` by default, which makes many small transfers an order of magnitude faster.
- `node-scp/scp2`, a drop in replacement for the unmaintained `scp2` package.
- A `node-scp` command line tool and a GitHub Action.
- ES modules and CommonJS builds with bundled types, published with npm provenance.
- ssh2 updated to ^1.17.0.

### Fixes

- Names received from the server, in SCP records and SFTP directory listings, are validated,
  so a malicious server cannot write outside the destination.
- New copies get the source permission bits over both protocols, like `scp` and `sftp`.
  setuid, setgid and sticky bits only travel with `preserve`.
- Connection errors after `ready` no longer crash the process when nobody listens for `error`.
- The `greeting` event is no longer emitted as `banner`.

## 0.0.25 (2025-04-27)

- `mkdir` accepts `{ recursive: true }`.
- Event listeners are removed when the connection closes.
- ssh2 updated to ^1.16.0.

0.0.24 was never published.

## 0.0.23 (2023-08-05)

- New `events` option to listen for ssh2 client events.

### [0.0.22](https://github.com/maitrungduc1410/node-scp-async/compare/v0.0.21...v0.0.22) (2022-11-19)


### Fixes

* error during close connection

### [0.0.21](https://github.com/maitrungduc1410/node-scp-async/compare/v0.0.20...v0.0.21) (2022-09-20)


### Features

* add more operations ([0aaade9](https://github.com/maitrungduc1410/node-scp-async/commit/0aaade9530b569b29df957782ddd296953c8af64))

### [0.0.20](https://github.com/maitrungduc1410/node-scp-async/compare/v0.0.18...v0.0.20) (2022-09-20)

### [0.0.18](https://github.com/maitrungduc1410/node-scp-async/compare/v0.0.16...v0.0.18) (2022-07-09)


### Features

* add support for passing options to uploadFile, downloadFile and mkdir ([3769ece](https://github.com/maitrungduc1410/node-scp-async/commit/3769ece84dcdb8830e9b18e3ec84a0fa4e10e903))

### [0.0.17](https://github.com/maitrungduc1410/node-scp-async/compare/v0.0.16...v0.0.17) (2021-11-08)


### Features

* allow passing options to `uploadFile`, `downloadFile` and `mkdir`

### [0.0.16](https://github.com/maitrungduc1410/node-scp-async/compare/v0.0.15...v0.0.16) (2021-11-08)


### Features

* allow passing all options from ssh2 ([758607e](https://github.com/maitrungduc1410/node-scp-async/commit/758607e7159ab802d2c0c467796857dc85250ad9))

### 0.0.15 (2021-07-08)


### Features

* add download for remote dir ([e9ea319](https://github.com/maitrungduc1410/node-scp-async/commit/e9ea319cbe09b1202baa684e5077c01bac32d284))
* add support for readyTimeout and keepalive ([0fc1742](https://github.com/maitrungduc1410/node-scp-async/commit/0fc1742819776cbae6ae6623cdce4b6e2de21cb5))


### Bug Fixes

* use export default instead of module exports ([0bfbc8c](https://github.com/maitrungduc1410/node-scp-async/commit/0bfbc8c87088c9184b6c485231ea6fb7a585484e))

# [0.0.7](#) (2020-09-18)
### Features
- Add authentication using `privateKey`
- Add `forceIPv4` and `forceIPv6` when connecting to remote server