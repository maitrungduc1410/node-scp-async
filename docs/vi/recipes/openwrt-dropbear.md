---
description: "Dùng node-scp với router OpenWrt và Dropbear vốn không có SFTP: sao lưu /etc/config, đẩy tệp cấu hình, tải firmware sysupgrade lên và tránh các lỗi thường gặp."
---

# OpenWrt và Dropbear

Router OpenWrt dùng Dropbear làm SSH server. Dropbear chạy được `scp`, nhưng không có SFTP server
trừ khi bạn tự cài thêm, nên phần lớn thư viện SFTP sẽ báo lỗi "Unable to start subsystem: sftp".
node-scp tự động chuyển sang SCP.

## Sao lưu cấu hình {#back-up-the-configuration}

```ts
import { download } from 'node-scp';

await download('root@192.168.1.1:/etc/config', `./backup/${Date.now()}`, {
  recursive: true,
  password: process.env.ROUTER_PASSWORD,
});
```

Hoặc từ shell:

```sh
NODE_SCP_PASSWORD=secret npx node-scp -r root@192.168.1.1:/etc/config ./backup/
```

## Đẩy một tệp lên và áp dụng {#push-a-file-and-apply-it}

```ts
import { connect } from 'node-scp';

await using router = await connect({
  host: '192.168.1.1',
  username: 'root',
  password: process.env.ROUTER_PASSWORD,
});

await router.writeFile('/etc/config/wireless', wirelessConfig, { mode: 0o600 });

// Mọi việc khác đều đi qua client ssh2.
router.ssh.exec('wifi reload', (err, stream) => {
  if (err) throw err;
  stream.resume();
});
```

## Tải bản firmware lên {#upload-a-firmware-image}

Tệp firmware khá lớn, và trên OpenWrt thì `/tmp` là RAM disk, cũng là nơi `sysupgrade` tìm tệp:

```ts
await router.upload('./openwrt-sysupgrade.bin', '/tmp/sysupgrade.bin', {
  onProgress: (p) => process.stdout.write(`\r${Math.round((p.transferred / p.total!) * 100)}%`),
});
```

## Mẹo {#tips}

- **Thư mục cha trên máy chủ phải có sẵn.** Khi tải lên đệ quy, node-scp tạo các thư mục bên trong
  thứ bạn sao chép, nhưng qua SCP nó không tạo được thư mục cha còn thiếu của đích. Hãy tải vào
  thư mục đã tồn tại, hoặc chạy `mkdir -p` trước qua `router.ssh.exec`.
- **Bỏ qua bước dò SFTP** bằng `protocol: 'scp'` khi bạn đã biết thiết bị. Cách này tiết kiệm một
  round trip và tránh để lại một dòng log trên router.
- **Dùng key thay cho mật khẩu.** Đặt public key của bạn vào `/etc/dropbear/authorized_keys` trên
  router và truyền `privateKey` vào `connect`.
- **Vẫn muốn dùng SFTP?** Cài `openssh-sftp-server` trên router (`opkg install
  openssh-sftp-server`, hoặc `apk add openssh-sftp-server` trên các bản phát hành dùng apk). Khi đó
  node-scp sẽ tự chọn SFTP và `client.fs` sẽ có sẵn.
- **Các bản Dropbear cũ** có thể chỉ hỗ trợ những thuật toán trao đổi khóa cũ. Nếu handshake thất
  bại, hãy bật chúng qua tùy chọn `algorithms` của ssh2.
