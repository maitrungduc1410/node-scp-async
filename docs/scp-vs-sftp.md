---
description: "SCP or SFTP in 2026: how both protocols work, what OpenSSH 8 and 9 changed, where SCP is still the only option, and how node-scp handles both safely."
---

# SCP or SFTP in 2026?

Both run over SSH, both copy files, and since OpenSSH 9 even the `scp` command usually speaks
SFTP. So why does node-scp still implement the old SCP protocol? Because a lot of servers never
got the memo.

## Two protocols with confusing names

**SCP** is two programs talking through a pipe. The client runs `scp -t /dest` (to) or
`scp -f /src` (from) on the server over an SSH exec channel, and both sides stream simple text
records: `C0644 1234 name` for a file, `D0755 0 dir` to enter a directory, `E` to leave it,
each answered with a single status byte. It dates back to BSD `rcp` in the 1980s.

**SFTP** is a real file protocol, an SSH subsystem with numbered requests: open, read, write,
stat, readdir, rename, remove, symlink, and so on. The client can have many requests in flight,
resume at an offset, list directories and change permissions.

## What OpenSSH changed

- **OpenSSH 8.0 (2019)** called the SCP protocol "outdated, inflexible and not readily fixed"
  after a series of client side bugs, the worst being
  [CVE-2019-6111](https://nvd.nist.gov/vuln/detail/CVE-2019-6111): a malicious server could send
  file names that made the client overwrite arbitrary files.
- **OpenSSH 9.0 (2022)** switched the `scp` command to use the SFTP protocol under the hood. The
  old wire protocol is still available with `scp -O`.
- The server side `scp -t` / `scp -f` program is still installed with OpenSSH, because old
  clients need it.

So on a modern Linux box you almost never *need* SCP. SFTP is the better protocol there.

## Where SCP is still the only option

- **Dropbear**, the SSH server of OpenWrt and countless embedded Linux devices, ships an `scp`
  binary but no SFTP server. On OpenWrt you have to install `openssh-sftp-server` yourself, and
  many devices do not have the flash space or the package at all.
- **Network equipment.** Plenty of routers, switches, firewalls and appliances expose SCP for
  firmware and configuration files and nothing else.
- **Minimal images and old systems** where the SFTP subsystem was never configured.

The reverse also exists: hardened hosting that sets `ForceCommand internal-sftp` allows SFTP and
refuses to run `scp`.

## How they compare

| | SFTP | SCP |
| --- | --- | --- |
| Availability | Every OpenSSH server by default, Windows OpenSSH | Nearly every SSH server, including Dropbear and devices |
| Many small files | Fast: requests are pipelined and files can go in parallel | One file at a time, two round trips per file |
| One big file | Fast | Fast, slightly less overhead |
| High latency links | Much better | Round trips add up |
| Listing, rename, delete, chmod | Yes | No, only copying |
| Resume, random access | Yes | No |
| Remote shell involved | No | Yes, the path goes through the remote shell |
| Trust in the server | The client requests each path itself; names from listings still need a check | The server decides what it sends, so the client must check every record |

## What node-scp does about it

- `protocol: 'auto'` (the default) asks for SFTP and falls back to SCP, so you do not have to
  know which kind of server you are talking to.
- The SCP implementation treats the server as untrusted: every received name must be a single
  path segment, extra top level entries are refused, and directories are refused unless you
  asked for a recursive copy. Paths sent to the remote shell are quoted.
- `TCP_NODELAY` is on, which matters a lot for both protocols because each waits for small
  replies.

## So which one should you use?

Let node-scp pick. If you want to force one:

- `protocol: 'sftp'` when you need `client.fs` (listing, rename, delete) or you copy many files
  over a slow link.
- `protocol: 'scp'` when the server is a device you know has no SFTP, to skip the probe.
