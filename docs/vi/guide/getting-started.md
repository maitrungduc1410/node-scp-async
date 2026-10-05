---
description: "Cài node-scp, kết nối bằng private key, ssh-agent hoặc mật khẩu, tải lên một thư mục, tải xuống một tệp rồi đóng kết nối an toàn với await using."
---

# Bắt đầu

Trang này đưa bạn từ một dự án trống tới lần tải lên đầu tiên chỉ trong vài phút.

## 1. Cài đặt {#_1-install}

::: code-group

```sh [npm]
npm install node-scp
```

```sh [pnpm]
pnpm add node-scp
```

```sh [yarn]
yarn add node-scp
```

```sh [bun]
bun add node-scp
```

:::

node-scp có sẵn type cho TypeScript và dùng được với cả `import` lẫn `require`.

## 2. Kết nối và sao chép {#_2-connect-and-copy}

```ts
import { readFileSync } from 'node:fs';
import { connect } from 'node-scp';

const client = await connect({
  host: 'example.com',
  username: 'deploy',
  privateKey: readFileSync('/home/me/.ssh/id_ed25519'),
});

try {
  await client.upload('./dist', '/var/www/app', { recursive: true });
  await client.download('/var/log/app.log', './logs/app.log');
  console.log(`copied over ${client.protocol}`); // 'sftp' hoặc 'scp'
} finally {
  await client.close();
}
```

Đoạn code trên làm những việc sau:

1. `connect()` mở kết nối SSH, đăng nhập và chọn giữa SFTP và SCP.
2. `upload()` sao chép thư mục `dist` trên máy bạn để `/var/www/app` trở thành bản sao của nó.
   Cần `recursive: true` để sao chép thư mục, giống `scp -r`.
3. `download()` sao chép một tệp từ máy chủ về. Thư mục cục bộ còn thiếu (`./logs`) sẽ được tạo.
4. `close()` đóng kết nối. Luôn đóng kết nối, nếu không process sẽ không thoát.

::: tip Để ngôn ngữ tự đóng kết nối giúp bạn
Với `await using`, kết nối được đóng ở cuối block, kể cả khi có lỗi xảy ra. Cú pháp này cần
Node 24 trở lên, hoặc TypeScript 5.2 trở lên (TypeScript sẽ biên dịch nó cho các bản Node cũ hơn).

```ts
await using client = await connect({ host, username, privateKey });
await client.upload('./dist', '/var/www/app', { recursive: true });
// kết nối được đóng tại đây
```

:::

## 3. Đăng nhập theo cách máy chủ yêu cầu {#_3-log-in-the-way-your-server-expects}

| Bạn có | Truyền vào `connect()` |
| --- | --- |
| Một tệp private key | `privateKey: readFileSync(path)` |
| Private key có passphrase | `privateKey` và `passphrase` |
| ssh-agent đang chạy | `agent: process.env.SSH_AUTH_SOCK` |
| Mật khẩu | `password: process.env.SSH_PASSWORD` |

Đừng để thông tin bí mật nằm trong code: hãy đọc chúng từ tệp, biến môi trường hoặc kho lưu trữ
secret. Trang [Kết nối](./connecting) trình bày cách đăng nhập keyboard interactive, đi qua jump
host và kiểm tra host key.

## 4. Hoặc không cần viết code {#_4-or-skip-the-code}

Cùng engine đó chạy được ngay trong terminal:

```sh
npx node-scp -r ./dist deploy@example.com:/var/www/app
```

Xem [Dòng lệnh](./cli), hoặc [GitHub Action](/vi/recipes/github-actions) nếu bạn dùng CI.

## Đọc tiếp {#where-to-go-next}

- [Tải lên và tải xuống](./transfers): tệp sẽ nằm ở đâu, bộ lọc, quyền truy cập, sao chép song
  song.
- [Tiến độ và hủy](./progress): thanh tiến độ và `AbortSignal`, kèm demo trực tiếp.
- [Tệp trong bộ nhớ](./files-in-memory): ghi thẳng một chuỗi hoặc stream vào tệp trên máy chủ.
- [Xử lý lỗi](./errors): mã lỗi ổn định để bạn rẽ nhánh xử lý.
