---
description: "使用 node-scp 上传和下载文件与目录：精确的目标路径、过滤器、权限与时间、SFTP 并行复制以及单次调用的辅助函数。"
---

# 上传与下载

传输文件靠两个方法，二者互为镜像：

```ts
await client.upload(localPath, remotePath, options); // 本机 -> 服务器
await client.download(remotePath, localPath, options); // 服务器 -> 本机
```

两者都会原样复制单个文件。复制目录时加上 `recursive: true`，和 `scp -r` 一样：

```ts
await client.upload('./report.pdf', '/srv/reports/2026-09.pdf');
await client.upload('./dist', '/var/www/app', { recursive: true });
await client.download('/etc/nginx', './backup/nginx', { recursive: true });
```

两者都会返回本次复制的统计信息：

```ts
const result = await client.upload('./dist', '/var/www/app', { recursive: true });
// { files: 42, directories: 7, bytes: 1048576 }
```

## 文件最终放在哪里？ {#where-do-files-end-up}

你传入的目标就是副本的**精确路径**，而不是“要放进去的目录”。试试下面的选项，看看服务器上会发生什么：

<DestinationDemo />

简而言之：

- `upload('dist', '/var/www/app')` 会让 `/var/www/app` 的内容与 `dist` 相同。
- 远程的**父目录**（`/var/www`）必须已经存在。下载时会自动创建本地的父目录。
- 复制到已存在的目录时会合并：同名文件被替换，其他文件保留。
- [命令行和 GitHub Action](./cli#where-files-end-up) 遵循 `scp` 的规则：目标是已存在的目录或以 `/` 结尾时，表示“复制到它里面”。

::: tip 需要先创建远程目录？
使用 SFTP 时可以调用 [`client.fs.mkdir(path, { recursive: true })`](./remote-fs)。SCP 不支持文件系统操作，可以通过 [`client.ssh`](./remote-fs#run-commands) 执行 `mkdir -p`。
:::

## 选择要复制的内容 {#pick-what-to-copy}

`filter` 会对每个文件和目录调用一次。返回 `false` 表示跳过；跳过一个目录会跳过其中的所有内容。

```ts
await client.upload('./project', '/srv/project', {
  recursive: true,
  filter: (path, entry) => {
    if (entry.type === 'directory') return path !== 'node_modules' && !path.startsWith('.git');
    return !path.endsWith('.map') && entry.size < 50_000_000;
  },
});
```

- `path` 是相对于复制源的路径，始终使用 `/`，例如 `src/index.ts`。
- `entry` 包含 `type`、`size` 和 `mode`。符号链接会被跟随，既不是文件也不是目录的条目（socket、设备文件）会被跳过，所以 `type` 只会是 `'file'` 或 `'directory'`。

## 权限与时间 {#permissions-and-times}

| | 新文件 | 已存在的文件 | 修改时间 |
| --- | --- | --- | --- |
| 默认 | 源文件的权限位，再经过 umask 过滤 | 保持原有 mode | 设为当前时间 |
| `preserve: true` | 源文件的完整 mode，包括 setuid、setgid 和 sticky 位 | 改为源文件的 mode | 从源文件复制 |

`preserve` 的效果和 `scp -p` 相同。有些网络设备不接受它，对这类设备请不要开启。

## 加快复制速度 {#copy-faster}

使用 SFTP 复制目录时，会同时发送多个文件。`concurrency` 控制同时传输的数量：

```ts
await client.upload('./photos', '/srv/photos', { recursive: true, concurrency: 16 });
```

默认值 4 是比较均衡的选择。如果要通过慢速链路传输大量小文件，可以调高。SCP 总是逐个复制文件，所以这个选项在 SCP 下不起作用。

## 单次调用的辅助函数 {#one-call-helpers}

如果只复制一次、之后不再需要客户端，可以用 `upload()` 和 `download()`，它们会替你完成连接、复制和断开。远程端的写法与 `scp` 相同：

```ts
import { download, upload } from 'node-scp';

await upload('./dist', 'deploy@example.com:/var/www/app', { recursive: true, privateKey });
await download('root@192.168.1.1:/etc/config', './backup/config', { recursive: true, password });
```

选项对象同时接受连接选项和传输选项。支持的写法：

| 写法 | 含义 |
| --- | --- |
| `host:path` | 用户名取自选项中的 `username` |
| `user@host:path` | 用户名和主机 |
| `user@[2001:db8::1]:path` | 用方括号包裹的 IPv6 地址 |
| `host:` | 登录目录 |
| `scp://user@host:2222/var/www` | 自定义端口，这里的路径是 `/var/www` |
| `user@host:relative/path` | 相对于登录目录的路径 |
| `{ host, port, username, path }` | 对象形式，适合已经拿到各个部分的情况 |

如果要自己开发工具，可以用 [`parseTarget()` 和 `formatTarget()`](/api/functions/parseTarget) 在字符串和对象两种形式之间转换。`user@host:path` 这种写法没有端口的位置，所以 `formatTarget()` 会省略端口。

## 下一步 {#next}

- 显示进度并取消耗时的复制：[进度与取消](./progress)。
- 不经过磁盘直接发送生成的文件：[内存中的文件](./files-in-memory)。
