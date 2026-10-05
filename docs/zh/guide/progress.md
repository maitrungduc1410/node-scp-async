---
description: "用 onProgress 跟踪 node-scp 的传输进度，用 AbortSignal 取消或设置超时，并通过在线演示查看回调收到的数据。"
---

# 进度与取消

`upload()` 和 `download()` 接受一个 `onProgress` 回调和一个 `AbortSignal`。点击下方的 **开始**，看看你的回调会收到什么，然后在中途试试 `controller.abort()`。

<ProgressDemo />

## `onProgress` 会收到什么 {#what-onprogress-receives}

| 字段 | 含义 |
| --- | --- |
| `path` | 当前正在传输的文件，相对于复制源，使用 `/`。 |
| `fileTransferred` / `fileSize` | 该文件已传输的字节数，以及它的大小。 |
| `transferred` | 整个操作已传输的字节数。 |
| `total` | 整个操作的总字节数（如果事先知道）。 |
| `filesCompleted` | 已完成的文件数。 |
| `filesTotal` | 文件总数（如果事先知道）。 |

上传和 SFTP 下载可以事先知道 `total` 和 `filesTotal`。SCP 下载只有在服务器发来某个文件时才知道它的存在，所以这两个字段都是 `undefined`。编写进度显示时要考虑到这一点：

```ts
const onProgress = (p: TransferProgress) => {
  const done = `${(p.transferred / 1e6).toFixed(1)} MB`;
  const line = p.total ? `${done} of ${(p.total / 1e6).toFixed(1)} MB` : done;
  process.stdout.write(`\r${line}, ${p.filesCompleted} files, now ${p.path}`);
};

await client.download('/var/backups', './backups', { recursive: true, onProgress });
```

回调调用得非常频繁，每个文件都会调用很多次。请让它保持轻量，或者对界面渲染做节流。

## 取消传输 {#cancel-a-transfer}

传入 `AbortController` 的 `signal`，想停止时调用 `abort()` 即可：

```ts
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());

try {
  await client.upload('./media', '/srv/media', { recursive: true, signal: controller.signal });
} catch (err) {
  if (isScpError(err, ErrorCode.Aborted)) console.log('stopped by the user');
  else throw err;
}
```

Promise 会立即以 `ERR_ABORTED` 错误 reject。已经传到另一端的内容会保留：已完成的文件是完整的，正在写入的文件可能被截断。使用 SFTP 时，已经在传输中的文件会在后台继续传完。

## 设置时间限制 {#put-a-time-limit-on-it}

`AbortSignal.timeout()` 和 `AbortSignal.any()` 无需 controller 就能覆盖常见场景：

```ts
// 两分钟后放弃。
await client.upload('./dist', '/var/www/app', {
  recursive: true,
  signal: AbortSignal.timeout(120_000),
});

// 超时或用户取消，以先发生者为准。
const signal = AbortSignal.any([AbortSignal.timeout(120_000), controller.signal]);
```

`connect()`、`writeFile()` 和 `readFile()` 中的 signal 用法完全相同。
