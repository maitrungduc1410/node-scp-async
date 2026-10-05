---
description: "用 writeFile() 把字符串、Buffer 或流直接写入远程文件，用 readFile() 把远程文件读入内存，SFTP 和 SCP 均可使用。"
---

# 内存中的文件

并不是所有要发送的内容都存在磁盘上。`writeFile()` 和 `readFile()` 直接在内存和远程文件之间传输数据，SFTP 和 SCP 都支持。

```mermaid
flowchart LR
  A["字符串、Buffer<br/>或流"] -- "writeFile()" --> R[("远程文件")]
  R -- "readFile()" --> B["Buffer"]
```

## 写入远程文件 {#write-a-remote-file}

```ts
// 字符串或字节数据。
await client.writeFile('/etc/motd', 'Welcome to prod\n');
await client.writeFile('/srv/app/config.json', JSON.stringify(config, null, 2), { mode: 0o600 });

// 流，适合大到无法放进内存的数据。
import { createReadStream, statSync } from 'node:fs';

const file = './backup.tar.gz';
await client.writeFile('/srv/backups/latest.tar.gz', createReadStream(file), {
  size: statSync(file).size,
});
```

| 选项 | 默认值 | 含义 |
| --- | --- | --- |
| `mode` | `0o644` | 新建文件的权限。 |
| `size` | | 流的长度，单位为字节。 |
| `signal` | | 取消写入。 |

::: warning 通过 SCP 写入流时需要指定 size
SCP 协议要在发送数据之前声明文件大小。如果没有 `size`，node-scp 会先把整个流读入内存。指定了 `size` 时，无论使用哪种协议，流的长度都必须与之完全一致，否则写入会失败。
:::

## 读取远程文件 {#read-a-remote-file}

`readFile()` 返回一个包含全部内容的 `Buffer`：

```ts
const raw = await client.readFile('/srv/app/config.json');
const config = JSON.parse(raw.toString('utf8'));
```

对于大文件，请改用 [`download()`](./transfers) 保存到磁盘：它以流的方式传输，并且会报告进度。

## 示例：修改远程配置文件 {#example-edit-a-remote-config}

```ts
const path = '/etc/config/system';
const current = (await client.readFile(path)).toString();
const updated = current.replace(/option hostname '.*'/, "option hostname 'office-router'");
if (updated !== current) await client.writeFile(path, updated);
```
