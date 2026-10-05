---
description: "Sao chép tệp tới và từ mọi máy chủ SSH bằng Node.js: dùng SFTP khi máy chủ hỗ trợ, dùng giao thức SCP thật khi không có. Có thư viện, CLI và GitHub Action."
layout: home

hero:
  name: node-scp
  text: Sao chép tệp qua SSH, tới mọi máy chủ
  tagline: Dùng SFTP khi máy chủ có, dùng giao thức SCP thật khi máy chủ không có. Một API nhỏ gọn cho cloud VM, router OpenWrt và thiết bị mạng.
  actions:
    - theme: brand
      text: Bắt đầu
      link: /vi/guide/getting-started
    - theme: alt
      text: node-scp là gì?
      link: /vi/guide/
    - theme: alt
      text: Tài liệu API
      link: /api/

features:
  - icon: 🔀
    title: Chạy được cả khi không có SFTP
    details: "protocol: 'auto' dùng SFTP khi máy chủ hỗ trợ và tự chuyển sang SCP khi không có, nên Dropbear, router và switch đều chạy ngay."
    link: /vi/guide/protocols
    linkText: Cách chọn giao thức
  - icon: ⚡
    title: Nhanh với nhiều tệp
    details: Truyền song song qua SFTP và bật TCP_NODELAY giúp sao chép cây thư mục gồm nhiều tệp nhỏ nhanh gấp tới 10 lần so với các thư viện khác dựa trên ssh2.
    link: /vi/comparison
    linkText: Xem số liệu
  - icon: 🛡️
    title: An toàn ngay từ đầu
    details: Đường dẫn trên máy chủ được đặt trong dấu nháy trước khi đưa vào shell, tên tệp do máy chủ gửi về được kiểm tra chống path traversal, và CLI hỗ trợ ghim host key.
    link: /vi/guide/connecting#verify-the-host-key
    linkText: Xác minh máy chủ
  - icon: 🧭
    title: API hiện đại
    details: TypeScript, ESM và CommonJS, await using, AbortSignal, sự kiện tiến độ, bộ lọc và lỗi có kiểu với mã lỗi ổn định.
    link: /vi/guide/transfers
    linkText: Tải lên và tải xuống
  - icon: 🧰
    title: CLI và GitHub Action
    details: Cùng một engine, dùng qua npx node-scp hoặc làm bước deploy trong workflow, có mẫu loại trừ tệp và ghim host key.
    link: /vi/guide/cli
    linkText: Dòng lệnh
  - icon: 🔁
    title: Nâng cấp dễ dàng
    details: Có lớp tương thích cho node-scp 0.x và gói scp2 đã ngừng bảo trì. Chỉ cần đổi một dòng import, phần còn lại chuyển dần theo tốc độ của bạn.
    link: /vi/migration/from-0.x
    linkText: Hướng dẫn nâng cấp
---

<div class="home-section vp-doc">

## Sao chép một thư mục chỉ với ba dòng {#copy-a-folder-in-three-lines}

::: code-group

```ts [Thư viện]
import { connect } from 'node-scp';

await using client = await connect({ host: 'example.com', username: 'deploy', privateKey });
await client.upload('./dist', '/var/www/app', { recursive: true });
```

```ts [Một lệnh gọi]
import { upload } from 'node-scp';

await upload('./dist', 'deploy@example.com:/var/www/app', { recursive: true, privateKey });
```

```sh [CLI]
npx node-scp -r ./dist deploy@example.com:/var/www/app
```

```yaml [GitHub Action]
- uses: maitrungduc1410/node-scp-async@v1
  with:
    host: ${{ secrets.DEPLOY_HOST }}
    username: deploy
    private-key: ${{ secrets.DEPLOY_KEY }}
    source: dist/
    target: /var/www/app
```

:::

## Chạy được với những máy chủ bạn đang dùng {#works-with-the-servers-you-actually-have}

Chọn một loại máy chủ để xem node-scp xử lý thế nào.

<!--@include: ./parts/server-picker.md-->

## Cách chọn giao thức {#how-it-picks-the-protocol}

```mermaid
flowchart LR
  A(["connect()"]) --> B{"tùy chọn protocol"}
  B -- "'scp'" --> S["SCP<br/>scp -t / scp -f qua exec channel"]
  B -- "'auto' (mặc định) hoặc 'sftp'" --> C{"Máy chủ<br/>có SFTP không?"}
  C -- có --> F["SFTP<br/>có client.fs"]
  C -- "không, và 'auto'" --> S
  C -- "không, và 'sftp'" --> E["ERR_SFTP_UNAVAILABLE"]
```

## Nhanh ở những chỗ quan trọng {#fast-where-it-matters}

Thời gian tải lên một máy chủ OpenSSH chạy trên cùng máy, lấy trung bình nhiều lần chạy. Phần lớn
chênh lệch với tệp nhỏ đến từ `TCP_NODELAY`; [trang so sánh](/vi/comparison) giải thích chi tiết.

<BenchChart />

</div>
