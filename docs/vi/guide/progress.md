---
description: "Theo dõi tiến độ truyền tệp trong node-scp bằng onProgress và hủy bằng AbortSignal, kể cả đặt timeout, kèm demo trực tiếp những gì callback của bạn nhận được."
---

# Tiến độ và hủy

`upload()` và `download()` nhận một callback `onProgress` và một `AbortSignal`. Nhấn **Bắt đầu**
bên dưới để xem callback của bạn nhận được gì, rồi thử `controller.abort()` khi đang chạy giữa
chừng.

<ProgressDemo />

## `onProgress` nhận được gì {#what-onprogress-receives}

| Trường | Ý nghĩa |
| --- | --- |
| `path` | Tệp đang được truyền, tương đối so với thứ bạn sao chép, dùng `/`. |
| `fileTransferred` / `fileSize` | Số byte của tệp đó đã truyền xong, và kích thước của nó. |
| `transferred` | Số byte đã truyền trong toàn bộ thao tác. |
| `total` | Tổng số byte của toàn bộ thao tác, nếu biết trước. |
| `filesCompleted` | Số tệp đã xong. |
| `filesTotal` | Tổng số tệp, nếu biết trước. |

`total` và `filesTotal` được biết trước khi tải lên và khi tải xuống qua SFTP. Khi tải xuống qua
SCP, node-scp chỉ biết về từng tệp lúc máy chủ gửi nó tới, nên cả hai đều là `undefined`. Hãy viết
phần hiển thị tiến độ sao cho xử lý được trường hợp này:

```ts
const onProgress = (p: TransferProgress) => {
  const done = `${(p.transferred / 1e6).toFixed(1)} MB`;
  const line = p.total ? `${done} of ${(p.total / 1e6).toFixed(1)} MB` : done;
  process.stdout.write(`\r${line}, ${p.filesCompleted} files, now ${p.path}`);
};

await client.download('/var/backups', './backups', { recursive: true, onProgress });
```

Callback được gọi rất thường xuyên, nhiều lần cho mỗi tệp. Hãy giữ nó thật nhẹ, hoặc giới hạn tần
suất cập nhật giao diện.

## Hủy một lần truyền {#cancel-a-transfer}

Truyền `signal` của một `AbortController` vào và gọi `abort()` bất cứ khi nào bạn muốn dừng:

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

Promise bị reject ngay lập tức với lỗi `ERR_ABORTED`. Những gì đã sang phía bên kia vẫn nằm đó:
các tệp đã xong thì đầy đủ, còn tệp đang ghi dở có thể bị cắt cụt. Qua SFTP, những tệp đang truyền
dở sẽ tiếp tục chạy nốt ở chế độ nền.

## Đặt giới hạn thời gian {#put-a-time-limit-on-it}

`AbortSignal.timeout()` và `AbortSignal.any()` xử lý các trường hợp thường gặp mà không cần
controller:

```ts
// Bỏ cuộc sau hai phút.
await client.upload('./dist', '/var/www/app', {
  recursive: true,
  signal: AbortSignal.timeout(120_000),
});

// Dừng khi hết giờ hoặc khi người dùng hủy, tùy điều gì đến trước.
const signal = AbortSignal.any([AbortSignal.timeout(120_000), controller.signal]);
```

Signal cũng hoạt động y hệt với `connect()`, `writeFile()` và `readFile()`.
