---
description: "在 Node.js 中与任意 SSH 服务器互传文件：服务器支持 SFTP 就用 SFTP，不支持就用真正的 SCP 协议。提供库、命令行和 GitHub Action。"
layout: home

hero:
  name: node-scp
  text: 通过 SSH 复制文件，适用于任何服务器
  tagline: 服务器有 SFTP 就用 SFTP，没有就用真正的 SCP 协议。一套小巧的 API，覆盖云主机、OpenWrt 路由器和网络设备。
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/getting-started
    - theme: alt
      text: 什么是 node-scp？
      link: /zh/guide/
    - theme: alt
      text: API 参考
      link: /api/

features:
  - icon: 🔀
    title: 没有 SFTP 也能用
    details: "protocol: 'auto' 在服务器提供 SFTP 时使用 SFTP，否则回退到 SCP，Dropbear、路由器和交换机都能直接使用。"
    link: /zh/guide/protocols
    linkText: 如何选择协议
  - icon: ⚡
    title: 大量文件也很快
    details: SFTP 并行传输加上 TCP_NODELAY，复制由大量小文件组成的目录树时，比其他基于 ssh2 的库快最多 10 倍。
    link: /zh/comparison
    linkText: 查看数据
  - icon: 🛡️
    title: 默认安全
    details: 远程路径经过 shell 转义，服务器发来的文件名会做路径穿越检查，命令行工具支持固定主机密钥。
    link: /zh/guide/connecting#verify-the-host-key
    linkText: 验证服务器
  - icon: 🧭
    title: 现代化 API
    details: TypeScript、ESM 与 CommonJS、await using、AbortSignal、进度事件、过滤器，以及带稳定错误码的类型化错误。
    link: /zh/guide/transfers
    linkText: 上传与下载
  - icon: 🧰
    title: 命令行与 GitHub Action
    details: 同一套引擎，既可以通过 npx node-scp 使用，也可以作为工作流中的部署步骤，支持排除规则和固定主机密钥。
    link: /zh/guide/cli
    linkText: 命令行
  - icon: 🔁
    title: 轻松升级
    details: 为 node-scp 0.x 和已停止维护的 scp2 提供兼容层。只需改一行 import，其余部分按自己的节奏迁移。
    link: /zh/migration/from-0.x
    linkText: 升级指南
---

<div class="home-section vp-doc">

## 三行代码复制一个目录 {#copy-a-folder-in-three-lines}

::: code-group

```ts [库]
import { connect } from 'node-scp';

await using client = await connect({ host: 'example.com', username: 'deploy', privateKey });
await client.upload('./dist', '/var/www/app', { recursive: true });
```

```ts [单次调用]
import { upload } from 'node-scp';

await upload('./dist', 'deploy@example.com:/var/www/app', { recursive: true, privateKey });
```

```sh [命令行]
npx node-scp -r ./dist deploy@example.com:/var/www/app
```

```yaml [GitHub Action]
- uses: maitrungduc1410/node-scp-async@v1
  with:
    host: ${{ secrets.DEPLOY_HOST }}
    username: deploy
    private-key: ${{ secrets.DEPLOY_KEY }}
    source: dist/
    target: /var/www/app
```

:::

## 适配你手上的各种服务器 {#works-with-the-servers-you-actually-have}

选择一种服务器，看看 node-scp 会如何处理。

<!--@include: ./parts/server-picker.md-->

## 如何选择协议 {#how-it-picks-the-protocol}

```mermaid
flowchart LR
  A(["connect()"]) --> B{"protocol 选项"}
  B -- "'scp'" --> S["SCP<br/>通过 exec 通道运行 scp -t / scp -f"]
  B -- "'auto'（默认）或 'sftp'" --> C{"服务器<br/>提供 SFTP 吗？"}
  C -- 是 --> F["SFTP<br/>可以使用 client.fs"]
  C -- "否，且为 'auto'" --> S
  C -- "否，且为 'sftp'" --> E["ERR_SFTP_UNAVAILABLE"]
```

## 在关键场景下更快 {#fast-where-it-matters}

上传到同一台机器上的 OpenSSH，取多次运行的平均值。小文件场景下的差距主要来自 `TCP_NODELAY`，[对比页面](/zh/comparison)有详细解释。

<BenchChart />

</div>
