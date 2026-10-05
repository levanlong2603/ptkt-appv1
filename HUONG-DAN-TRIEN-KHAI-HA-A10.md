# HƯỚNG DẪN TRIỂN KHAI 2 MÁY CHỦ SAU A10 (SERVER3 + SERVER4)
## NGSI · Phòng Kỹ thuật – Quản trị công việc và nguồn lực

Tài liệu này hướng dẫn cài ứng dụng lên **SERVER3 (192.168.20.11)** và **SERVER4 (192.168.20.12)** trong VLAN 20, chạy dự phòng sau cặp cân bằng tải **A10-01/A10-02**, truy cập qua **VIP 192.168.20.100**.

Đây là **bản bổ sung** cho `HUONG-DAN-TRIEN-KHAI.md` (cài 1 máy) và `HUONG-DAN-CHUYEN-MARIADB.md`. Hai tài liệu kia vẫn đúng cho phần cài ứng dụng trên từng máy; tài liệu này nói rõ **cái gì làm khác đi khi có 2 máy**.

> **Đọc Phần A trước khi gõ lệnh.** Có một đặc điểm của ứng dụng quyết định toàn bộ thiết kế – bỏ qua sẽ dẫn đến dữ liệu hiển thị sai giữa các người dùng.

---

## MỤC LỤC

