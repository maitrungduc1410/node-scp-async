---
description: "安装 node-scp，用私钥、ssh-agent 或密码连接，上传目录、下载文件，再用 await using 安全地关闭连接。"
---

# 快速开始

本页带你从一个空项目开始，几分钟内完成第一次上传。

## 1. 安装 {#_1-install}

::: code-group

```sh [npm]
npm install node-scp
```

```sh [pnpm]
pnpm add node-scp
```

```sh [yarn]
yarn add node-scp
```

```sh [bun]
bun add node-scp
```

:::

node-scp 自带 TypeScript 类型，`import` 和 `require` 都可以使用。

## 2. 连接并复制 {#_2-connect-and-copy}

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
  console.log(`copied over ${client.protocol}`); // 'sftp' 或 'scp'
} finally {
  await client.close();
}
```

这段代码做了以下几件事：

1. `connect()` 建立 SSH 连接、登录，并在 SFTP 和 SCP 之间做出选择。
2. `upload()` 复制本地的 `dist` 目录，使 `/var/www/app` 成为它的副本。复制目录需要 `recursive: true`，和 `scp -r` 一样。
3. `download()` 复制一个远程文件。缺失的本地目录（`./logs`）会自动创建。
4. `close()` 关闭连接。一定要关闭，否则进程不会退出。

::: tip 让语言帮你关闭连接
使用 `await using` 时，连接会在代码块结束时关闭，即使中途抛出异常也一样。这需要 Node 24 或更高版本，或者 TypeScript 5.2 或更高版本（TypeScript 会把它编译成旧版 Node 可运行的代码）。

```ts
await using client = await connect({ host, username, privateKey });
await client.upload('./dist', '/var/www/app', { recursive: true });
// 在这里关闭
```

:::

## 3. 按服务器要求的方式登录 {#_3-log-in-the-way-your-server-expects}

| 你有 | 传给 `connect()` |
| --- | --- |
| 私钥文件 | `privateKey: readFileSync(path)` |
| 带口令的私钥 | `privateKey` 和 `passphrase` |
| 正在运行的 ssh-agent | `agent: process.env.SSH_AUTH_SOCK` |
| 密码 | `password: process.env.SSH_PASSWORD` |

不要把密钥等敏感信息写在代码里：从文件、环境变量或密钥管理服务中读取。[连接](./connecting)一页介绍了 keyboard-interactive 登录、跳板机和主机密钥校验。

## 4. 或者不写代码 {#_4-or-skip-the-code}

同一套引擎也可以直接在终端中运行：

```sh
npx node-scp -r ./dist deploy@example.com:/var/www/app
```

参见[命令行](./cli)；在 CI 中可以使用 [GitHub Action](/zh/recipes/github-actions)。

## 接下来 {#where-to-go-next}

- [上传与下载](./transfers)：文件最终放在哪里、过滤器、权限、并行复制。
- [进度与取消](./progress)：进度条和 `AbortSignal`，附在线演示。
- [内存中的文件](./files-in-memory)：把字符串或流直接写入远程文件。
- [错误处理](./errors)：可用于分支判断的稳定错误码。
