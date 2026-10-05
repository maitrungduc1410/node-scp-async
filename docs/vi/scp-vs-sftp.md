---
description: "SCP hay SFTP năm 2026: hai giao thức hoạt động ra sao, OpenSSH 8 và 9 thay đổi gì, khi nào SCP là lựa chọn duy nhất, và node-scp xử lý cả hai an toàn thế nào."
---

# SCP hay SFTP vào năm 2026?

Cả hai đều chạy trên SSH, đều sao chép tệp, và từ OpenSSH 9 thì ngay cả lệnh `scp` thường cũng
dùng SFTP bên dưới. Vậy tại sao node-scp vẫn cài đặt giao thức SCP cũ? Vì rất nhiều máy chủ chưa
bao giờ được cập nhật theo.

## Hai giao thức với cái tên dễ gây nhầm lẫn {#two-protocols-with-confusing-names}

**SCP** là hai chương trình nói chuyện với nhau qua một đường ống. Client chạy `scp -t /dest` (to,
nhận vào) hoặc `scp -f /src` (from, gửi đi) trên máy chủ qua một SSH exec channel, rồi hai bên
truyền cho nhau các record văn bản đơn giản: `C0644 1234 name` cho một tệp, `D0755 0 dir` để đi
vào một thư mục, `E` để thoát ra, và mỗi record được trả lời bằng một byte trạng thái. Giao thức
này có nguồn gốc từ `rcp` của BSD vào những năm 1980.

**SFTP** là một giao thức tệp thực thụ, một SSH subsystem với các request được đánh số: open, read,
write, stat, readdir, rename, remove, symlink, v.v. Client có thể gửi nhiều request cùng lúc, tiếp
tục từ một offset, liệt kê thư mục và đổi quyền truy cập.

## OpenSSH đã thay đổi những gì {#what-openssh-changed}

- **OpenSSH 8.0 (2019)** gọi giao thức SCP là "outdated, inflexible and not readily fixed" (lỗi
  thời, thiếu linh hoạt và khó sửa) sau một loạt lỗi phía client, nghiêm trọng nhất là
  [CVE-2019-6111](https://nvd.nist.gov/vuln/detail/CVE-2019-6111): một máy chủ độc hại có thể gửi
  tên tệp khiến client ghi đè lên tệp bất kỳ.
- **OpenSSH 9.0 (2022)** chuyển lệnh `scp` sang dùng giao thức SFTP bên dưới. Giao thức cũ vẫn dùng
  được với `scp -O`.
- Chương trình `scp -t` / `scp -f` phía máy chủ vẫn được cài cùng OpenSSH, vì các client cũ còn
  cần đến nó.

Vì vậy, trên một máy Linux hiện đại bạn gần như không bao giờ *cần* SCP. Ở đó SFTP là giao thức
tốt hơn.

## Nơi SCP vẫn là lựa chọn duy nhất {#where-scp-is-still-the-only-option}

- **Dropbear**, SSH server của OpenWrt và vô số thiết bị Linux nhúng, có sẵn binary `scp` nhưng
  không có SFTP server. Trên OpenWrt bạn phải tự cài `openssh-sftp-server`, và nhiều thiết bị
  không đủ dung lượng flash hoặc hoàn toàn không có gói này.
- **Thiết bị mạng.** Rất nhiều router, switch, tường lửa và thiết bị chuyên dụng chỉ mở SCP để
  chuyển firmware và tệp cấu hình, ngoài ra không có gì khác.
- **Image tối giản và hệ thống cũ** chưa từng được cấu hình subsystem SFTP.

Chiều ngược lại cũng có: các dịch vụ hosting được siết bảo mật với `ForceCommand internal-sftp`
cho phép SFTP nhưng từ chối chạy `scp`.

## So sánh hai giao thức {#how-they-compare}

| | SFTP | SCP |
| --- | --- | --- |
| Mức độ phổ biến | Mặc định trên mọi máy chủ OpenSSH, cả OpenSSH trên Windows | Gần như mọi máy chủ SSH, kể cả Dropbear và các thiết bị |
| Nhiều tệp nhỏ | Nhanh: request được pipeline và nhiều tệp có thể chạy song song | Từng tệp một, hai round trip cho mỗi tệp |
| Một tệp lớn | Nhanh | Nhanh, overhead thấp hơn một chút |
| Đường truyền độ trễ cao | Tốt hơn nhiều | Các round trip cộng dồn lại |
| Liệt kê, đổi tên, xóa, chmod | Có | Không, chỉ sao chép |
| Tiếp tục truyền, truy cập ngẫu nhiên | Có | Không |
| Có đi qua shell trên máy chủ | Không | Có, đường dẫn đi qua shell trên máy chủ |
| Mức tin tưởng máy chủ | Client tự yêu cầu từng đường dẫn; tên lấy từ danh sách thư mục vẫn cần kiểm tra | Máy chủ quyết định gửi gì, nên client phải kiểm tra từng record |

## node-scp xử lý chuyện này thế nào {#what-node-scp-does-about-it}

- `protocol: 'auto'` (mặc định) yêu cầu SFTP và chuyển sang SCP khi không có, nên bạn không cần
  biết mình đang làm việc với loại máy chủ nào.
- Phần cài đặt SCP coi máy chủ là không đáng tin: mọi tên nhận được phải là một thành phần đường
  dẫn duy nhất, các mục cấp cao nhất thừa ra bị từ chối, và thư mục bị từ chối trừ khi bạn yêu cầu
  sao chép đệ quy. Đường dẫn gửi tới shell trên máy chủ đều được đặt trong dấu nháy.
- `TCP_NODELAY` được bật, điều này rất quan trọng với cả hai giao thức vì cả hai đều phải chờ những
  phản hồi nhỏ.

## Vậy nên dùng giao thức nào? {#so-which-one-should-you-use}

Hãy để node-scp tự chọn. Nếu muốn ép dùng một giao thức:

- `protocol: 'sftp'` khi bạn cần `client.fs` (liệt kê, đổi tên, xóa) hoặc sao chép nhiều tệp qua
  đường truyền chậm.
- `protocol: 'scp'` khi máy chủ là thiết bị mà bạn biết chắc không có SFTP, để bỏ qua bước dò.
