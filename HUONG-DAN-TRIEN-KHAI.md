# HƯỚNG DẪN TRIỂN KHAI LÊN MÁY CHỦ (VM)
## NGSI · Phòng Kỹ thuật – Quản trị công việc và nguồn lực

Tài liệu này hướng dẫn từng bước đưa ứng dụng lên một máy chủ ảo (VM) chạy Ubuntu, để cả phòng cùng truy cập qua trình duyệt, đăng nhập bằng tài khoản riêng và dữ liệu được lưu lâu dài, sao lưu tự động hằng ngày.

> **Từ phiên bản 1.2 ứng dụng dùng MariaDB.** Máy chủ đang chạy bản SQLite → làm theo `HUONG-DAN-CHUYEN-MARIADB.md`. Cài mới hoàn toàn → làm tài liệu này đến hết Bước 6, rồi làm Bước 2–3 của `HUONG-DAN-CHUYEN-MARIADB.md` (cài MariaDB, tạo CSDL), điền các dòng `DB_*` vào `.env` ở Bước 7, bỏ qua bước chuyển dữ liệu.

Bạn không cần biết lập trình. Chỉ cần sao chép đúng từng lệnh trong các khung màu xám, dán vào cửa sổ dòng lệnh và nhấn Enter. Sau mỗi bước có mục **“Kiểm tra”** để biết bước đó đã thành công hay chưa.

---

## MỤC LỤC