- [Phần A – Thiết kế và lý do](#phần-a--thiết-kế-và-lý-do)
- [Phần B – Chuẩn bị](#phần-b--chuẩn-bị)
- [Phần C – Cài đặt (Bước 1 → 9)](#phần-c--cài-đặt)
- [Phần D – Cấu hình A10](#phần-d--cấu-hình-a10)
- [Phần E – Kiểm thử nghiệm thu](#phần-e--kiểm-thử-nghiệm-thu)
- [Phần F – Vận hành: sao lưu, cập nhật, chuyển đổi dự phòng](#phần-f--vận-hành)
- [Phần G – Xử lý sự cố riêng của mô hình 2 máy](#phần-g--xử-lý-sự-cố)

---

## PHẦN A – THIẾT KẾ VÀ LÝ DO

### A1. Sơ đồ

```
                    Người dùng  ──HTTPS 443──►  VIP 192.168.20.100  (A10-01 / A10-02, VRRP-A)
                                                        │  giải mã SSL, chèn X-Forwarded-For
                                                        │  gửi HTTP 80 xuống máy chủ
                        ┌───────────────────────────────┴───────────────────────────┐
                        ▼ (ưu tiên cao – nhận 100%)                                  ▼ (dự phòng)
              SERVER3  192.168.20.11                                      SERVER4  192.168.20.12
              ┌────────────────────────┐                                  ┌────────────────────────┐
              │ Nginx :80              │                                  │ Nginx :80              │
              │ Node.js :3000 (ptkt)   │                                  │ Node.js :3000 (ptkt)   │
              │ MariaDB :3306          │◄──── nhân bản 2 chiều :3306 ────►│ MariaDB :3306          │
              └────────────────────────┘                                  └────────────────────────┘
```

| Lớp | Mô hình | Vì sao |
|---|---|---|
| **Ứng dụng** | **Active / Standby** – A10 đẩy toàn bộ về SERVER3; SERVER4 chỉ nhận khi SERVER3 hỏng | xem A2 |
| **Cơ sở dữ liệu** | **Master–Master** – MariaDB chạy trên cả 2 máy, nhân bản hai chiều | mất 1 máy vẫn còn đủ dữ liệu để chạy ngay, không cần khôi phục từ file sao lưu |
| **SSL** | A10 giải mã (offload); máy chủ chỉ chạy HTTP 80 nội bộ | chứng chỉ quản lý tập trung một chỗ |

### A2. Vì sao Active/Standby chứ không chia tải 50/50

Ứng dụng đẩy cập nhật tức thời cho mọi người bằng **Server-Sent Events**. Danh sách người đang mở trang nằm **trong bộ nhớ của chính tiến trình Node.js** (`server.js` – biến `clients` và hàm `broadcast()`).

Hậu quả nếu cho cả 2 máy cùng nhận tải:

> Chị A đang nối vào SERVER3, anh B nối vào SERVER4. Chị A nhập dữ liệu tuần → SERVER3 ghi vào CSDL và báo cho **những người đang nối vào SERVER3**. Anh B **không nhận được gì** – màn hình của anh B vẫn hiện số liệu cũ cho tới khi anh B tự bấm F5.

Bật *persistence* (dính phiên) trên A10 **không khắc phục được**, vì vấn đề nằm giữa hai người dùng khác nhau, không phải giữa các yêu cầu của cùng một người.

Vì vậy: **tại một thời điểm chỉ một máy phục vụ**. Với quy mô phòng (8–20 người) một máy thừa sức; máy thứ hai để chống hỏng máy, không để tăng hiệu năng.

*(Nếu sau này thực sự cần chia tải 50/50, phải sửa `server.js` để hai tiến trình báo sự kiện cho nhau. Chưa cần ở thời điểm này.)*

### A3. Những điểm bắt buộc phải khớp giữa 2 máy

| Hạng mục | Yêu cầu | Nếu sai thì sao |
|---|---|---|
| `JWT_SECRET` trong `.env` | **Giống hệt nhau** | Khi A10 chuyển sang SERVER4, tất cả mọi người bị đăng xuất |
| `COOKIE_SECURE` | `true` trên cả hai (vì VIP là HTTPS) | Đăng nhập xong bị đẩy ra ngay |
| `server_id`, `gtid_domain_id`, `auto_increment_offset` của MariaDB | **Khác nhau** giữa 2 máy | Nhân bản hỏng, trùng khoá `users.id` |
| Phiên bản mã nguồn | Giống nhau | Lỗi khó đoán sau khi chuyển đổi dự phòng |

---

## PHẦN B – CHUẨN BỊ

### B1. Thông tin cần có trước khi bắt đầu

| Thông tin | Giá trị trong sơ đồ | Của bạn |
|---|---|---|
| IP SERVER3 | `192.168.20.11` | ……………… |
| IP SERVER4 | `192.168.20.12` | ……………… |
| VIP ứng dụng | `192.168.20.100` | ……………… |
| Gateway VLAN 20 (Fortinet VE20) | `192.168.20.1` | ……………… |
| IP VE20 của A10-01 / A10-02 | `192.168.20.101` / `192.168.20.102` | ……………… |
| **Dải NAT nguồn (source NAT pool) A10 dùng khi gửi xuống máy chủ** | hỏi người quản trị A10 | ……………… |
| Tên miền nội bộ trỏ về VIP | ví dụ `congviec.ngsi.vn` | ……………… |
| Tài khoản SSH có quyền sudo trên 2 máy | | ……………… |

> **Dải NAT nguồn** là thông tin quan trọng nhất phải hỏi: tường lửa trên máy chủ sẽ chỉ mở cổng 80 cho dải này. Nếu A10 cấu hình `source-nat auto` thì nguồn chính là IP VE20 của A10 (`192.168.20.101`, `192.168.20.102`).

### B2. Yêu cầu máy chủ (mỗi máy)

Ubuntu Server 24.04 LTS · 2 vCPU · 4 GB RAM · 40 GB đĩa (cao hơn bản 1 máy vì mỗi máy vừa chạy ứng dụng vừa chạy CSDL) · IP tĩnh · ra được Internet trong lúc cài đặt.

### B3. Cổng cần mở

| Từ | Đến | Cổng | Mục đích |
|---|---|---|---|
| Người dùng | VIP 192.168.20.100 | 443 (và 80 để chuyển hướng) | Truy cập ứng dụng |
| A10 (dải NAT nguồn) | SERVER3, SERVER4 | 80/tcp | Cân bằng tải + kiểm tra sức khoẻ |
| SERVER3 ↔ SERVER4 | lẫn nhau | 3306/tcp | Nhân bản MariaDB |
| Máy quản trị | SERVER3, SERVER4 | 22/tcp | SSH |

### B4. Chuẩn bị file

Trên máy Windows, có sẵn `ptkt-app.zip`. Chép lên **cả hai máy**:

```powershell
# Trên máy Windows (PowerShell)
cd $HOME\Downloads
scp .\ptkt-app.zip admin@192.168.20.11:/tmp/
scp .\ptkt-app.zip admin@192.168.20.12:/tmp/
```

### B5. Sinh sẵn 3 chuỗi bí mật (làm 1 lần, trên SERVER3)

```bash
echo "JWT_SECRET    = $(openssl rand -hex 32)"
echo "DB_PASSWORD   = $(openssl rand -hex 24)"
echo "REPL_PASSWORD = $(openssl rand -hex 24)"
```

**Chép 3 dòng này ra giấy / trình quản lý mật khẩu.** Cả ba sẽ được dùng ở nhiều bước, trên cả hai máy, và phải giống nhau giữa hai máy.

---

## PHẦN C – CÀI ĐẶT

> **Quy ước:** mỗi khung lệnh ghi rõ chạy ở đâu:
> `# SERVER3` · `# SERVER4` · `# CẢ HAI MÁY` (gõ lần lượt trên từng máy).
> Mở **hai cửa sổ SSH song song**, một vào SERVER3, một vào SERVER4 – sẽ tiện hơn nhiều.

---

### Bước 1 – Cài hệ thống cơ bản trên cả hai máy

```bash
# CẢ HAI MÁY
sudo apt update && sudo apt -y upgrade
sudo apt -y install curl unzip rsync nginx mariadb-server build-essential python3 ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs
node -v && nginx -v && mariadb --version
```

**Kiểm tra:** in ra `v22.x`, một phiên bản nginx và một phiên bản MariaDB (10.11 trở lên).

```bash
# CẢ HAI MÁY – khoá MariaDB lại trước khi mở ra mạng
sudo mariadb-secure-installation
```
Trả lời: `n` (chưa có mật khẩu root – dùng unix_socket, giữ nguyên), `n` (không chuyển sang xác thực bằng mật khẩu), `Y` xoá tài khoản ẩn danh, `Y` cấm root đăng nhập từ xa, `Y` xoá CSDL test, `Y` nạp lại quyền.

---

### Bước 2 – Tạo tài khoản hệ thống và thư mục

```bash
# CẢ HAI MÁY
sudo useradd --system --home /opt/ptkt --shell /usr/sbin/nologin ptkt
sudo mkdir -p /opt/ptkt /var/lib/ptkt /var/backups/ptkt
sudo chown ptkt:ptkt /var/lib/ptkt
sudo chmod 750 /var/lib/ptkt
id ptkt
```

---

### Bước 3 – Đưa mã nguồn lên cả hai máy

```bash
# CẢ HAI MÁY
cd /tmp && rm -rf ptkt-app && unzip -o ptkt-app.zip
sudo cp -r /tmp/ptkt-app/. /opt/ptkt/
cd /opt/ptkt && sudo npm ci --omit=dev
ls /opt/ptkt
```

**Kiểm tra:** `npm ci` kết thúc bằng `added … packages`, không có `ERR!`. Thư mục `/opt/ptkt` có `server.js`, `public`, `deploy`, `scripts`, `seed`.

> **Chưa chạy ứng dụng ở bước này.** Phải dựng xong nhân bản CSDL trước, nếu không cả hai máy sẽ cùng nạp dữ liệu ban đầu từ `seed/seed.json` và đâm nhau.

---

### Bước 4 – Cấu hình MariaDB cho nhân bản 2 chiều

**4a. Chép file cấu hình (mỗi máy một file khác nhau – đừng chép nhầm):**

```bash
# SERVER3
sudo cp /opt/ptkt/deploy/mariadb-server3.cnf /etc/mysql/mariadb.conf.d/60-ptkt-replication.cnf
```
```bash
# SERVER4
sudo cp /opt/ptkt/deploy/mariadb-server4.cnf /etc/mysql/mariadb.conf.d/60-ptkt-replication.cnf
```

*(Nếu IP máy chủ của bạn khác sơ đồ: `sudo nano /etc/mysql/mariadb.conf.d/60-ptkt-replication.cnf` và sửa dòng `bind-address`.)*

```bash
# CẢ HAI MÁY
sudo systemctl restart mariadb
sudo systemctl status mariadb --no-pager | head -5
sudo mariadb -e "SELECT @@server_id, @@gtid_domain_id, @@auto_increment_offset, @@log_bin"
```

**Kiểm tra:** SERVER3 phải in `311 | 311 | 1 | 1`; SERVER4 phải in `312 | 312 | 2 | 1`. Nếu `@@log_bin` = `0`, file cấu hình chưa được nạp – xem lại đường dẫn file.

**4b. Mở tường lửa cho cổng nhân bản:**

```bash
# SERVER3
sudo ufw allow OpenSSH
sudo ufw allow from 192.168.20.12 to any port 3306 proto tcp comment 'MariaDB nhan ban tu SERVER4'
```
```bash
# SERVER4
sudo ufw allow OpenSSH
sudo ufw allow from 192.168.20.11 to any port 3306 proto tcp comment 'MariaDB nhan ban tu SERVER3'
```
*(Chưa bật `ufw enable` – sẽ bật ở Bước 7 sau khi mở nốt cổng 80.)*

**4c. Tạo tài khoản nhân bản trên từng máy.**

Lệnh `SET SESSION sql_log_bin = 0;` ở đầu là **bắt buộc** – nó ngăn việc tạo tài khoản này bị nhân bản sang máy kia (sẽ gây lỗi “user đã tồn tại” làm đứng nhân bản).

```bash
# SERVER3   – thay REPL_MK bằng REPL_PASSWORD ở Bước B5
sudo mariadb <<'SQL'
SET SESSION sql_log_bin = 0;
CREATE USER IF NOT EXISTS 'repl'@'192.168.20.12' IDENTIFIED BY 'REPL_MK';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'192.168.20.12';
FLUSH PRIVILEGES;
SQL
```
```bash
# SERVER4   – thay REPL_MK bằng ĐÚNG chuỗi đó
sudo mariadb <<'SQL'
SET SESSION sql_log_bin = 0;
CREATE USER IF NOT EXISTS 'repl'@'192.168.20.11' IDENTIFIED BY 'REPL_MK';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'192.168.20.11';
FLUSH PRIVILEGES;
SQL
```

**4d. Đấu nối hai chiều.** Cả hai CSDL hiện đang **trống** nên không cần sao chép dữ liệu nền:

```bash
# SERVER3  – SERVER3 nhận dữ liệu từ SERVER4
sudo mariadb <<'SQL'
STOP SLAVE;
CHANGE MASTER TO MASTER_HOST='192.168.20.12', MASTER_PORT=3306,
  MASTER_USER='repl', MASTER_PASSWORD='REPL_MK', MASTER_USE_GTID=current_pos,
  MASTER_CONNECT_RETRY=10;
START SLAVE;
SQL
```
```bash
# SERVER4  – SERVER4 nhận dữ liệu từ SERVER3
sudo mariadb <<'SQL'
STOP SLAVE;
CHANGE MASTER TO MASTER_HOST='192.168.20.11', MASTER_PORT=3306,
  MASTER_USER='repl', MASTER_PASSWORD='REPL_MK', MASTER_USE_GTID=current_pos,
  MASTER_CONNECT_RETRY=10;
START SLAVE;
SQL
```

**Kiểm tra (chạy trên cả hai máy):**
```bash
sudo mariadb -e "SHOW SLAVE STATUS\G" | grep -E 'Slave_IO_Running|Slave_SQL_Running|Seconds_Behind|Last_Error'
```
Phải thấy trên **cả hai máy**:
```
   Slave_IO_Running: Yes
  Slave_SQL_Running: Yes
Seconds_Behind_Master: 0
         Last_Error:
```
Nếu `Slave_IO_Running: Connecting` → sai mật khẩu `repl`, sai IP, hoặc tường lửa/`bind-address` chặn. Xem Phần G.

**4e. Thử nhân bản thật (bắt buộc – đừng bỏ qua):**

```bash
# SERVER3
sudo mariadb -e "CREATE DATABASE thu_nhan_ban; CREATE TABLE thu_nhan_ban.t(i INT); INSERT INTO thu_nhan_ban.t VALUES(1);"
```
```bash
# SERVER4  – chạy ngay sau đó
sudo mariadb -e "SELECT * FROM thu_nhan_ban.t;"     # phải thấy 1
sudo mariadb -e "INSERT INTO thu_nhan_ban.t VALUES(2);"
```
```bash
# SERVER3
sudo mariadb -e "SELECT * FROM thu_nhan_ban.t;"     # phải thấy cả 1 và 2  → hai chiều OK
sudo mariadb -e "DROP DATABASE thu_nhan_ban;"
```

**Chỉ đi tiếp khi thấy đủ cả 1 và 2 ở chiều ngược lại.**

---

### Bước 5 – Tạo cơ sở dữ liệu ứng dụng (CHỈ trên SERVER3)

Nhân bản đã chạy, nên những lệnh này sẽ **tự xuất hiện trên SERVER4**. Không chạy lại ở SERVER4.

```bash
# SERVER3 – thay MK_CSDL bằng DB_PASSWORD ở Bước B5
sudo mariadb <<'SQL'
CREATE DATABASE IF NOT EXISTS ptkt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'ptkt'@'localhost'  IDENTIFIED BY 'MK_CSDL';
CREATE USER IF NOT EXISTS 'ptkt'@'127.0.0.1'  IDENTIFIED BY 'MK_CSDL';
GRANT ALL PRIVILEGES ON ptkt.* TO 'ptkt'@'localhost';
GRANT ALL PRIVILEGES ON ptkt.* TO 'ptkt'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
```

**Kiểm tra – chạy trên SERVER4:**
```bash
# SERVER4
sudo mariadb -e "SHOW DATABASES LIKE 'ptkt'; SELECT user,host FROM mysql.user WHERE user='ptkt';"
```
Phải thấy CSDL `ptkt` và hai tài khoản `ptkt@localhost`, `ptkt@127.0.0.1`. Nếu không thấy → nhân bản chưa chạy, quay lại Bước 4.

---

### Bước 6 – Tạo file `.env` trên cả hai máy

```bash
# CẢ HAI MÁY
sudo cp /opt/ptkt/.env.example /opt/ptkt/.env
sudo nano /opt/ptkt/.env
```

Nội dung **giống hệt nhau trên cả hai máy**:

```
PORT=3000
HOST=127.0.0.1
JWT_SECRET=<<JWT_SECRET ở Bước B5 – 64 ký tự, GIỐNG NHAU trên 2 máy>>
COOKIE_SECURE=true
SESSION_DAYS=30

DB_CLIENT=mariadb
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=ptkt
DB_USER=ptkt
DB_PASSWORD=<<DB_PASSWORD ở Bước B5>>
```

- `HOST=127.0.0.1` – **giữ nguyên.** Node.js chỉ nghe nội bộ, A10 vào qua Nginx.
- `DB_HOST=127.0.0.1` – **mỗi máy nối vào MariaDB của chính nó.** Nhân bản lo việc đồng bộ. Không trỏ SERVER4 sang `192.168.20.11`.
- `COOKIE_SECURE=true` – vì người dùng vào bằng `https://` qua VIP.

Lưu (**Ctrl+O**, Enter, **Ctrl+X**), rồi khoá quyền đọc:

```bash
# CẢ HAI MÁY
sudo chown root:ptkt /opt/ptkt/.env
sudo chmod 640 /opt/ptkt/.env
```

**Kiểm tra:** `sudo diff <(ssh admin@192.168.20.12 sudo cat /opt/ptkt/.env) /opt/ptkt/.env` (chạy từ SERVER3) không in ra gì → hai file giống hệt nhau.

---

### Bước 7 – Chạy ứng dụng: SERVER3 trước, SERVER4 sau

**7a. SERVER3 – chạy thử để nạp dữ liệu ban đầu:**

```bash
# SERVER3
cd /opt/ptkt
sudo -u ptkt node --env-file=.env server.js
```
Màn hình phải hiện:
```
[seed] Đã nạp 24 tài liệu dữ liệu ban đầu.
[ptkt] Đang chạy tại http://127.0.0.1:3000  (CSDL: MariaDB – ptkt@127.0.0.1:3306/ptkt)
[ptkt] Chưa có tài khoản trưởng phòng. Chạy: npm run user -- create
```
Nhấn **Ctrl+C** để dừng.

**7b. Kiểm tra dữ liệu đã sang SERVER4 chưa – đây là mốc quan trọng nhất của cả quy trình:**

```bash
# SERVER4
sudo mariadb -e "SELECT COUNT(*) AS so_tai_lieu FROM ptkt.docs;"
```
Phải ra **24** (bằng đúng số ở dòng `[seed]`). Nếu ra `0` → **dừng lại**, xử lý nhân bản theo Phần G rồi mới đi tiếp.

**7c. Tạo tài khoản trưởng phòng (CHỈ trên SERVER3 – sẽ tự nhân bản sang SERVER4):**

```bash
# SERVER3
cd /opt/ptkt
sudo -u ptkt node --env-file=.env scripts/manage-user.js create
```
Trả lời: tên đăng nhập (vd `trp.kythuat`), tên hiển thị, vai trò `1` (Trưởng phòng), bỏ qua phần gắn nhân sự, mật khẩu ≥ 8 ký tự.

```bash
# SERVER4 – kiểm tra tài khoản đã sang
sudo mariadb -e "SELECT id, username, role FROM ptkt.users;"
```
Phải thấy tài khoản vừa tạo, với `id` là **số lẻ** (1, 3, 5…) – đúng quy tắc `auto_increment_offset` của SERVER3.

**7d. Bật dịch vụ tự chạy trên cả hai máy:**

```bash
# CẢ HAI MÁY
sudo cp /opt/ptkt/deploy/ptkt.service /etc/systemd/system/ptkt.service
sudo systemctl daemon-reload
sudo systemctl enable --now ptkt
sudo systemctl status ptkt --no-pager | head -5
curl -s http://127.0.0.1:3000/api/health; echo
```
Mỗi máy phải trả về `{"ok":true,"db":"MariaDB","time":"…"}`.

> SERVER4 giờ **đang chạy nhưng không có ai vào** – đúng thiết kế. Nó sẵn sàng nhận tải trong vài giây nếu SERVER3 hỏng.

---

### Bước 8 – Nginx (dùng bản cấu hình riêng cho A10)

```bash
# CẢ HAI MÁY
sudo cp /opt/ptkt/deploy/nginx-ptkt-a10.conf /etc/nginx/sites-available/ptkt
sudo ln -sf /etc/nginx/sites-available/ptkt /etc/nginx/sites-enabled/ptkt
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
curl -s -H 'X-Forwarded-For: 10.9.9.9' http://127.0.0.1/api/health; echo
```

**Kiểm tra:** `nginx -t` báo `syntax is ok` / `test is successful`, và `curl` trả về `{"ok":true,…}`.

**Vì sao phải dùng `nginx-ptkt-a10.conf` chứ không phải `nginx-ptkt.conf`:**
A10 làm NAT nguồn, nên mọi yêu cầu đến máy chủ đều mang IP của A10. Ứng dụng có cơ chế chống dò mật khẩu “**sai 10 lần / 15 phút / mỗi IP**” (`server.js`). Nếu dùng file cấu hình thường, cả phòng bị tính chung một IP: **một người gõ sai mật khẩu 10 lần là cả phòng bị khoá 15 phút.** File `nginx-ptkt-a10.conf` lấy IP thật từ header `X-Forwarded-For` do A10 chèn vào – vì vậy **bắt buộc phải bật `insert-client-ip` trên A10** ở Phần D.

---

### Bước 9 – Bật tường lửa

Hỏi người quản trị A10 về **dải NAT nguồn** (Phần B1). Ví dụ dưới đây dùng IP VE20 của hai A10:

```bash
# CẢ HAI MÁY
sudo ufw allow from 192.168.20.101 to any port 80 proto tcp comment 'A10-01'
sudo ufw allow from 192.168.20.102 to any port 80 proto tcp comment 'A10-02'
sudo ufw --force enable
sudo ufw status numbered
```

**Kiểm tra:** danh sách có `OpenSSH`, hai dòng cổng 80 cho A10, một dòng 3306 cho máy kia. **Không có dòng nào mở cổng 80 hoặc 3306 ra `Anywhere`.**

> ⚠ Luôn `ufw allow OpenSSH` (đã làm ở Bước 4b) **trước** `ufw enable`, nếu không bạn sẽ bị khoá ngoài SSH.
>
> Nếu A10 dùng dải NAT pool thay vì IP VE, thay bằng: `sudo ufw allow from 192.168.20.200/29 to any port 80 proto tcp`.

---

## PHẦN D – CẤU HÌNH A10

Phần này do người quản trị A10 thực hiện (CLI ACOS). Cú pháp có thể lệch chút ít giữa các phiên bản ACOS – đối chiếu với tài liệu thiết bị của bạn. Phần **ý nghĩa** của từng mục mới là thứ không được đổi.

### D1. Khai báo máy chủ và kiểm tra sức khoẻ

```
health monitor hm-ptkt
  interval 5 timeout 5 retry 2 up-retry 2
  method http port 80 expect-response-code 200 url GET /api/health

slb server SERVER3 192.168.20.11
  health-check hm-ptkt
  port 80 tcp

slb server SERVER4 192.168.20.12
  health-check hm-ptkt
  port 80 tcp
```

Dùng đúng đường dẫn **`/api/health`**, không dùng “TCP port 80 mở là coi như sống”. `/api/health` chạy một truy vấn thật xuống MariaDB (`server.js` – `store.ping()`): nếu CSDL hỏng, nó trả về **503** và A10 sẽ chuyển sang máy kia. Kiểm tra TCP đơn thuần sẽ không phát hiện được tình huống đó.

### D2. Nhóm dịch vụ – ưu tiên SERVER3

```
slb service-group sg-ptkt tcp
  health-check hm-ptkt
  member SERVER3 80
    priority 16
  member SERVER4 80
    priority 1
```

Thành viên **priority cao hơn** nhận toàn bộ tải; SERVER4 chỉ được dùng khi SERVER3 trượt health check. Đây chính là phần tạo ra mô hình Active/Standby ở Phần A2.

*(Một số phiên bản ACOS cần bật thêm `priority-affinity` trong service-group để cơ chế ưu tiên có hiệu lực. Kiểm tra bằng `show slb service-group sg-ptkt` – khi bình thường, cột `Cur Conns` của SERVER4 phải bằng 0.)*

### D3. Template HTTP – **bắt buộc**

```
slb template http ht-ptkt
  insert-client-ip
  request-header-insert "X-Forwarded-Proto: https"
```

- `insert-client-ip` chèn header `X-Forwarded-For` chứa IP thật của người dùng. **Thiếu dòng này thì cơ chế chống dò mật khẩu sẽ khoá nhầm cả phòng** (xem Bước 8).
- `X-Forwarded-Proto: https` để ứng dụng và nhật ký biết người dùng vào bằng HTTPS.

### D4. SSL offload và virtual server

```
slb template client-ssl cs-ptkt
  cert ptkt-cert
  key  ptkt-key

slb virtual-server vs-ptkt 192.168.20.100
  port 443 https
    service-group sg-ptkt
    template http ht-ptkt
    template client-ssl cs-ptkt
    source-nat auto
```

Chứng chỉ cho tên miền nội bộ (vd `congviec.ngsi.vn`) nhập vào A10 trước bằng `import cert ptkt-cert …` / `import key ptkt-key …`. Chứng chỉ do CA nội bộ của công ty cấp thì phải được cài vào kho tin cậy trên máy trạm (thường đẩy bằng Group Policy), nếu không trình duyệt sẽ cảnh báo.

### D5. Chuyển hướng HTTP → HTTPS (nên có)

Vì `.env` đặt `COOKIE_SECURE=true`, người dùng lỡ vào bằng `http://` sẽ đăng nhập được nhưng bị đẩy ra ngay. Cho A10 chuyển hướng luôn:

```
aflex ptkt-redirect-https
when HTTP_REQUEST {
  HTTP::redirect "https://[HTTP::host][HTTP::uri]"
}

slb virtual-server vs-ptkt 192.168.20.100
  port 80 http
    aflex ptkt-redirect-https
```

Cổng 80 trên VIP **chỉ chuyển hướng**, không gắn `service-group`.

### D6. Kênh thời gian thực đi qua A10

Ứng dụng giữ một kết nối HTTP dài tới `/api/events`. Nó tự gửi gói giữ nhịp mỗi **25 giây** (`server.js` – `setInterval(… 25000)`), nên thời gian chờ rỗi mặc định của ACOS (600 giây) là đủ, **không cần chỉnh**.

Điều cần kiểm tra là A10 **không đệm** luồng này. Nếu ở Phần E mục E4 thấy dữ liệu chỉ cập nhật sau vài chục giây (hoặc chỉ khi F5), hãy tách riêng `/api/events` bằng aFleX trỏ sang một service-group không gắn template nén/đệm.

### D7. VRRP-A giữa A10-01 và A10-02

VIP `192.168.20.100` chạy trên cặp A10 theo VRRP-A sẵn có (cổng E13/E14 + link 1.1.1.0/30). Phần này không liên quan đến ứng dụng – chỉ cần đảm bảo `vs-ptkt` nằm trong đúng vrid đang hoạt động, và máy chủ cho phép cổng 80 từ **cả hai** IP A10 (Bước 9).

---

## PHẦN E – KIỂM THỬ NGHIỆM THU

Làm đủ 7 mục dưới đây rồi mới bàn giao cho phòng.

### E1. Truy cập cơ bản
Mở `https://congviec.ngsi.vn` (hoặc `https://192.168.20.100`) → thấy màn hình đăng nhập, ổ khoá HTTPS. Đăng nhập tài khoản trưởng phòng → thấy đủ 16 dự án.

### E2. Toàn bộ tải đang vào SERVER3
```
# Trên A10
show slb service-group sg-ptkt
```
SERVER3 có kết nối, SERVER4 `Cur Conns = 0` nhưng trạng thái `Up`.

### E3. IP thật của người dùng có tới được ứng dụng
```bash
# SERVER3 – xem nhật ký nginx trong lúc có người đang dùng
sudo tail -f /var/log/nginx/access.log
```
Cột đầu phải là **IP máy trạm** (vd `192.168.72.x`), **không phải** `192.168.20.101`. Nếu thấy IP của A10 → `insert-client-ip` ở mục D3 chưa bật.

### E4. Cập nhật thời gian thực
Mở ứng dụng trên **hai máy trạm khác nhau**, cùng đăng nhập. Máy A sửa một dòng ở “Nhập theo tuần” → màn hình máy B phải đổi theo **trong vòng 1–2 giây**, không cần F5. Góc dưới thanh bên hiện chấm xanh “Đã kết nối máy chủ”.

### E5. Nhân bản CSDL hai chiều
```bash
sudo /opt/ptkt/scripts/check-ha.sh     # chạy trên CẢ HAI máy
```
Cả hai phải báo `✓` ở mọi dòng, và **số tài liệu trong bảng docs bằng nhau**.

### E6. Diễn tập chuyển đổi dự phòng (quan trọng nhất)

Chọn giờ thấp điểm. Giữ nguyên trình duyệt **đang đăng nhập** ở một máy trạm.

```bash
# SERVER3 – giả lập hỏng
sudo systemctl stop ptkt
```

Trong vòng ~15 giây (interval 5s × retry 2):

| Phải thấy | Nếu không thấy |
|---|---|
| A10: `show slb server SERVER3` → `DOWN`; traffic chuyển sang SERVER4 | Xem lại health monitor D1 |
| Trình duyệt vẫn **đăng nhập nguyên**, chỉ cần F5 là dùng tiếp | `JWT_SECRET` hai máy khác nhau → sửa `.env` SERVER4 |
| Dữ liệu đầy đủ, đúng như trước | Nhân bản có vấn đề → Phần G |

Ghi chú lại: sau khi chuyển, kết nối thời gian thực đứt và tự nối lại sau 5 giây (`retry: 5000` trong `server.js`) – trong vài giây đó thanh bên hiện “Mất kết nối – đang thử lại…”. Đây là hành vi đúng.

Khôi phục:
```bash
# SERVER3
sudo systemctl start ptkt
```
A10 đưa traffic về lại SERVER3 sau ~10 giây (vì priority cao hơn). **Lưu ý:** mọi người bị đứt kết nối thời gian thực thêm một lần nữa khi quay về. Nếu không muốn “giật” hai lần, có thể cho A10 không tự quay về (tuỳ chọn, trong khi đó SERVER4 vẫn phục vụ bình thường).

### E7. Diễn tập mất cả máy
Tắt hẳn SERVER3 (`sudo poweroff`). SERVER4 phải phục vụ đầy đủ. Bật SERVER3 lên, chờ 1–2 phút rồi chạy `check-ha.sh` trên cả hai máy: nhân bản phải tự bắt kịp (`Seconds_Behind_Master: 0`) và số tài liệu bằng nhau. **Dữ liệu nhập trong lúc SERVER3 tắt phải có mặt trên SERVER3 sau khi bật lại** – đây là điều cần xác nhận bằng mắt.

---

## PHẦN F – VẬN HÀNH

### F1. Sao lưu tự động

Chạy trên **cả hai máy**, lệch giờ, để có hai bản độc lập:

```bash
# CẢ HAI MÁY
sudo chmod +x /opt/ptkt/scripts/backup.sh /opt/ptkt/scripts/check-ha.sh
sudo /opt/ptkt/scripts/backup.sh
ls -lh /var/backups/ptkt
```
```bash
# SERVER3 – 1h30 đêm
(sudo crontab -l 2>/dev/null; echo "30 1 * * * /opt/ptkt/scripts/backup.sh >> /var/log/ptkt-backup.log 2>&1") | sudo crontab -
```
```bash
# SERVER4 – 2h30 đêm
(sudo crontab -l 2>/dev/null; echo "30 2 * * * /opt/ptkt/scripts/backup.sh >> /var/log/ptkt-backup.log 2>&1") | sudo crontab -
```

Thêm kiểm tra nhân bản mỗi giờ (ghi log, để dò lại khi có sự cố):
```bash
# CẢ HAI MÁY
(sudo crontab -l 2>/dev/null; echo "15 * * * * /opt/ptkt/scripts/check-ha.sh >> /var/log/ptkt-ha.log 2>&1") | sudo crontab -
sudo crontab -l
```

> **Nhân bản không phải là sao lưu.** Xoá nhầm dữ liệu trên SERVER3 sẽ được nhân bản sang SERVER4 trong tích tắc. Vẫn phải giữ bản sao lưu hằng đêm, và nên nhờ IT bật snapshot VM cho cả hai máy.

### F2. Theo dõi hằng tuần

```bash
sudo /opt/ptkt/scripts/check-ha.sh        # chạy trên cả hai máy, 1 lần/tuần
```
Mục cần để ý nhất là dòng **nhân bản** và **số tài liệu trong bảng docs** – hai máy phải ra con số giống nhau.

### F3. Cập nhật phiên bản ứng dụng

Thứ tự: **máy dự phòng trước, máy đang chạy sau.** Giữa hai bước có một lần chuyển đổi, nên chọn giờ thấp điểm.

```bash
# 1. SERVER3 – sao lưu trước
sudo /opt/ptkt/scripts/backup.sh

# 2. SERVER4 (đang không nhận tải) – cập nhật mã nguồn
#    chép ptkt-app.zip mới lên /tmp của SERVER4, rồi:
cd /tmp && rm -rf ptkt-app && unzip -o ptkt-app.zip
sudo rsync -a --exclude '.env' --exclude 'node_modules' /tmp/ptkt-app/ /opt/ptkt/
cd /opt/ptkt && sudo npm ci --omit=dev
sudo systemctl restart ptkt
curl -s http://127.0.0.1/api/health; echo        # phải ra ok:true
```

Kiểm tra bản mới trên SERVER4 **trước khi** chuyển tải sang nó – vào thẳng bằng IP, bỏ qua A10:
```powershell
# Trên máy Windows: tạm trỏ tên miền về SERVER4 để thử
# Mở Notepad với quyền Administrator, sửa C:\Windows\System32\drivers\etc\hosts, thêm dòng:
#   192.168.20.12   congviec.ngsi.vn
# (nhớ xoá dòng này sau khi thử xong)
```
Vì `COOKIE_SECURE=true`, phải vào bằng tên miền qua A10 mới đăng nhập được; cách trên cho phép bạn thử giao diện của riêng SERVER4. Nếu bản mới có vấn đề → dừng tại đây, SERVER3 vẫn đang phục vụ bản cũ.

```bash
# 3. SERVER3 – cập nhật tương tự (lúc này A10 sẽ chuyển tải sang SERVER4 trong ~15 giây)
cd /tmp && rm -rf ptkt-app && unzip -o ptkt-app.zip
sudo rsync -a --exclude '.env' --exclude 'node_modules' /tmp/ptkt-app/ /opt/ptkt/
cd /opt/ptkt && sudo npm ci --omit=dev
sudo systemctl restart ptkt

# 4. Kiểm tra lại cả hai
sudo /opt/ptkt/scripts/check-ha.sh
```

**Lưu ý về thay đổi cấu trúc CSDL:** phiên bản mới có thêm bảng/cột thì lệnh `CREATE TABLE IF NOT EXISTS` khi khởi động sẽ được nhân bản sang máy kia. Trong lúc máy cũ chạy bản cũ còn máy mới đã tạo bảng mới, hệ thống vẫn chạy được (bản cũ không đụng tới bảng mới). Nhưng với thay đổi lớn, hãy **dừng `ptkt` trên cả hai máy, cập nhật cả hai, rồi bật lại** – chấp nhận vài phút gián đoạn để đổi lấy sự chắc chắn.

### F4. Khôi phục dữ liệu

Khi khôi phục toàn bộ CSDL từ file `.sql.gz`, **phải dừng nhân bản trước**, nếu không việc xoá-và-nạp-lại sẽ chạy hai lần chồng nhau:

```bash
# SERVER4 – dừng nhận
sudo systemctl stop ptkt
sudo mariadb -e "STOP SLAVE;"
```
```bash
# SERVER3 – khôi phục
sudo systemctl stop ptkt
sudo mariadb -e "STOP SLAVE;"
gunzip -c /var/backups/ptkt/ptkt-20261001-0130.sql.gz | sudo mariadb ptkt
sudo systemctl start ptkt
```
```bash
# SERVER4 – nạp lại từ cùng file đó, rồi đấu lại nhân bản
gunzip -c /var/backups/ptkt/ptkt-20261001-0130.sql.gz | sudo mariadb ptkt
sudo mariadb -e "START SLAVE;"
sudo systemctl start ptkt
```
```bash
# SERVER3 – bật lại chiều còn lại
sudo mariadb -e "START SLAVE;"
```
Kiểm tra bằng `check-ha.sh` trên cả hai máy.

*(Khôi phục từ file `.json` qua giao diện web – Cài đặt → Dữ liệu → Khôi phục – thì đơn giản hơn nhiều: ghi vào máy đang chạy, nhân bản tự đưa sang máy kia. Dùng cách này khi chỉ cần khôi phục dữ liệu nghiệp vụ, không cần khôi phục tài khoản.)*

### F5. Chạy hẳn trên SERVER4 một thời gian dài

Nếu SERVER3 phải bảo trì nhiều ngày, không cần làm gì thêm: A10 tự đẩy tải sang SERVER4, nhân bản sẽ bắt kịp khi SERVER3 trở lại. Chỉ cần nhớ **vẫn phải sao lưu** (cron trên SERVER4 đã có sẵn ở F1) và kiểm tra `check-ha.sh` thường xuyên hơn.

---

## PHẦN G – XỬ LÝ SỰ CỐ

Ngoài các mục trong `HUONG-DAN-TRIEN-KHAI.md` Phần F (áp dụng cho từng máy), dưới đây là các sự cố **chỉ gặp ở mô hình 2 máy**.

| # | Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|---|
| 1 | `Slave_IO_Running: Connecting` | Sai mật khẩu `repl`, sai IP, tường lửa chặn 3306, hoặc `bind-address` vẫn là 127.0.0.1 | `sudo mariadb -e "SHOW SLAVE STATUS\G" \| grep Last_IO_Error`. Thử `mariadb -h 192.168.20.12 -u repl -p -e "SELECT 1"` từ máy kia. Kiểm tra `ss -lntp \| grep 3306` – phải nghe trên IP nội bộ, không phải 127.0.0.1 |
| 2 | `Slave_SQL_Running: No`, `Last_Error: Duplicate entry … for key 'PRIMARY'` | Hai máy cùng ghi một lúc (đã cho cả hai cùng nhận tải), hoặc `auto_increment_offset` trùng nhau | Kiểm tra `SELECT @@server_id, @@auto_increment_offset` trên cả hai – phải là 311/1 và 312/2. Sửa cấu hình, rồi chọn một máy làm chuẩn và nạp lại máy kia theo mục G-A bên dưới |
| 3 | Hai máy ra số tài liệu khác nhau trong `check-ha.sh` | Nhân bản đứt một chiều, hoặc đã từng ghi trực tiếp vào máy dự phòng | Mục G-A bên dưới |
| 4 | Cả phòng bị “Sai quá nhiều lần. Thử lại sau 15 phút.” dù không ai gõ sai | A10 chưa bật `insert-client-ip`, nên mọi người bị tính chung một IP | Bật `insert-client-ip` (mục D3). Kiểm tra lại bằng mục E3. Gỡ tạm: `sudo systemctl restart ptkt` để xoá bộ đếm |
| 5 | Sau khi A10 chuyển máy, mọi người bị đăng xuất | `JWT_SECRET` trong `.env` hai máy khác nhau | Chép `JWT_SECRET` của máy đang chạy sang máy kia, `sudo systemctl restart ptkt` |
| 6 | Đăng nhập thành công rồi bị đẩy ra ngay | Đang vào bằng `http://` trong khi `COOKIE_SECURE=true` | Vào bằng `https://` qua VIP. Nếu cần thử trực tiếp bằng IP máy chủ thì tạm đặt `COOKIE_SECURE=false`, thử xong đặt lại `true` |
| 7 | Số liệu không tự cập nhật giữa các máy trạm | (a) A10 đang chia tải cho cả hai máy; (b) A10 đệm `/api/events` | (a) `show slb service-group sg-ptkt` – SERVER4 phải có `Cur Conns = 0`; sửa priority ở mục D2. (b) xem mục D6 |
| 8 | A10 báo cả hai máy `DOWN` nhưng SSH vào vẫn thấy ứng dụng chạy | `ufw` chưa mở cổng 80 cho đúng dải NAT nguồn của A10 | `sudo ufw status numbered`; hỏi lại dải NAT nguồn, thêm rule (Bước 9). Thử từ A10: `show slb server SERVER3` và xem lý do health check trượt |
| 9 | `/api/health` trả về `503` | Node.js chạy nhưng không nối được MariaDB cục bộ | `sudo systemctl status mariadb`; `sudo journalctl -u ptkt -n 50`; kiểm tra `DB_PASSWORD` trong `.env` |
| 10 | Nhật ký nhân bản `/var/log/mysql` phình to | `expire_logs_days` chưa có hiệu lực | `sudo mariadb -e "SELECT @@expire_logs_days;"` – phải là 14. `sudo mariadb -e "PURGE BINARY LOGS BEFORE NOW() - INTERVAL 14 DAY;"` |

### G-A. Dựng lại nhân bản khi hai máy đã lệch dữ liệu

Chọn máy có **dữ liệu đúng và mới nhất** làm chuẩn (thường là máy đang nhận tải). Giả sử đó là SERVER3.

```bash
# SERVER4 – bỏ toàn bộ dữ liệu cũ của máy này
sudo systemctl stop ptkt
sudo mariadb -e "STOP ALL SLAVES; RESET SLAVE ALL; DROP DATABASE IF EXISTS ptkt;"
```
```bash
# SERVER3 – xuất bản sao kèm vị trí GTID
sudo systemctl stop ptkt
sudo mariadb -e "STOP SLAVE;"
sudo mariadb-dump --single-transaction --master-data=2 --gtid \
  --databases ptkt > /tmp/ptkt-chuan.sql
sudo mariadb -e "SELECT @@gtid_current_pos;"     # ghi lại chuỗi này
scp /tmp/ptkt-chuan.sql admin@192.168.20.12:/tmp/
sudo systemctl start ptkt
```
```bash
# SERVER4 – nạp bản chuẩn rồi đấu lại
sudo mariadb < /tmp/ptkt-chuan.sql
sudo mariadb -e "SET GLOBAL gtid_slave_pos = '<<chuỗi gtid_current_pos vừa ghi>>';"
sudo mariadb <<'SQL'
CHANGE MASTER TO MASTER_HOST='192.168.20.11', MASTER_PORT=3306,
  MASTER_USER='repl', MASTER_PASSWORD='REPL_MK', MASTER_USE_GTID=slave_pos,
  MASTER_CONNECT_RETRY=10;
START SLAVE;
SQL
sudo systemctl start ptkt
```
```bash
# SERVER3 – đấu lại chiều ngược
sudo mariadb -e "START SLAVE;"
```

Kiểm tra `check-ha.sh` trên cả hai máy: `IO=Yes SQL=Yes`, số tài liệu bằng nhau.

---

## DANH SÁCH KIỂM TRA CUỐI

- [ ] `check-ha.sh` báo `✓` toàn bộ trên **cả hai** máy, số tài liệu bằng nhau
- [ ] `.env` hai máy: `JWT_SECRET` giống nhau, `COOKIE_SECURE=true`, `DB_HOST=127.0.0.1`
- [ ] MariaDB: `server_id`/`gtid_domain_id`/`auto_increment_offset` = 311/311/1 và 312/312/2
- [ ] A10: health monitor dùng `/api/health`; SERVER4 có `Cur Conns = 0`; `insert-client-ip` đã bật
- [ ] `ufw` trên cả hai máy: 80 chỉ mở cho A10, 3306 chỉ mở cho máy còn lại, không có `Anywhere`
- [ ] Nginx dùng `nginx-ptkt-a10.conf`; nhật ký access.log hiện **IP máy trạm**, không phải IP A10
- [ ] Đã diễn tập E6 (dừng dịch vụ) và E7 (tắt máy) thành công, người dùng **không bị đăng xuất**
- [ ] Cron sao lưu chạy trên cả hai máy (1h30 và 2h30), cron `check-ha.sh` mỗi giờ
- [ ] Đã nhờ IT bật snapshot VM cho cả hai máy
- [ ] Chứng chỉ HTTPS trên A10 còn hạn, đã ghi lịch gia hạn
- [ ] Đã ghi lại `JWT_SECRET`, `DB_PASSWORD`, `REPL_PASSWORD` vào nơi lưu trữ an toàn của phòng
