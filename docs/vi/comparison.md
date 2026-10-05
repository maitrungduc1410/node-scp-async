---
description: "So sánh node-scp với ssh2-sftp-client, node-ssh và scp2: giao thức, tính năng, hỗ trợ TypeScript, benchmark, và khi nào nên chọn thư viện nào."
---

# So sánh node-scp với các thư viện khác

Node.js có nhiều thư viện truyền tệp qua SSH rất tốt. Trang này cố gắng công bằng về việc khi nào
thư viện nào là lựa chọn tốt hơn. Số liệu được kiểm tra vào tháng 9 năm 2026.

| | node-scp 1.x | [ssh2-sftp-client](https://www.npmjs.com/package/ssh2-sftp-client) 12.x | [node-ssh](https://www.npmjs.com/package/node-ssh) 13.x | [scp2](https://www.npmjs.com/package/scp2) 0.5 |
| --- | --- | --- | --- | --- |
| Lượt tải mỗi tuần | khoảng 25 nghìn | khoảng 3,1 triệu | khoảng 450 nghìn | khoảng 13 nghìn |
| Bản phát hành gần nhất | 2026 | 2026 | 2025 | 2016, ngừng bảo trì |
| SFTP | có | có | có | có |
| Giao thức SCP (máy chủ không có SFTP) | có | không | không | không, dù tên là vậy |
| Tự chọn SFTP / SCP | có | không | không | không |
| Chạy lệnh từ xa | qua `client.ssh` | không | có, tính năng chính | không |
| Thao tác tệp trên máy chủ | các thao tác phổ biến trong `client.fs`, phần còn lại qua `client.sftp` | API phong phú nhất | một vài | chỉ mkdir |
| Truyền thư mục song song | có | có | có | không |
| Tiến độ, bộ lọc, `AbortSignal` | đủ cả ba | tiến độ và bộ lọc | tiến độ theo từng tệp, bộ lọc | chỉ có event |
| Mã lỗi không phụ thuộc giao thức | có | một phần | không | không |
| Type cho TypeScript | có sẵn | gói `@types` riêng | có sẵn | không có |
| ES module và CommonJS | cả hai | CommonJS | CommonJS | CommonJS |
| CLI và GitHub Action | có | không | không | không |

## Chọn ssh2-sftp-client khi {#pick-ssh2-sftp-client-when}

- bạn chỉ làm việc với các máy chủ thông thường có SFTP,
- bạn cần bộ API SFTP rộng của nó (stream tới tệp trên máy chủ, `rcopy`, ghi nối, xử lý stat mở
  rộng) cùng nhiều năm chạy thực tế trên production,
- bạn muốn lựa chọn được dùng rộng rãi nhất.

## Chọn node-ssh khi {#pick-node-ssh-when}

- chạy lệnh là việc chính, còn sao chép tệp chỉ là việc phụ,
- bạn muốn một object duy nhất cho `execCommand`, `putFiles` và `getDirectory`.

## Chọn node-scp khi {#pick-node-scp-when}

- một số máy đích của bạn là router, thiết bị nhúng, thiết bị mạng hoặc hệ thống tối giản không
  có SFTP,
- bạn sao chép nhiều tệp nhỏ và quan tâm đến tốc độ (xem bên dưới),
- bạn muốn mã lỗi không phụ thuộc giao thức, khả năng hủy và tiến độ cho cả cây thư mục,
- bạn muốn cùng một công cụ dùng được như thư viện, CLI và GitHub Action,
- bạn đang dùng `scp2` và cần một bản thay thế còn được bảo trì.

## Về số liệu benchmark {#about-the-benchmark-numbers}

node-scp dẫn trước rất xa khi có nhiều tệp nhỏ:

<BenchChart />

Phần lớn chênh lệch đến từ một thiết lập: node-scp bật `TCP_NODELAY` cho socket SSH, trong khi các
thư viện khác vẫn để thuật toán Nagle bật. Bạn có thể đạt được phần lớn mức cải thiện đó với các
thư viện khác bằng cách gọi `setNoDelay(true)` trên client ssh2 bên dưới của chúng. Với tệp lớn
đơn lẻ, các thư viện khá ngang nhau, vì tất cả đều dùng `fastPut` / `fastGet` có pipeline của ssh2
cho SFTP.

Benchmark nằm trong `bench/transfer.bench.ts`. Trước khi rút ra kết luận cho hệ thống của bạn, hãy
chạy chúng với chính máy chủ của bạn bằng cách đặt `NODE_SCP_BENCH_HOST`, `NODE_SCP_BENCH_PORT`,
`NODE_SCP_BENCH_USER` và `NODE_SCP_BENCH_PASSWORD`.
