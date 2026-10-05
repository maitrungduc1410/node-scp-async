---
description: "Thao tác với tệp trên máy chủ qua SFTP trong node-scp: exists, stat, list, mkdir, rm, rename, realpath, cùng phiên SFTP gốc và cách chạy lệnh qua SSH."
---

# Hệ thống tệp từ xa

Qua SFTP, `client.fs` cung cấp các thao tác tệp thường dùng trên máy chủ. SCP chỉ sao chép được
tệp, nên khi dùng SCP thì `client.fs` là `undefined`.

```ts
if (!client.fs) throw new Error(`need SFTP, the server only offers ${client.protocol}`);

await client.fs.mkdir('/srv/app/releases/42', { recursive: true });
```

::: tip Biết chắc máy chủ có SFTP?
Hãy kết nối với `protocol: 'sftp'`. Khi đó kết nối sẽ báo lỗi `ERR_SFTP_UNAVAILABLE` ngay từ đầu,
thay vì để đến lúc bạn cần dùng `client.fs` mới phát hiện.
:::

## Các thao tác {#the-operations}

| Method | Tác dụng | Kết quả trả về |
| --- | --- | --- |
| `exists(path)` | Kiểm tra thứ gì đang nằm ở `path`, có đi theo symlink; `'symlink'` nghĩa là link trỏ tới đích không còn tồn tại | `'file'`, `'directory'`, `'symlink'`, `'other'` hoặc `false` |
| `stat(path)` | Thông tin chi tiết, có đi theo symlink | `{ type, size, mode, uid, gid, atime, mtime }` |
| `lstat(path)` | Thông tin của chính symlink | giống `stat` |
| `list(path)` | Các mục trong thư mục, sắp xếp theo tên, không gồm `.` và `..`; không đi theo symlink | mảng kết quả `lstat` kèm `name` |
| `mkdir(path, { recursive, mode })` | Tạo thư mục; `recursive` hoạt động như `mkdir -p` | không có |
| `rm(path, { recursive, force })` | Xóa tệp, symlink, hoặc với `recursive` thì xóa cả cây thư mục; `force` bỏ qua đường dẫn không tồn tại | không có |
| `rename(from, to)` | Di chuyển hoặc đổi tên | không có |
| `realpath(path)` | Đường dẫn tuyệt đối, ví dụ `.` thành thư mục home | một chuỗi |

Thời gian là object `Date`, còn `mode` chứa các bit quyền, ví dụ `0o755`. Lỗi dùng chung
[mã lỗi](./errors) với các thao tác truyền tệp, chẳng hạn `ERR_NOT_FOUND`.

## Ví dụ {#examples}

Giữ lại năm bản release mới nhất và xóa phần còn lại:

```ts
const releases = (await client.fs.list('/srv/app/releases'))
  .filter((entry) => entry.type === 'directory')
  .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

for (const old of releases.slice(5)) {
  await client.fs.rm(`/srv/app/releases/${old.name}`, { recursive: true });
}
```

Chỉ tải lên khi kích thước tệp thay đổi:

```ts
import { statSync } from 'node:fs';

const remote = '/srv/data/catalog.json';
const local = statSync('./catalog.json');
const existing = (await client.fs.exists(remote)) && (await client.fs.stat(remote));
if (!existing || existing.size !== local.size) await client.upload('./catalog.json', remote);
```

## Mọi thứ khác: phiên SFTP gốc {#everything-else-the-raw-sftp-session}

`client.sftp` là [phiên SFTP của ssh2](https://github.com/mscdex/ssh2/blob/master/SFTP.md) mà
node-scp đang dùng. Nó có phần còn lại của giao thức, theo kiểu callback: `chmod`, `chown`,
`utimes`, `symlink`, `readlink`, `appendFile` và nhiều hơn nữa.

```ts
import { promisify } from 'node:util';

const chmod = promisify(client.sftp!.chmod.bind(client.sftp!));
await chmod('/srv/app/bin/start.sh', 0o755);
```

## Chạy lệnh {#run-commands}

`client.ssh` là [client ssh2](https://github.com/mscdex/ssh2#client-methods) bên dưới. Nó luôn có
sẵn với cả hai giao thức, nên bạn có thể chạy lệnh trên máy chủ, ví dụ để tạo thư mục khi dùng SCP
hoặc khởi động lại service sau khi deploy:

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

::: warning Đặt dấu nháy cho những gì bạn đưa vào lệnh
node-scp tự đặt dấu nháy cho các đường dẫn nó gửi khi dùng SCP, nhưng lệnh do bạn tự ghép sẽ được
gửi nguyên trạng tới shell trên máy chủ. Đừng bao giờ đưa dữ liệu không tin cậy vào lệnh mà không
đặt dấu nháy.
:::
