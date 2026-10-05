---
description: "node-scp 与 ssh2-sftp-client、node-ssh 和 scp2 的对比：协议、功能、TypeScript 支持和基准测试，以及各个库分别适合什么场景。"
---

# 与同类库对比

Node.js 有不少优秀的 SSH 文件传输库。本页尽量客观地说明每个库在什么情况下是更好的选择。数据核对于 2026 年 9 月。

| | node-scp 1.x | [ssh2-sftp-client](https://www.npmjs.com/package/ssh2-sftp-client) 12.x | [node-ssh](https://www.npmjs.com/package/node-ssh) 13.x | [scp2](https://www.npmjs.com/package/scp2) 0.5 |
| --- | --- | --- | --- | --- |
| 每周下载量 | 约 2.5 万 | 约 310 万 | 约 45 万 | 约 1.3 万 |
| 最近发布 | 2026 | 2026 | 2025 | 2016，已停止维护 |
| SFTP | 支持 | 支持 | 支持 | 支持 |
| SCP 协议（没有 SFTP 的服务器） | 支持 | 不支持 | 不支持 | 不支持，尽管名字叫 scp2 |
| 自动选择 SFTP / SCP | 支持 | 不支持 | 不支持 | 不支持 |
| 执行远程命令 | 通过 `client.ssh` | 不支持 | 支持，是主要功能 | 不支持 |
| 远程文件操作 | 常用操作在 `client.fs` 中，其余通过 `client.sftp` | API 最丰富 | 少量 | 只有 mkdir |
| 并行传输目录 | 支持 | 支持 | 支持 | 不支持 |
| 进度、过滤器、`AbortSignal` | 三者都有 | 进度和过滤器 | 按文件的进度、过滤器 | 只有事件 |
| 与协议无关的错误码 | 支持 | 部分支持 | 不支持 | 不支持 |
| TypeScript 类型 | 自带 | 单独的 `@types` 包 | 自带 | 无 |
| ES 模块与 CommonJS | 两者都支持 | CommonJS | CommonJS | CommonJS |
| 命令行与 GitHub Action | 支持 | 不支持 | 不支持 | 不支持 |

## 以下情况选 ssh2-sftp-client {#pick-ssh2-sftp-client-when}

- 你只和支持 SFTP 的普通服务器打交道；
- 你需要它覆盖面很广的 SFTP 功能（远程文件流、`rcopy`、追加写入、扩展的 stat 处理），并看重它多年的生产环境使用经验；
- 你想要使用最广泛的选择。

## 以下情况选 node-ssh {#pick-node-ssh-when}

- 执行命令是主要工作，复制文件只是附带任务；
- 你希望用一个对象完成 `execCommand`、`putFiles` 和 `getDirectory`。

## 以下情况选 node-scp {#pick-node-scp-when}

- 你的部分目标是路由器、嵌入式设备、网络设备或精简系统，上面没有 SFTP；
- 你要复制大量小文件，并且在意速度（见下文）；
- 你想要与协议无关的错误码、取消功能和整个目录树的进度；
- 你希望同一个工具既能作为库，也能作为命令行和 GitHub Action 使用；
- 你正在使用 `scp2`，需要一个有人维护的替代品。

## 关于基准测试数据 {#about-the-benchmark-numbers}

在大量小文件的场景下，node-scp 领先很多：

<BenchChart />

领先的主要原因是一项设置：node-scp 为 SSH socket 开启了 `TCP_NODELAY`，而其他库保留了 Nagle 算法。在其他库中，对底层 ssh2 客户端调用 `setNoDelay(true)`，也能获得大部分同样的提升。对于单个大文件，各个库的表现很接近，因为它们在 SFTP 下都使用 ssh2 的流水线式 `fastPut` / `fastGet`。

基准测试位于 `bench/transfer.bench.ts`。在针对你自己的环境下结论之前，请设置 `NODE_SCP_BENCH_HOST`、`NODE_SCP_BENCH_PORT`、`NODE_SCP_BENCH_USER` 和 `NODE_SCP_BENCH_PASSWORD`，在你自己的服务器上运行它们。
