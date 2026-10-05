---
description: "Ghi thẳng chuỗi, Buffer hoặc stream vào tệp trên máy chủ và đọc tệp từ máy chủ vào bộ nhớ bằng writeFile() và readFile(), dùng được cả qua SFTP lẫn SCP."
---

# Tệp trong bộ nhớ

Không phải thứ gì bạn gửi đi cũng nằm sẵn trên đĩa. `writeFile()` và `readFile()` truyền dữ liệu
thẳng giữa bộ nhớ và một tệp trên máy chủ, qua SFTP hay SCP đều được.

```mermaid
flowchart LR
  A["chuỗi, Buffer<br/>hoặc stream"] -- "writeFile()" --> R[("tệp trên máy chủ")]
  R -- "readFile()" --> B["Buffer"]
```

## Ghi tệp trên máy chủ {#write-a-remote-file}

```ts
// Một chuỗi hoặc dữ liệu byte.
await client.writeFile('/etc/motd', 'Welcome to prod\n');
await client.writeFile('/srv/app/config.json', JSON.stringify(config, null, 2), { mode: 0o600 });

// Một stream, cho dữ liệu quá lớn để giữ trong bộ nhớ.
import { createReadStream, statSync } from 'node:fs';

const file = './backup.tar.gz';
await client.writeFile('/srv/backups/latest.tar.gz', createReadStream(file), {
  size: statSync(file).size,
});
```

| Tùy chọn | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `mode` | `0o644` | Quyền của tệp khi được tạo mới. |
| `size` | | Độ dài của stream, tính bằng byte. |
| `signal` | | Hủy thao tác ghi. |

::: warning Stream qua SCP cần có size
Giao thức SCP phải báo kích thước tệp trước khi gửi dữ liệu. Nếu không có `size`, node-scp sẽ đọc
toàn bộ stream vào bộ nhớ trước. Khi có `size`, stream phải dài đúng bằng con số đó, trên cả hai
giao thức, nếu không thao tác ghi sẽ thất bại.
:::

## Đọc tệp trên máy chủ {#read-a-remote-file}

`readFile()` trả về một `Buffer` chứa toàn bộ nội dung:

```ts
const raw = await client.readFile('/srv/app/config.json');
const config = JSON.parse(raw.toString('utf8'));
```

Với tệp lớn, hãy dùng [`download()`](./transfers) để ghi xuống đĩa: nó truyền theo stream và báo
tiến độ.

## Ví dụ: sửa tệp cấu hình trên máy chủ {#example-edit-a-remote-config}

```ts
const path = '/etc/config/system';
const current = (await client.readFile(path)).toString();
const updated = current.replace(/option hostname '.*'/, "option hostname 'office-router'");
if (updated !== current) await client.writeFile(path, updated);
```
