---
description: "node-scp 通过 SFTP 提供的远程文件操作：exists、stat、list、mkdir、rm、rename 和 realpath，以及原始 SFTP 会话和通过 SSH 执行命令。"
---

# 远程文件系统

使用 SFTP 时，`client.fs` 提供了服务器上常用的文件操作。SCP 只能复制文件，所以在 SCP 下 `client.fs` 为 `undefined`。

```ts
if (!client.fs) throw new Error(`need SFTP, the server only offers ${client.protocol}`);

await client.fs.mkdir('/srv/app/releases/42', { recursive: true });
```

::: tip 确定服务器支持 SFTP？
用 `protocol: 'sftp'` 连接。这样如果服务器没有 SFTP，连接会立即以 `ERR_SFTP_UNAVAILABLE` 失败，而不是等到你用到 `client.fs` 时才出问题。
:::

## 可用的操作 {#the-operations}

| 方法 | 作用 | 返回 |
| --- | --- | --- |
| `exists(path)` | 检查 `path` 处是什么，会跟随符号链接；`'symlink'` 表示目标不存在的链接 | `'file'`、`'directory'`、`'symlink'`、`'other'` 或 `false` |
| `stat(path)` | 详细信息，会跟随符号链接 | `{ type, size, mode, uid, gid, atime, mtime }` |
| `lstat(path)` | 符号链接本身的详细信息 | 与 `stat` 相同 |
| `list(path)` | 目录中的条目，按名称排序，不含 `.` 和 `..`；不跟随符号链接 | `lstat` 结果加上 `name` 组成的数组 |
| `mkdir(path, { recursive, mode })` | 创建目录；`recursive` 的效果和 `mkdir -p` 一样 | 无 |
| `rm(path, { recursive, force })` | 删除文件、符号链接，或在 `recursive` 时删除整个目录树；`force` 会忽略不存在的路径 | 无 |
| `rename(from, to)` | 移动或重命名 | 无 |
| `realpath(path)` | 绝对路径，例如 `.` 会变成主目录 | 字符串 |

时间是 `Date` 对象，`mode` 存放权限位，例如 `0o755`。错误使用与传输相同的[错误码](./errors)，例如 `ERR_NOT_FOUND`。

## 示例 {#examples}

保留最新的五个版本，删除其余的：

```ts
const releases = (await client.fs.list('/srv/app/releases'))
  .filter((entry) => entry.type === 'directory')
  .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

for (const old of releases.slice(5)) {
  await client.fs.rm(`/srv/app/releases/${old.name}`, { recursive: true });
}
```

只在文件大小变化时上传：

```ts
import { statSync } from 'node:fs';

const remote = '/srv/data/catalog.json';
const local = statSync('./catalog.json');
const existing = (await client.fs.exists(remote)) && (await client.fs.stat(remote));
if (!existing || existing.size !== local.size) await client.upload('./catalog.json', remote);
```

## 其他操作：原始 SFTP 会话 {#everything-else-the-raw-sftp-session}

`client.sftp` 就是 node-scp 所使用的 [ssh2 SFTP 会话](https://github.com/mscdex/ssh2/blob/master/SFTP.md)。它以回调的形式提供协议的其余部分：`chmod`、`chown`、`utimes`、`symlink`、`readlink`、`appendFile` 等等。

```ts
import { promisify } from 'node:util';

const chmod = promisify(client.sftp!.chmod.bind(client.sftp!));
await chmod('/srv/app/bin/start.sh', 0o755);
```

## 执行命令 {#run-commands}

`client.ssh` 是底层的 [ssh2 客户端](https://github.com/mscdex/ssh2#client-methods)。两种协议下都可以使用它，所以你能在服务器上执行命令，例如在 SCP 下创建目录，或者在部署后重启服务：

```ts
import type { ScpClient } from 'node-scp';

function run(client: ScpClient, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    client.ssh.exec(command, (err, stream) => {
      if (err) return reject(err);
      let output = '';
      stream.on('data', (chunk: Buffer) => (output += chunk));
      stream.stderr.resume();
      stream.on('close', (code: number) =>
        code === 0 ? resolve(output) : reject(new Error(`'${command}' exited with ${code}`)),
      );
    });
  });
}

await run(client, 'mkdir -p /tmp/upload');
await run(client, 'sudo systemctl restart app');
```

::: warning 命令中的内容要转义
node-scp 会对它为 SCP 发送的路径做转义，但你自己拼接的命令会原样交给远程 shell。不要把未经转义的不可信输入放进命令中。
:::
