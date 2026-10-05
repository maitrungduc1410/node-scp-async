---
description: "Dòng lệnh node-scp: sao chép kiểu scp bằng npx, tệp sẽ nằm ở đâu, đọc thông tin đăng nhập từ biến môi trường, ghim host key và giải thích mọi tùy chọn."
---

# Dòng lệnh

`node-scp` dùng giống `scp`, còn việc chọn SFTP hay SCP thì để nó lo. Không cần cài đặt global,
`npx` sẽ tự tải về:

```sh
npx node-scp -r ./dist deploy@example.com:/var/www/app
```

## Các lệnh thường dùng {#everyday-commands}

```sh
# Tải lên một thư mục
npx node-scp -r ./dist deploy@example.com:/var/www/app

# Tải một tệp về một thư mục cục bộ (chú ý dấu / ở cuối)
npx node-scp root@192.168.1.1:/etc/config/network ./backup/

# Nhiều nguồn thì luôn được sao chép vào trong thư mục đích
npx node-scp -r ./public ./package.json deploy@example.com:/srv/app/

# Bỏ qua tệp; mẫu không chứa / sẽ khớp ở mọi cấp thư mục
npx node-scp -r --exclude node_modules --exclude '*.map' . deploy@example.com:/srv/app/

# Port tùy chỉnh, viết kiểu nào cũng được
npx node-scp -P 2222 ./file.txt deploy@example.com:/tmp/
npx node-scp ./file.txt scp://deploy@example.com:2222/tmp/

# Thiết bị không có SFTP và đăng nhập chậm
npx node-scp --protocol scp --timeout 60000 ./firmware.bin admin@10.0.0.10:flash:firmware.bin
```

Vị trí trên máy chủ được viết dạng `[user@]host:[path]` hoặc `scp://[user@]host[:port]/[path]`.

## Tệp sẽ nằm ở đâu {#where-files-end-up}

Khác với thư viện, CLI theo quy tắc của `scp`: khi đích là một thư mục đã có, hoặc kết thúc bằng
`/`, các nguồn được sao chép **vào trong** nó.

<DestinationDemo initial="cli" />

## Đăng nhập {#logging-in}

CLI thu thập thông tin đăng nhập từ những nguồn sau:

| Nguồn | Dùng làm |
| --- | --- |
| `NODE_SCP_PRIVATE_KEY` | Nội dung private key. Được ưu tiên hơn `-i`. |
| `-i <file>` | Tệp private key. |
| `NODE_SCP_PASSPHRASE` | Passphrase cho private key đã mã hóa. |
| `NODE_SCP_PASSWORD` | Mật khẩu. |
| `SSH_AUTH_SOCK` | ssh-agent đang chạy. |
| `~/.ssh/id_ed25519`, `id_ecdsa`, `id_rsa` | Chỉ dùng khi không có nguồn nào ở trên: tệp đầu tiên tồn tại trong danh sách này. |

Mọi thông tin tìm được đều được gửi cho máy chủ. ssh2 thử mật khẩu trước, rồi đến private key,
sau cùng là agent.

Mật khẩu không bao giờ được nhận qua tham số dòng lệnh, vì chúng sẽ lọt vào lịch sử shell và danh
sách process. Hãy dùng biến môi trường:

```sh
NODE_SCP_PASSWORD="$ROUTER_PASSWORD" npx node-scp -r root@192.168.1.1:/etc/config ./backup/
```

## Ghim host key {#pin-the-host-key}

Nếu không có fingerprint, CLI chấp nhận mọi host key và in ra cảnh báo. Hãy lấy fingerprint một
lần từ một mạng bạn tin tưởng, rồi lần nào cũng truyền nó vào:

```sh
ssh-keyscan -t ed25519 example.com 2>/dev/null | ssh-keygen -lf -
# 256 SHA256:q7Jx0fT3cM2yKpV9LrWn4sEaB8uHdZ1oGiXe6NcRtYk example.com (ED25519)

npx node-scp --fingerprint SHA256:q7Jx0fT3cM2yKpV9LrWn4sEaB8uHdZ1oGiXe6NcRtYk -r ./dist deploy@example.com:/var/www/app
```

Có thể lặp lại `--fingerprint` nhiều lần, còn `NODE_SCP_FINGERPRINT` nhận một danh sách phân cách
bằng dấu phẩy.

## Tất cả tùy chọn {#all-options}

| Tùy chọn | Ý nghĩa |
| --- | --- |
| `-r`, `--recursive` | Sao chép thư mục. |
| `-p`, `--preserve` | Giữ nguyên mode và thời gian của tệp. |
| `-P`, `--port <port>` | Port SSH. Mặc định là 22. |
| `-i`, `--identity <file>` | Tệp private key. |
| `-u`, `--user <name>` | Tên người dùng khi vị trí không ghi rõ. |
| `--protocol <name>` | `auto` (mặc định), `sftp` hoặc `scp`. |
| `-c`, `--concurrency <n>` | Số tệp song song khi sao chép thư mục qua SFTP. Mặc định là 4. |
| `--exclude <pattern>` | Bỏ qua các mục khớp mẫu. Lặp lại được. |
| `--fingerprint <fp>` | Host key mong đợi, dạng `SHA256:...`. Lặp lại được. |
| `--scp-command <cmd>` | Lệnh scp trên máy chủ. Mặc định là `scp`. |
| `--timeout <ms>` | Thời gian chờ kết nối. Mặc định là 20000. |
| `-q`, `--quiet` | Chỉ in ra lỗi. |
| `-h`, `--help` / `-V`, `--version` | Trợ giúp và phiên bản. |

## Trong CI {#in-ci}

[GitHub Action](/vi/recipes/github-actions) là lớp bọc quanh CLI này. Với các hệ thống CI khác, hãy
gọi trực tiếp CLI và truyền key qua biến môi trường:

```sh
NODE_SCP_PRIVATE_KEY="$DEPLOY_KEY" npx node-scp@1 -r --fingerprint "$DEPLOY_FP" dist/ deploy@example.com:/var/www/app
```
