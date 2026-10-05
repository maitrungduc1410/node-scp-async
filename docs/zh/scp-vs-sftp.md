---
description: "2026 年该用 SCP 还是 SFTP：两种协议的工作原理，OpenSSH 8 和 9 带来的变化，SCP 仍是唯一选择的场景，以及 node-scp 如何安全地处理两者。"
---

# 2026 年该用 SCP 还是 SFTP？

两者都运行在 SSH 之上，都能复制文件，而且从 OpenSSH 9 开始，连 `scp` 命令本身通常也在使用 SFTP。那么 node-scp 为什么还要实现旧的 SCP 协议？因为还有很多服务器没有跟上这个变化。

## 两个名字容易混淆的协议 {#two-protocols-with-confusing-names}

**SCP** 是两个通过管道对话的程序。客户端通过 SSH exec 通道在服务器上运行 `scp -t /dest`（to，接收）或 `scp -f /src`（from，发送），然后双方以流的方式传送简单的文本记录：`C0644 1234 name` 表示一个文件，`D0755 0 dir` 表示进入一个目录，`E` 表示离开目录，每条记录都以一个状态字节作为应答。它可以追溯到 20 世纪 80 年代 BSD 的 `rcp`。

**SFTP** 是一个真正的文件协议，是带有编号请求的 SSH 子系统：open、read、write、stat、readdir、rename、remove、symlink 等等。客户端可以同时发出多个请求、从某个偏移量继续传输、列出目录以及修改权限。

## OpenSSH 带来的变化 {#what-openssh-changed}

- **OpenSSH 8.0（2019 年）** 在一系列客户端漏洞之后，称 SCP 协议“过时、不灵活且不易修复”。其中最严重的是 [CVE-2019-6111](https://nvd.nist.gov/vuln/detail/CVE-2019-6111)：恶意服务器可以发送特制的文件名，使客户端覆盖任意文件。
- **OpenSSH 9.0（2022 年）** 让 `scp` 命令在底层改用 SFTP 协议。旧的协议仍然可以通过 `scp -O` 使用。
- 服务器端的 `scp -t` / `scp -f` 程序仍然随 OpenSSH 一起安装，因为旧客户端需要它。

所以在现代 Linux 机器上，你几乎从来不*需要* SCP。在那里，SFTP 是更好的协议。

## SCP 仍是唯一选择的场景 {#where-scp-is-still-the-only-option}

- **Dropbear** 是 OpenWrt 和无数嵌入式 Linux 设备使用的 SSH 服务器，它附带 `scp` 程序，但没有 SFTP 服务器。在 OpenWrt 上，你得自己安装 `openssh-sftp-server`，而很多设备根本没有足够的闪存空间，或者压根没有这个软件包。
- **网络设备。** 很多路由器、交换机、防火墙和专用设备只提供 SCP 来传输固件和配置文件，别无其他。
- **精简镜像和老旧系统**，从未配置过 SFTP 子系统。

反过来的情况也存在：设置了 `ForceCommand internal-sftp` 的加固型主机允许 SFTP，但拒绝运行 `scp`。

## 两者对比 {#how-they-compare}

| | SFTP | SCP |
| --- | --- | --- |
| 可用性 | 所有 OpenSSH 服务器默认提供，包括 Windows 上的 OpenSSH | 几乎所有 SSH 服务器，包括 Dropbear 和各种设备 |
| 大量小文件 | 快：请求以流水线方式发送，多个文件可以并行 | 逐个传输，每个文件需要两次往返 |
| 单个大文件 | 快 | 快，开销略小 |
| 高延迟链路 | 好得多 | 往返次数不断累积 |
| 列目录、重命名、删除、chmod | 支持 | 不支持，只能复制 |
| 断点续传、随机访问 | 支持 | 不支持 |
| 是否经过远程 shell | 否 | 是，路径会经过远程 shell |
| 对服务器的信任 | 每个路径都由客户端自己请求；列表返回的名称仍需检查 | 由服务器决定发送什么，所以客户端必须检查每一条记录 |

## node-scp 的做法 {#what-node-scp-does-about-it}

- `protocol: 'auto'`（默认值）会请求 SFTP，失败时回退到 SCP，所以你不需要知道对面是哪种服务器。
- SCP 实现把服务器视为不可信：收到的每个名称都必须是单个路径段，多余的顶层条目会被拒绝，除非你要求递归复制，否则目录也会被拒绝。发送给远程 shell 的路径都会经过转义。
- `TCP_NODELAY` 处于开启状态，这对两种协议都非常重要，因为它们都要等待很小的应答。

## 那么该用哪一个？ {#so-which-one-should-you-use}

让 node-scp 来选。如果你想强制使用某一种：

- 需要 `client.fs`（列目录、重命名、删除），或者要通过慢速链路复制大量文件时，用 `protocol: 'sftp'`。
- 服务器是确定没有 SFTP 的设备时，用 `protocol: 'scp'` 跳过探测。
