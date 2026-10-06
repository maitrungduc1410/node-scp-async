---
description: "Tải tệp và thư mục lên, xuống bằng node-scp: đích là đường dẫn chính xác, bộ lọc, quyền và thời gian, sao chép song song qua SFTP và các hàm một lệnh gọi."
---

# Tải lên và tải xuống

Hai method dùng để truyền tệp, và chúng đối xứng với nhau:

```ts
await client.upload(localPath, remotePath, options); // máy của bạn -> máy chủ
await client.download(remotePath, localPath, options); // máy chủ -> máy của bạn
```

Cả hai sao chép nguyên một tệp đơn lẻ. Với thư mục, thêm `recursive: true`, giống `scp -r`:

```ts
await client.upload('./report.pdf', '/srv/reports/2026-09.pdf');
await client.upload('./dist', '/var/www/app', { recursive: true });
await client.download('/etc/nginx', './backup/nginx', { recursive: true });
```

Cả hai trả về bản tóm tắt những gì đã được sao chép:

```ts
const result = await client.upload('./dist', '/var/www/app', { recursive: true });
// { files: 42, directories: 7, bytes: 1048576 }
```

## Tệp sẽ nằm ở đâu? {#where-do-files-end-up}

Đích bạn truyền vào là **đường dẫn chính xác** của bản sao, không bao giờ là "thư mục để bỏ tệp
vào". Thử các tùy chọn bên dưới để xem chuyện gì xảy ra trên máy chủ:

<DestinationDemo />

Tóm lại:

- `upload('dist', '/var/www/app')` làm cho `/var/www/app` chứa đúng những gì `dist` chứa.
- Thư mục **cha** trên máy chủ (`/var/www`) phải có sẵn. Khi tải xuống, thư mục cha cục bộ sẽ được
  tạo tự động.
- Sao chép vào một thư mục đã có sẽ gộp nội dung: tệp trùng tên bị ghi đè, các tệp khác giữ
  nguyên.
- [CLI và GitHub Action](./cli#where-files-end-up) thì theo quy tắc của `scp`: nếu đích là thư mục
  đã có hoặc kết thúc bằng `/`, nguồn sẽ được sao chép "vào trong" nó.

::: tip Cần tạo thư mục trên máy chủ trước?
Qua SFTP, dùng [`client.fs.mkdir(path, { recursive: true })`](./remote-fs). SCP không có thao tác
nào với hệ thống tệp; hãy chạy `mkdir -p` qua [`client.ssh`](./remote-fs#run-commands).
:::

## Chọn những gì cần sao chép {#pick-what-to-copy}

`filter` được gọi cho từng tệp và thư mục. Trả về `false` để bỏ qua; bỏ qua một thư mục nghĩa là
bỏ qua mọi thứ bên trong nó.

```ts
await client.upload('./project', '/srv/project', {
  recursive: true,
  filter: (path, entry) => {
    if (entry.type === 'directory') return path !== 'node_modules' && !path.startsWith('.git');
    return !path.endsWith('.map') && entry.size < 50_000_000;
  },
});
```

- `path` là đường dẫn tương đối so với thứ bạn sao chép và luôn dùng `/`, ví dụ `src/index.ts`.
- `entry` có `type`, `size` và `mode`. node-scp đi theo symlink tới đích thật, còn những mục không
  phải tệp hay thư mục (socket, thiết bị) bị bỏ qua, nên `type` luôn là `'file'` hoặc
  `'directory'`.

## Quyền truy cập và thời gian {#permissions-and-times}

| | Tệp mới | Tệp đã có | Thời gian sửa đổi |
| --- | --- | --- | --- |
| mặc định | các bit quyền của tệp nguồn, sau khi áp umask | giữ nguyên mode | đặt thành thời điểm hiện tại |
| `preserve: true` | toàn bộ mode của tệp nguồn, gồm cả setuid, setgid và sticky | nhận mode của tệp nguồn | sao chép từ tệp nguồn |

`preserve` hoạt động giống `scp -p`. Một số thiết bị mạng từ chối tùy chọn này; khi đó hãy tắt nó.

## Sao chép nhanh hơn {#copy-faster}

Qua SFTP, khi sao chép thư mục, node-scp gửi nhiều tệp cùng lúc. `concurrency` quyết định bao
nhiêu tệp:

```ts
await client.upload('./photos', '/srv/photos', { recursive: true, concurrency: 16 });
```

Giá trị mặc định là 4, khá cân bằng. Hãy tăng lên nếu bạn có nhiều tệp nhỏ và đường truyền chậm.
SCP luôn sao chép từng tệp một, nên tùy chọn này không có tác dụng ở đó.

## Hàm tiện ích một lệnh gọi {#one-call-helpers}

Khi chỉ sao chép một lần và không cần client sau đó, `upload()` và `download()` tự kết nối, sao
chép rồi ngắt kết nối giúp bạn. Phía máy chủ được viết giống như trong `scp`:

```ts
import { download, upload } from 'node-scp';

await upload('./dist', 'deploy@example.com:/var/www/app', { recursive: true, privateKey });
await download('root@192.168.1.1:/etc/config', './backup/config', { recursive: true, password });
```

Object tùy chọn nhận cả tùy chọn kết nối lẫn tùy chọn truyền tệp. Các dạng được chấp nhận:

| Cách viết | Ý nghĩa |
| --- | --- |
| `host:path` | user lấy từ `username` trong tùy chọn |
| `user@host:path` | user và host |
| `user@[2001:db8::1]:path` | địa chỉ IPv6 đặt trong ngoặc vuông |
| `host:` | thư mục đăng nhập |
| `scp://user@host:2222/var/www` | port tùy chỉnh, ở đây với đường dẫn `/var/www` |
| `user@host:relative/path` | đường dẫn tương đối so với thư mục đăng nhập |
| `{ host, port, username, path }` | một object, khi bạn đã có sẵn từng phần |

[`parseTarget()` và `formatTarget()`](/api/functions/parseTarget) chuyển đổi giữa dạng
chuỗi và dạng object nếu bạn tự xây công cụ riêng. Dạng `user@host:path` không có chỗ cho port,
nên `formatTarget()` sẽ bỏ port đi.

## Tiếp theo {#next}

- Hiển thị tiến độ và hủy những lần sao chép lâu: [Tiến độ và hủy](./progress).
- Gửi một tệp được tạo ra mà không cần ghi xuống đĩa: [Tệp trong bộ nhớ](./files-in-memory).
