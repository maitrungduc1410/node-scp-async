---
description: "node-scp compared with ssh2-sftp-client, node-ssh and scp2: protocols, features, TypeScript support and benchmarks, and when each library is the better choice."
---

# How node-scp compares

There are good SSH file transfer libraries for Node.js. This page tries to be fair about when
each one is the better choice. Numbers were checked in September 2026.

| | node-scp 1.x | [ssh2-sftp-client](https://www.npmjs.com/package/ssh2-sftp-client) 12.x | [node-ssh](https://www.npmjs.com/package/node-ssh) 13.x | [scp2](https://www.npmjs.com/package/scp2) 0.5 |
| --- | --- | --- | --- | --- |
| Weekly downloads | about 25 thousand | about 3.1 million | about 450 thousand | about 13 thousand |
| Last release | 2026 | 2026 | 2025 | 2016, unmaintained |
| SFTP | yes | yes | yes | yes |
| SCP protocol (servers without SFTP) | yes | no | no | no, despite the name |
| Automatic SFTP / SCP choice | yes | no | no | no |
| Run remote commands | through `client.ssh` | no | yes, a main feature | no |
| Remote file operations | common ones in `client.fs`, the rest through `client.sftp` | the richest API | a few | mkdir only |
| Parallel directory transfers | yes | yes | yes | no |
| Progress, filter, `AbortSignal` | all three | progress and filter | progress per file, filter | events only |
| Error codes independent of protocol | yes | partly | no | no |
| TypeScript types | bundled | separate `@types` package | bundled | none |
| ES modules and CommonJS | both | CommonJS | CommonJS | CommonJS |
| CLI and GitHub Action | yes | no | no | no |

## Pick ssh2-sftp-client when

- you only talk to regular servers with SFTP,
- you need its broad SFTP surface (streams to remote files, `rcopy`, append, extended stat
  handling) and its years of production use,
- you want the most widely used option.

## Pick node-ssh when

- running commands is the main job and file copies are a side task,
- you want one object for `execCommand`, `putFiles` and `getDirectory`.

## Pick node-scp when

- some of your targets are routers, embedded devices, network gear or minimal systems where
  SFTP is missing,
- you copy many small files and care about speed (see below),
- you want protocol independent error codes, cancellation and progress for whole trees,
- you want the same tool as a library, a CLI and a GitHub Action,
- you are on `scp2` and need a maintained replacement.

## About the benchmark numbers

node-scp shows a large lead for many small files:

<BenchChart />

Most of it comes from one setting: node-scp turns on `TCP_NODELAY` for the SSH socket, while
the others leave Nagle's algorithm on. You can get much of the same improvement with the other
libraries by calling `setNoDelay(true)` on their underlying ssh2 client. For single large files
the libraries are close, since all of them use ssh2's pipelined `fastPut` / `fastGet` for SFTP.

The benchmarks are in `bench/transfer.bench.ts`. Before drawing conclusions for your setup, run
them against your own server by setting `NODE_SCP_BENCH_HOST`, `NODE_SCP_BENCH_PORT`,
`NODE_SCP_BENCH_USER` and `NODE_SCP_BENCH_PASSWORD`.