- [Phần A – Hiểu nhanh hệ thống](#phần-a--hiểu-nhanh-hệ-thống)
- [Phần B – Chuẩn bị](#phần-b--chuẩn-bị)
- [Phần C – Cài đặt từng bước (Bước 1 → 13)](#phần-c--cài-đặt-từng-bước)
- [Phần D – Đưa vào sử dụng cho cả phòng](#phần-d--đưa-vào-sử-dụng-cho-cả-phòng)
- [Phần E – Vận hành hằng ngày: sao lưu, cập nhật, khôi phục](#phần-e--vận-hành-hằng-ngày)
- [Phần F – Xử lý sự cố thường gặp](#phần-f--xử-lý-sự-cố-thường-gặp)
- [Phần G – Dùng Claude Code để hỗ trợ triển khai](#phần-g--dùng-claude-code-để-hỗ-trợ)
- [Phụ lục – Cấu trúc mã nguồn và phân quyền](#phụ-lục)

---

## PHẦN A – HIỂU NHANH HỆ THỐNG

```
 Trình duyệt của nhân viên  ──►  Nginx (cổng 80/443)  ──►  Ứng dụng Node.js (cổng 3000, nội bộ)  ──►  SQLite (/var/lib/ptkt/ptkt.db)
                                  "người gác cổng"            "bộ não" – server.js                    "kho dữ liệu" – 1 file
```

| Thành phần | Vai trò | Nằm ở đâu trên máy chủ |
|---|---|---|
| **Giao diện web** | Các màn hình Dashboard, Tổng quan dự án, Tải tuần, Nhập theo tuần, Kế hoạch dự án, Cài đặt | `/opt/ptkt/public/index.html` |
| **Ứng dụng (server.js)** | Đăng nhập, phân quyền, đọc/ghi dữ liệu, cập nhật tức thời cho mọi người | `/opt/ptkt/server.js` |
| **Cơ sở dữ liệu SQLite** | Lưu toàn bộ dữ liệu: nhân sự, dự án, đầu việc, dữ liệu tuần, tài khoản | `/var/lib/ptkt/ptkt.db` |
| **Nginx** | Nhận truy cập từ trình duyệt, chuyển vào ứng dụng; gắn HTTPS nếu có tên miền | `/etc/nginx/sites-available/ptkt` |
| **systemd** | Tự chạy ứng dụng khi máy chủ khởi động, tự bật lại nếu ứng dụng lỗi | `/etc/systemd/system/ptkt.service` |
| **Sao lưu tự động** | Mỗi đêm 1h30 chép cơ sở dữ liệu ra file nén, giữ 30 ngày | `/var/backups/ptkt/` |

**Phân quyền:**

| Vai trò | Được làm gì |
|---|---|
| **Trưởng phòng (admin)** | Mọi việc: kế hoạch dự án, cài đặt, quy trình, tài khoản, sao lưu/khôi phục, nhập tuần thay người khác |
| **Nhân viên (member)** | Xem toàn bộ báo cáo; **chỉ nhập/sửa dữ liệu “Nhập theo tuần” của chính mình** |

**Dữ liệu ban đầu:** lần chạy đầu tiên, ứng dụng tự nạp toàn bộ dữ liệu hiện có (8 nhân sự, 16 dự án, 247 đầu việc, quy trình chuẩn Triển khai/Thầu/Tư vấn, các dòng tuần 28/09/2026) từ file `seed/seed.json`. Từ đó trở đi, dữ liệu nằm trong cơ sở dữ liệu trên máy chủ.

---

## PHẦN B – CHUẨN BỊ

### B1. Máy chủ (nhờ bộ phận IT cấp)

| Hạng mục | Yêu cầu tối thiểu | Khuyến nghị |
|---|---|---|
| Hệ điều hành | Ubuntu Server 22.04 LTS | **Ubuntu Server 24.04 LTS** |
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Ổ đĩa | 10 GB | 20 GB |
| Mạng | Có IP nội bộ cố định (ví dụ `10.10.20.15`) | Thêm tên miền nội bộ, ví dụ `congviec.ngsi.vn` |
| Quyền | 1 tài khoản có quyền `sudo` | |
| Cổng mở | 22 (SSH – chỉ cho IT/quản trị), 80 (HTTP) | thêm 443 (HTTPS) nếu có tên miền |
| Truy cập Internet | Cần trong lúc cài đặt (tải Node.js, thư viện) | |

> **Gửi IT nguyên văn:** “Cần 1 VM Ubuntu Server 24.04, 2 vCPU, 2 GB RAM, 20 GB disk, IP nội bộ cố định, mở cổng 80 (và 443 nếu có tên miền) cho mạng công ty, cấp 1 tài khoản sudo và SSH. VM cần ra Internet trong lúc cài đặt.”

### B2. Trên máy tính Windows của bạn

1. **File mã nguồn** `ptkt-app.zip` (đi kèm tài liệu này). Lưu vào thư mục `Downloads`.
2. **Công cụ dòng lệnh:** Windows 10/11 đã có sẵn *Windows PowerShell* (bấm phím Windows, gõ `PowerShell`, Enter).
3. *(Tuỳ chọn, cho người thích giao diện kéo-thả)* **WinSCP** (https://winscp.net) để chép file lên máy chủ.

### B3. Thông tin cần ghi lại trước khi bắt đầu

| Thông tin | Ví dụ | Của bạn |
|---|---|---|
| IP máy chủ | `10.10.20.15` | ……………… |
| Tài khoản SSH | `admin` | ……………… |
| Mật khẩu SSH | | ……………… |
| Tên miền (nếu có) | `congviec.ngsi.vn` | ……………… |

Trong tài liệu, mọi chỗ ghi **`10.10.20.15`** và **`admin`** bạn thay bằng IP và tài khoản thật của bạn.

---

## PHẦN C – CÀI ĐẶT TỪNG BƯỚC

> **Quy ước:**
> - Khung có dòng đầu `# Trên máy Windows (PowerShell)` → gõ trên máy tính của bạn.
> - Khung còn lại → gõ trên máy chủ (sau khi đã SSH vào ở Bước 1).
> - Cách dán vào cửa sổ dòng lệnh: **chuột phải** (PowerShell) hoặc **Ctrl+Shift+V**.
> - Khi gõ `sudo`, máy hỏi mật khẩu: gõ mật khẩu SSH (màn hình **không hiện ký tự** – đó là bình thường), Enter.

---

### Bước 1 – Kết nối vào máy chủ (SSH)

```powershell
# Trên máy Windows (PowerShell)
ssh admin@10.10.20.15
```

Lần đầu sẽ hỏi `Are you sure you want to continue connecting (yes/no)?` → gõ `yes`, Enter. Sau đó nhập mật khẩu.

**Kiểm tra:** dấu nhắc lệnh đổi thành dạng `admin@ten-may-chu:~$`. Bạn đang ở trong máy chủ.

> Mọi bước tiếp theo (trừ Bước 5) đều gõ trong cửa sổ này.

---

### Bước 2 – Cập nhật hệ thống và cài các gói cần thiết

```bash
sudo apt update
sudo apt -y upgrade
sudo apt -y install curl unzip nginx sqlite3 build-essential python3 ca-certificates
```

Giải thích: `nginx` là người gác cổng web; `sqlite3` dùng cho sao lưu; `build-essential`, `python3` phòng khi cần biên dịch thư viện cơ sở dữ liệu.

**Kiểm tra:**
```bash
nginx -v
sqlite3 --version
```
Mỗi lệnh in ra một số phiên bản là được.

---

### Bước 3 – Cài Node.js 22 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs
```

**Kiểm tra:**
```bash
node -v
npm -v
```
Phải thấy `v22.x.x` (hoặc từ `v20.6` trở lên) và một số phiên bản npm.

---

### Bước 4 – Tạo tài khoản hệ thống và thư mục cho ứng dụng

Ứng dụng chạy dưới một tài khoản riêng tên `ptkt` (không có quyền đăng nhập) để an toàn.

```bash
sudo useradd --system --home /opt/ptkt --shell /usr/sbin/nologin ptkt
sudo mkdir -p /opt/ptkt /var/lib/ptkt /var/backups/ptkt
sudo chown ptkt:ptkt /var/lib/ptkt
sudo chmod 750 /var/lib/ptkt
```

| Thư mục | Chứa gì |
|---|---|
| `/opt/ptkt` | Mã nguồn ứng dụng |
| `/var/lib/ptkt` | Cơ sở dữ liệu (quan trọng nhất) |
| `/var/backups/ptkt` | Các bản sao lưu hằng ngày |

**Kiểm tra:** `id ptkt` in ra `uid=… (ptkt) gid=… (ptkt)`.

---

### Bước 5 – Đưa mã nguồn lên máy chủ

**Cách 1 – Dòng lệnh (mở một cửa sổ PowerShell MỚI trên máy Windows, giữ nguyên cửa sổ SSH):**

```powershell
# Trên máy Windows (PowerShell)
cd $HOME\Downloads
scp .\ptkt-app.zip admin@10.10.20.15:/tmp/
```

**Cách 2 – WinSCP:** mở WinSCP → New Site → File protocol `SFTP`, Host `10.10.20.15`, User/Password → Login → kéo file `ptkt-app.zip` từ cột trái (máy bạn) sang thư mục `/tmp` ở cột phải (máy chủ).

Quay lại **cửa sổ SSH**, giải nén vào `/opt/ptkt`:

```bash
cd /tmp
unzip -o ptkt-app.zip
sudo cp -r /tmp/ptkt-app/. /opt/ptkt/
ls /opt/ptkt
```

**Kiểm tra:** lệnh `ls` liệt kê: `deploy  HUONG-DAN-TRIEN-KHAI.md  package.json  package-lock.json  public  scripts  seed  server.js` (và `.env.example`, ẩn).

---

### Bước 6 – Cài thư viện của ứng dụng

```bash
cd /opt/ptkt
sudo npm ci --omit=dev
```

Lệnh chạy khoảng 30 giây – 2 phút.

**Kiểm tra:** cuối màn hình có dòng `added … packages` và **không** có chữ `ERR!`. Nếu có lỗi liên quan `better-sqlite3`, xem Phần F mục 1.

---

### Bước 7 – Tạo file cấu hình `.env`

1. Tạo chuỗi bí mật ngẫu nhiên (dùng để ký phiên đăng nhập):

```bash
openssl rand -hex 32
```
Máy in ra một chuỗi 64 ký tự, ví dụ `9f3c1a…e7`. **Bôi đen và sao chép chuỗi đó.**

2. Tạo file cấu hình từ mẫu và mở để sửa:

```bash
cd /opt/ptkt
sudo cp .env.example .env
sudo nano .env
```

3. Trong trình soạn thảo `nano`, sửa dòng `JWT_SECRET=...` thành chuỗi vừa sao chép, ví dụ:

```
PORT=3000
HOST=127.0.0.1
DATA_DIR=/var/lib/ptkt
JWT_SECRET=9f3c1a....................................................e7
COOKIE_SECURE=false
SESSION_DAYS=30
```

- `COOKIE_SECURE=false`: dùng khi truy cập bằng `http://` (mạng nội bộ). **Chỉ đổi thành `true` sau khi đã bật HTTPS ở Bước 13.**
- Lưu file: nhấn **Ctrl+O**, Enter; thoát: **Ctrl+X**.

4. Khoá quyền đọc file cấu hình:

```bash
sudo chown root:ptkt /opt/ptkt/.env
sudo chmod 640 /opt/ptkt/.env
```

**Kiểm tra:** `sudo cat /opt/ptkt/.env` hiển thị đúng nội dung, JWT_SECRET là chuỗi dài 64 ký tự.

---

### Bước 8 – Chạy thử ứng dụng

```bash
cd /opt/ptkt
sudo -u ptkt node --env-file=.env server.js
```

**Kiểm tra:** màn hình hiện:

```
[seed] Đã nạp 24 tài liệu dữ liệu ban đầu.
[ptkt] Đang chạy tại http://127.0.0.1:3000  (dữ liệu: /var/lib/ptkt)
[ptkt] Chưa có tài khoản trưởng phòng. Chạy: npm run user -- create
```

Dòng `[seed]` chỉ xuất hiện ở lần chạy đầu tiên. Nhấn **Ctrl+C** để dừng (lát nữa systemd sẽ chạy nó tự động).

---

### Bước 9 – Tạo tài khoản Trưởng phòng (admin)

```bash
cd /opt/ptkt
sudo -u ptkt node --env-file=.env scripts/manage-user.js create
```

Trả lời lần lượt:

| Câu hỏi | Gõ |
|---|---|
| Tên đăng nhập | ví dụ `trp.kythuat` (chữ không dấu, số, dấu `.` `_` `-`) |
| Tên hiển thị | ví dụ `Trưởng phòng Kỹ thuật` |
| Vai trò | `1` (Trưởng phòng) |
| Gắn với nhân sự số mấy | Enter để bỏ qua (hoặc gõ số nếu trưởng phòng cũng nhập tuần) |
| Mật khẩu / Nhập lại | mật khẩu ≥ 8 ký tự (màn hình không hiện ký tự) |

**Kiểm tra:**
```bash
sudo -u ptkt node --env-file=.env scripts/manage-user.js list
```
Bảng hiện tài khoản vừa tạo với vai trò `admin`.

> Tài khoản nhân viên sẽ tạo trên giao diện web ở Phần D – không cần dòng lệnh.

---

### Bước 10 – Cho ứng dụng tự chạy bằng systemd

```bash
sudo cp /opt/ptkt/deploy/ptkt.service /etc/systemd/system/ptkt.service
sudo systemctl daemon-reload
sudo systemctl enable --now ptkt
```

**Kiểm tra:**
```bash
sudo systemctl status ptkt --no-pager
curl -s http://127.0.0.1:3000/api/health
```
- Dòng `Active:` phải là **`active (running)`** màu xanh.
- Lệnh `curl` trả về `{"ok":true,"time":"…"}`.

Từ giờ, máy chủ khởi động lại thì ứng dụng tự chạy; ứng dụng lỗi thì sau 3 giây tự bật lại.

---

### Bước 11 – Cấu hình Nginx (cổng web 80)

```bash
sudo cp /opt/ptkt/deploy/nginx-ptkt.conf /etc/nginx/sites-available/ptkt
sudo ln -sf /etc/nginx/sites-available/ptkt /etc/nginx/sites-enabled/ptkt
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

*(Nếu có tên miền: `sudo nano /etc/nginx/sites-available/ptkt`, sửa dòng `server_name _;` thành `server_name congviec.ngsi.vn;`, lưu, rồi chạy lại 2 lệnh cuối.)*

**Kiểm tra:** `sudo nginx -t` báo `syntax is ok` và `test is successful`.

---

### Bước 12 – Mở tường lửa

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

**Kiểm tra:** danh sách có `OpenSSH ALLOW` và `Nginx Full ALLOW`.

> ⚠ Luôn chạy `ufw allow OpenSSH` **trước** `ufw enable`, nếu không bạn có thể bị khoá ngoài SSH. Nếu công ty dùng tường lửa riêng (do IT quản lý), nhờ IT mở cổng 80/443 tới VM.

---

### Bước 13 – Mở trên trình duyệt

Trên máy tính trong mạng công ty, mở Chrome/Edge và vào:

```
http://10.10.20.15
```
(hoặc `http://congviec.ngsi.vn` nếu có tên miền)

**Kiểm tra:**
1. Thấy màn hình đăng nhập **NGSI – Phòng Kỹ thuật**.
2. Đăng nhập bằng tài khoản trưởng phòng ở Bước 9.
3. Vào **Dashboard**, **Tổng quan dự án** – thấy đủ 16 dự án và dữ liệu đã chuyển từ Excel.
4. Góc dưới thanh bên hiện chấm xanh **“Đã kết nối máy chủ”**.

🎉 **Hệ thống đã chạy.**

---

### Bước 13b *(tuỳ chọn, khuyến nghị nếu có tên miền)* – Bật HTTPS

**Trường hợp tên miền công khai trên Internet** (Let’s Encrypt, miễn phí, tự gia hạn):

```bash
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d congviec.ngsi.vn
```
Làm theo câu hỏi (nhập email, đồng ý điều khoản, chọn chuyển hướng HTTP → HTTPS).

**Trường hợp tên miền nội bộ:** nhờ IT cấp chứng chỉ nội bộ của công ty (2 file `.crt` và `.key`) và cấu hình vào Nginx.

Sau khi HTTPS chạy, bật cookie an toàn:

```bash
sudo sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE=true/' /opt/ptkt/.env
sudo systemctl restart ptkt
```

**Kiểm tra:** mở `https://congviec.ngsi.vn`, trình duyệt hiện biểu tượng ổ khoá, đăng nhập bình thường.

> Nếu vẫn dùng `http://` mà lỡ đặt `COOKIE_SECURE=true`, bạn sẽ đăng nhập thành công nhưng bị đẩy ra ngay → đổi lại `false`.

---

## PHẦN D – ĐƯA VÀO SỬ DỤNG CHO CẢ PHÒNG

### D1. Kiểm tra lại danh sách nhân sự
**Cài đặt → Nhân sự & capacity**: đúng họ tên, giờ/tuần, % họp, hệ số năng lực.

### D2. Tạo tài khoản cho từng nhân viên
**Cài đặt → Tài khoản đăng nhập → “+ Tài khoản”**:

| Ô | Điền |
|---|---|
| Tên đăng nhập | ví dụ `lam.ph` |
| Tên hiển thị | `Phạm Hồng Lâm` |
| Gắn với nhân sự | chọn **đúng tên** trong danh sách (bắt buộc để nhân viên nhập theo tuần) |
| Vai trò | Nhân viên |
| Mật khẩu | mật khẩu tạm ≥ 8 ký tự |

Gợi ý bảng gửi cho nhân viên:

| Họ tên | Tên đăng nhập | Mật khẩu tạm |
|---|---|---|
| Phạm Hồng Lâm | lam.ph | ******** |
| … | … | … |

### D3. Gửi cho nhân viên
- Đường link: `http://10.10.20.15` (hoặc tên miền).
- Tên đăng nhập + mật khẩu tạm.
- File “Hướng dẫn sử dụng” (Word) đã gửi trước đó.
- Nhắc: **đăng nhập lần đầu → bấm “Đổi mật khẩu”** ở góc dưới thanh bên.

### D4. Quy trình hằng tuần
| Ai | Khi nào | Làm gì |
|---|---|---|
| Nhân viên | Thứ 2 | **Nhập theo tuần**: thêm việc, chấm quy mô trong tuần, trạng thái cuối tuần, ma sát nếu vướng |
| Trưởng phòng | Thứ 2–3 | **Tải tuần** + **Dashboard**: điều phối người quá tải, xử lý “Việc cần TRP can thiệp ngay” |
| Trưởng phòng | Khi có dự án mới | **Kế hoạch dự án → + Dự án mới** (tự tạo đầu việc theo quy trình), điền deadline HĐ, người phụ trách |
| Ban lãnh đạo | Họp giao ban | **Dashboard → Trình chiếu**, chọn Tuần/Tháng/Quý |

Mọi thay đổi hiển thị **ngay lập tức** cho tất cả người đang mở trang, không cần tải lại.

---

## PHẦN E – VẬN HÀNH HẰNG NGÀY

### E1. Bật sao lưu tự động hằng đêm (làm 1 lần)

```bash
sudo chmod +x /opt/ptkt/scripts/backup.sh
sudo /opt/ptkt/scripts/backup.sh
ls -lh /var/backups/ptkt
```
Thấy file `ptkt-YYYYMMDD-HHMM.db.gz` là sao lưu chạy được. Đặt lịch chạy lúc 1h30 mỗi đêm:

```bash
(sudo crontab -l 2>/dev/null; echo "30 1 * * * /opt/ptkt/scripts/backup.sh >> /var/log/ptkt-backup.log 2>&1") | sudo crontab -
sudo crontab -l
```

**Kiểm tra:** `sudo crontab -l` có dòng `30 1 * * * /opt/ptkt/scripts/backup.sh …`. Sáng hôm sau `ls /var/backups/ptkt` có thêm file mới.

### E2. Sao lưu ra ngoài máy chủ (rất nên làm)
Sao lưu trên cùng máy chủ không cứu được khi VM hỏng. Chọn một cách:
- Nhờ IT bật **snapshot/backup VM** hằng ngày cho máy chủ này; **hoặc**
- Mỗi tuần chép thư mục `/var/backups/ptkt` về máy khác / ổ mạng:
  ```powershell
  # Trên máy Windows (PowerShell)
  scp -r admin@10.10.20.15:/var/backups/ptkt D:\SaoLuu\ptkt
  ```
- Ngoài ra, trưởng phòng có thể tải file sao lưu bất kỳ lúc nào: **Cài đặt → Dữ liệu → Tải file sao lưu (.json)**.

### E3. Khôi phục dữ liệu
**Cách 1 – từ file `.json` (trên web):** Cài đặt → Dữ liệu → **Khôi phục từ file sao lưu…** → chọn file. ⚠ Thay **toàn bộ** dữ liệu hiện tại cho cả phòng (tài khoản đăng nhập không bị ảnh hưởng).

**Cách 2 – từ bản sao lưu hằng đêm (`.db.gz`):**
```bash
sudo systemctl stop ptkt
sudo cp /var/lib/ptkt/ptkt.db /var/lib/ptkt/ptkt.db.truoc-khi-khoi-phuc
ls /var/backups/ptkt                       # chọn bản muốn khôi phục
sudo gunzip -c /var/backups/ptkt/ptkt-20261001-0130.db.gz | sudo tee /var/lib/ptkt/ptkt.db > /dev/null
sudo rm -f /var/lib/ptkt/ptkt.db-wal /var/lib/ptkt/ptkt.db-shm
sudo chown ptkt:ptkt /var/lib/ptkt/ptkt.db
sudo systemctl start ptkt
```
(Cách 2 khôi phục cả tài khoản đăng nhập về thời điểm sao lưu.)

### E4. Các lệnh thường dùng

| Việc | Lệnh |
|---|---|
| Xem ứng dụng có đang chạy | `sudo systemctl status ptkt --no-pager` |
| Khởi động lại ứng dụng | `sudo systemctl restart ptkt` |
| Xem nhật ký (log) trực tiếp | `sudo journalctl -u ptkt -f` (thoát: Ctrl+C) |
| Xem 100 dòng log gần nhất | `sudo journalctl -u ptkt -n 100 --no-pager` |
| Danh sách tài khoản | `cd /opt/ptkt && sudo -u ptkt node --env-file=.env scripts/manage-user.js list` |
| Quên mật khẩu trưởng phòng | `cd /opt/ptkt && sudo -u ptkt node --env-file=.env scripts/manage-user.js reset-password` |
| Khoá tài khoản nghỉ việc | Cài đặt → Tài khoản → chọn người → Trạng thái **Khoá** (hoặc `… manage-user.js disable <tên>`) |
| Xem ai sửa gì gần đây | `sudo sqlite3 /var/lib/ptkt/ptkt.db "SELECT datetime(ts/1000,'unixepoch','localtime'),username,action,path FROM audit ORDER BY id DESC LIMIT 30;"` |
| Dung lượng dữ liệu | `du -sh /var/lib/ptkt /var/backups/ptkt` |

### E5. Cập nhật lên phiên bản mới
Khi có file `ptkt-app.zip` mới:

```bash
# 1. Sao lưu trước
sudo /opt/ptkt/scripts/backup.sh
# 2. Đưa file zip mới lên /tmp (như Bước 5), rồi:
cd /tmp && rm -rf ptkt-app && unzip -o ptkt-app.zip
sudo rsync -a --exclude '.env' --exclude 'node_modules' --exclude 'data' /tmp/ptkt-app/ /opt/ptkt/
cd /opt/ptkt && sudo npm ci --omit=dev
sudo systemctl restart ptkt
sudo systemctl status ptkt --no-pager
```
`.env` và dữ liệu (`/var/lib/ptkt`) **không bị đụng tới**. File `seed/seed.json` chỉ dùng khi cơ sở dữ liệu trống nên cập nhật không ghi đè dữ liệu đang dùng.

*(Nếu máy chủ chưa có `rsync`: `sudo apt -y install rsync`.)*

### E6. Bảo trì hệ điều hành (mỗi tháng)
```bash
sudo apt update && sudo apt -y upgrade
sudo reboot
```
Sau khi máy chủ khởi động lại (1–2 phút), ứng dụng tự chạy lại.

---

## PHẦN F – XỬ LÝ SỰ CỐ THƯỜNG GẶP

| # | Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|---|
| 1 | `npm ci` báo lỗi `better-sqlite3` / `node-gyp` | Thiếu công cụ biên dịch hoặc VM không ra Internet | `sudo apt -y install build-essential python3` rồi chạy lại `sudo npm ci --omit=dev`. Kiểm tra Internet: `curl -I https://registry.npmjs.org` |
| 2 | `systemctl status ptkt` báo `failed` | Lỗi cấu hình | Xem log: `sudo journalctl -u ptkt -n 50 --no-pager`. Nếu thấy `JWT_SECRET … ít nhất 32 ký tự` → làm lại Bước 7 |
| 3 | Log báo `SQLITE_CANTOPEN` / `permission denied` | Thư mục dữ liệu sai quyền | `sudo chown -R ptkt:ptkt /var/lib/ptkt && sudo systemctl restart ptkt` |
| 4 | Trình duyệt báo **502 Bad Gateway** | Ứng dụng chưa chạy | `sudo systemctl restart ptkt`, rồi xem mục 2 |
| 5 | Trình duyệt không mở được trang (quay mãi / từ chối kết nối) | Tường lửa / IT chặn cổng 80 | Kiểm tra `sudo ufw status`; nhờ IT mở cổng 80 tới VM; thử trên máy chủ: `curl -I http://127.0.0.1` |
| 6 | Đăng nhập xong bị đẩy ra màn hình đăng nhập ngay | `COOKIE_SECURE=true` nhưng đang dùng `http://` | Đặt `COOKIE_SECURE=false` trong `.env`, `sudo systemctl restart ptkt` |
| 7 | “Sai quá nhiều lần. Thử lại sau 15 phút.” | Gõ sai mật khẩu 10 lần | Chờ 15 phút, hoặc `sudo systemctl restart ptkt` để xoá bộ đếm |
| 8 | Nhân viên báo “Tài khoản chưa gắn với nhân sự” | Tài khoản chưa chọn nhân sự | Trưởng phòng: Cài đặt → Tài khoản → chọn người → “Gắn với nhân sự” |
| 9 | Nhân viên báo “Bạn không có quyền sửa phần này” | Đang nhập tuần cho người khác / sửa kế hoạch | Đúng thiết kế. Trưởng phòng nhập thay nếu cần |
| 10 | Góc dưới hiện “Mất kết nối – đang thử lại…” | Mạng chập chờn hoặc ứng dụng đang khởi động lại | Tự kết nối lại sau vài giây; nếu kéo dài xem mục 2, 4 |
| 11 | Số liệu không tự cập nhật giữa các máy | Nginx đang đệm kênh `/api/events` | Đảm bảo dùng đúng file `deploy/nginx-ptkt.conf` (có `proxy_buffering off`), `sudo nginx -t && sudo systemctl reload nginx` |
| 12 | Quên mật khẩu trưởng phòng | | `cd /opt/ptkt && sudo -u ptkt node --env-file=.env scripts/manage-user.js reset-password` |
| 13 | Ổ đĩa đầy | Log/sao lưu tích tụ | `df -h`; giảm `KEEP_DAYS` trong `scripts/backup.sh`; `sudo journalctl --vacuum-time=30d` |

---

## PHẦN G – DÙNG CLAUDE CODE ĐỂ HỖ TRỢ

Claude Code là trợ lý lập trình chạy trong cửa sổ dòng lệnh. Bạn có thể dùng nó để (1) **triển khai thay bạn** trên máy chủ, hoặc (2) **sửa/thêm tính năng** cho ứng dụng sau này.

### G1. Cài Claude Code trên máy chủ (sau Bước 3)
```bash
sudo npm install -g @anthropic-ai/claude-code
cd /opt/ptkt
claude
```
Lần đầu chạy, làm theo hướng dẫn đăng nhập tài khoản Claude (Pro/Max/Team) trên màn hình. Xem tài liệu chính thức: https://docs.claude.com/en/docs/claude-code/overview

### G2. Câu lệnh mẫu giao cho Claude Code
Gõ trong Claude Code (đang đứng ở thư mục `/opt/ptkt`):

- **Triển khai tự động:**
  > Đọc file HUONG-DAN-TRIEN-KHAI.md và thực hiện từ Bước 4 đến Bước 12 trên máy chủ này. Dừng lại hỏi tôi trước mỗi lệnh có `sudo`. Ở Bước 9 để tôi tự nhập mật khẩu.

- **Kiểm tra sức khoẻ hệ thống:**
  > Kiểm tra dịch vụ ptkt, nginx, tường lửa, sao lưu cron và dung lượng ổ đĩa. Báo cáo ngắn gọn những gì chưa ổn.

- **Thêm tính năng:**
  > Trong public/index.html, thêm nút xuất Dashboard ra PDF. Giữ nguyên phong cách giao diện. Sau khi sửa, khởi động lại dịch vụ ptkt và cho tôi biết cách kiểm tra.

- **Sửa lỗi:**
  > Người dùng báo lỗi: <mô tả>. Xem log `journalctl -u ptkt -n 200` và mã nguồn để tìm nguyên nhân, đề xuất cách sửa trước khi sửa.

> Luôn chạy sao lưu (`sudo /opt/ptkt/scripts/backup.sh`) trước khi để Claude Code sửa mã nguồn trên máy chủ thật. Tốt hơn nữa: thử trên một VM thử nghiệm trước.

### G3. Quản lý mã nguồn bằng Git (khuyến nghị khi bắt đầu sửa đổi)
```bash
cd /opt/ptkt
sudo git init && sudo git add -A && sudo git commit -m "Phiên bản 1.0"
```
File `.gitignore` đã loại trừ `.env`, `node_modules`, `data/` nên mật khẩu và dữ liệu không bị đưa vào Git.

---

## PHỤ LỤC

### P1. Cấu trúc mã nguồn

Xem chi tiết từng file trong **`HUONG-DAN-PHAT-TRIEN.md` – mục 3 “Bản đồ mã nguồn”**. Tóm tắt:

```
ptkt-app/
├── server.js            Máy chủ: đăng nhập, phân quyền (RULES), API, cập nhật tức thời
├── public/              Giao diện: index.html, css/ (theme, base, dashboard), js/ (core, views, modules)
├── seed/seed.json       Dữ liệu ban đầu (chỉ nạp khi CSDL trống)
├── scripts/             manage-user.js (tài khoản), backup.sh (sao lưu)
├── deploy/              ptkt.service (systemd), nginx-ptkt.conf
├── examples/risks/      Module mẫu “Rủi ro dự án”
├── CLAUDE.md            Ngữ cảnh cho Claude Code
├── HUONG-DAN-TRIEN-KHAI.md
└── HUONG-DAN-PHAT-TRIEN.md
```

### P2. Cơ sở dữ liệu (`/var/lib/ptkt/ptkt.db`)

| Bảng | Nội dung |
|---|---|
| `docs` | Dữ liệu nghiệp vụ dạng tài liệu JSON: `config/staff` (nhân sự), `config/catalog` (đầu việc chuẩn), `projects/<mã>` (dự án + toàn bộ đầu việc), `weeks/<thứ 2 của tuần>__<tên>` (dữ liệu nhập tuần của 1 người) |
| `users` | Tài khoản: tên đăng nhập, mật khẩu đã mã hoá (bcrypt), tên hiển thị, nhân sự gắn kèm, vai trò, trạng thái |
| `audit` | Nhật ký: ai, lúc nào, đăng nhập / sửa / xoá tài liệu nào |

### P3. API (cho người phát triển)

| Phương thức | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| POST | `/api/login` | – | Đăng nhập (`username`, `password`) |
| POST | `/api/logout` | – | Đăng xuất |
| GET | `/api/me` | đã đăng nhập | Thông tin tài khoản hiện tại |
| POST | `/api/me/password` | đã đăng nhập | Đổi mật khẩu (`current`, `next`) |
| GET | `/api/collection/:coll` | đã đăng nhập | Đọc `config` / `projects` / `weeks` (tuỳ chọn `?field=week&gte=YYYY-MM-DD`) |
| PUT | `/api/doc/:coll/:id` | admin; member chỉ `weeks` của mình | Ghi tài liệu |
| DELETE | `/api/doc/:coll/:id` | như trên | Xoá tài liệu |
| GET | `/api/events` | đã đăng nhập | Kênh cập nhật tức thời (Server-Sent Events) |
| GET | `/api/backup` | admin | Tải toàn bộ dữ liệu (JSON) |
| POST | `/api/restore` | admin | Khôi phục từ JSON |
| GET/POST/PATCH | `/api/users`, `/api/users/:id` | admin | Quản lý tài khoản |
| GET | `/api/health` | – | Kiểm tra máy chủ còn sống |

### P4. Bảo mật đã có sẵn
- Mật khẩu lưu dạng băm **bcrypt**, không lưu mật khẩu gốc.
- Phiên đăng nhập bằng cookie `HttpOnly` (JavaScript không đọc được), có hạn 30 ngày; đổi mật khẩu / khoá tài khoản làm mọi phiên cũ hết hiệu lực ngay.
- Chặn đoán mật khẩu: tối đa 10 lần sai / 15 phút / địa chỉ IP.
- Ứng dụng chỉ lắng nghe `127.0.0.1` – bên ngoài chỉ vào được qua Nginx.
- Dịch vụ chạy dưới tài khoản hệ thống riêng `ptkt`, không có quyền đăng nhập, chỉ ghi được vào `/var/lib/ptkt`.
- Phân quyền kiểm tra tại **máy chủ** (không chỉ ẩn nút trên giao diện).

### P5. Danh sách kiểm tra sau khi triển khai

- [ ] `systemctl status ptkt` → active (running)
- [ ] Mở được trang từ máy khác trong mạng công ty
- [ ] Đăng nhập trưởng phòng được; thấy đủ dự án
- [ ] Đã tạo tài khoản & gắn nhân sự cho tất cả nhân viên
- [ ] Thử: nhân viên A nhập tuần → màn hình trưởng phòng tự cập nhật
- [ ] Thử: nhân viên A **không** sửa được kế hoạch, cài đặt, dữ liệu tuần của người khác
- [ ] `ls /var/backups/ptkt` có file sao lưu; `sudo crontab -l` có lịch 1h30
- [ ] Đã có phương án sao lưu ra ngoài máy chủ (snapshot VM hoặc chép định kỳ)
- [ ] (Nếu có tên miền) HTTPS chạy, `COOKIE_SECURE=true`
