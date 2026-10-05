---
description: "Sao chép firmware và tệp cấu hình tới router, switch và thiết bị chuyên dụng chỉ có SCP, kèm mẹo về khác biệt giữa các hãng, thuật toán cũ và lỗi thường gặp."
---

# Router, switch và thiết bị chuyên dụng

Nhiều thiết bị mạng cho phép đăng nhập SSH nhưng chỉ cài một SCP server nhỏ để chuyển firmware và
tệp cấu hình. Không có SFTP, thường không có cả shell, và đôi khi đường dẫn trông như
`flash:image.bin` thay vì đường dẫn Unix.

## Kết nối thẳng bằng SCP {#connect-with-scp-directly}

Bỏ qua bước dò SFTP và cho thiết bị thêm thời gian để phản hồi:

```ts
import { connect } from 'node-scp';

await using device = await connect({
  host: '10.0.0.10',
  username: 'admin',
  password: process.env.DEVICE_PASSWORD,
  protocol: 'scp',
  readyTimeout: 30_000,
});

await device.upload('./firmware.bin', 'flash:firmware.bin');
await device.download('config.txt', './backup/config.txt');
```

Phần đứng sau host được gửi nguyên trạng tới thiết bị, nên các tên riêng của thiết bị như
`flash:firmware.bin` hay `bootflash:` đều dùng được nếu thiết bị hiểu chúng. Đường dẫn chỉ gồm
chữ cái, chữ số và `_@%+=:,./-` được gửi đi mà không có dấu nháy, đúng như những thiết bị không có
shell mong đợi.

## Những điểm khác nhau giữa các hãng {#things-that-differ-between-vendors}

- **Bật SCP server trước.** Nhiều thiết bị xuất xưởng với SCP server bị tắt. Ví dụ Cisco IOS cần
  lệnh `ip scp server enable`.
- **Sao chép thư mục** (`recursive: true`) thường không được hỗ trợ. Hãy sao chép từng tệp một.
- **Giữ nguyên thời gian** (`preserve: true`) gửi thêm các record `T` mà một số thiết bị từ chối.
  Hãy tắt tùy chọn này.
- **Thuật toán cũ.** Thiết bị đời cũ chỉ hỗ trợ cipher hoặc thuật toán trao đổi khóa cũ. Hãy bật
  chúng một cách tường minh qua tùy chọn `algorithms` của ssh2, ví dụ:

  ```ts
  await connect({
    host: '10.0.0.10',
    username: 'admin',
    password,
    protocol: 'scp',
    algorithms: { kex: { append: ['diffie-hellman-group14-sha1'] } },
  });
  ```

- **Đăng nhập keyboard interactive.** Một số thiết bị hỏi mật khẩu qua keyboard-interactive. Đặt
  `tryKeyboard: true` và trả lời trong `beforeConnect`:

  ```ts
  await connect({
    host,
    username,
    tryKeyboard: true,
    protocol: 'scp',
    beforeConnect: (ssh) =>
      ssh.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) =>
        finish(prompts.map(() => password)),
      ),
  });
  ```

## Khi có lỗi {#when-something-fails}

| Lỗi | Nguyên nhân thường gặp |
| --- | --- |
| `ERR_SCP_UNAVAILABLE` | SCP server đang tắt, hoặc thiết bị chỉ cho phép SFTP. |
| `ERR_SCP_PROTOCOL` | Thiết bị phản hồi theo cách không mong đợi. Thử bỏ `recursive` và `preserve`. |
| `ERR_PERMISSION_DENIED` | Tài khoản không đủ cấp quyền để truyền tệp. |
| `ERR_TIMEOUT` | Thiết bị chấp nhận đăng nhập chậm; hãy tăng `readyTimeout`. |

Nếu thiết bị của bạn cần thêm điều gì khác, hãy mở một issue kèm model thiết bị và thông báo lỗi.
