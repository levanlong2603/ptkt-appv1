# HƯỚNG DẪN CHUYỂN CƠ SỞ DỮ LIỆU TỪ SQLITE SANG MARIADB
## NGSI · Phòng Kỹ thuật – Quản trị công việc và nguồn lực (phiên bản 1.2)

Áp dụng cho máy chủ Ubuntu **đang chạy** ứng dụng (bản 1.0 hoặc 1.1, dùng SQLite tại `/var/lib/ptkt/ptkt.db`).
Sau khi làm xong: toàn bộ dữ liệu, **tài khoản và mật khẩu giữ nguyên**, ứng dụng chạy trên MariaDB.

| | |
|---|---|
| Thời gian thực hiện | 30–45 phút |
| Thời gian ứng dụng tạm dừng | khoảng 5 phút (Bước 7–8) |
| Mức rủi ro | Thấp – file SQLite cũ **không bị sửa**, quay lại được trong 1 phút (Phần C) |

> **Quy ước:** khung lệnh gõ trong cửa sổ SSH của máy chủ (trừ khi ghi “Trên máy Windows”). Thay `ubuntusv` và `<IP>` bằng tài khoản/IP thật. Màn hình hồng “Pending kernel upgrade / Restart services” khi cài gói: nhấn **Enter** (Tab → `<Ok>` → Enter) như lần trước.

---

## MỤC LỤC
- [Phần A – Hiểu nhanh thay đổi](#phần-a--hiểu-nhanh-thay-đổi)
- [Phần B – Các bước thực hiện (Bước 0 → 11)](#phần-b--các-bước-thực-hiện)
- [Phần C – Quay lại SQLite nếu có sự cố](#phần-c--quay-lại-sqlite-nếu-có-sự-cố)
- [Phần D – Vận hành MariaDB hằng ngày](#phần-d--vận-hành-mariadb-hằng-ngày)
- [Phần E – Xử lý sự cố](#phần-e--xử-lý-sự-cố)
- [Phần F – Làm cùng Claude Code (tuỳ chọn)](#phần-f--làm-cùng-claude-code)
- [Phụ lục – Cấu trúc bảng & câu lệnh SQL hữu ích](#phụ-lục)

---

## PHẦN A – HIỂU NHANH THAY ĐỔI

```
TRƯỚC (1.0/1.1):  Nginx → Node.js (server.js) → file SQLite /var/lib/ptkt/ptkt.db
SAU   (1.2)    :  Nginx → Node.js (server.js) → lib/store.js → MariaDB (127.0.0.1:3306, CSDL "ptkt")
```

| Hạng mục | Thay đổi |
|---|---|
| Mã nguồn | Thêm `lib/store.js` (lớp lưu trữ dùng chung cho MariaDB & SQLite), thư viện `mysql2`, công cụ `scripts/migrate-sqlite-to-mariadb.js`. `server.js`, `manage-user.js`, `backup.sh` đọc/ghi qua lớp này |
| Cấu hình `.env` | Thêm `DB_CLIENT=mariadb` và các dòng `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` |
| Sao lưu | `backup.sh` tự nhận MariaDB → tạo file `ptkt-YYYYMMDD-HHMM.sql.gz` (bằng `mariadb-dump`) |
| Giao diện | Không đổi. Người dùng không cần làm gì |
| Dự phòng | Đổi `DB_CLIENT=sqlite` là chạy lại bằng SQLite (máy lập trình cá nhân cũng dùng chế độ này) |

**Thứ tự thực hiện – không đảo bước:**
`Sao lưu → Cài MariaDB → Tạo CSDL → Chép mã 1.2 → Sửa .env → Kiểm tra kết nối → DỪNG app → Chuyển dữ liệu → Khởi động trên MariaDB → Kiểm tra → Sao lưu kiểu mới`

---

## PHẦN B – CÁC BƯỚC THỰC HIỆN

### Bước 0 – Chuẩn bị
- File **`ptkt-app.zip` bản 1.2** (đi kèm tài liệu này) ở thư mục `Downloads` trên máy Windows.
- Báo cả phòng: *“Hệ thống bảo trì lúc … trong khoảng 10 phút, vui lòng lưu và không nhập dữ liệu.”*
- SSH vào máy chủ: `ssh ubuntusv@<IP>`

---

### Bước 1 – Sao lưu 3 lớp (bắt buộc)

**1a. Bản sao lưu SQLite bằng script hiện có:**
```bash
sudo /opt/ptkt/scripts/backup.sh
ls -lh /var/backups/ptkt | tail -3
```

**1b. Chép nguyên file dữ liệu ra chỗ riêng:**
```bash
sudo mkdir -p /var/backups/ptkt/truoc-mariadb
sudo sqlite3 /var/lib/ptkt/ptkt.db ".backup '/var/backups/ptkt/truoc-mariadb/ptkt.db'"
ls -lh /var/backups/ptkt/truoc-mariadb/
```

**1c. File sao lưu JSON từ giao diện web:** đăng nhập tài khoản trưởng phòng → **Cài đặt → Dữ liệu → Tải file sao lưu (.json)** → lưu trên máy Windows.

**Kiểm tra:** có file mới trong `/var/backups/ptkt/`, có `ptkt.db` trong `truoc-mariadb/`, có file `.json` trên máy bạn.

---

### Bước 2 – Cài MariaDB

```bash
sudo apt update
sudo apt -y install mariadb-server mariadb-client
sudo systemctl enable --now mariadb
```

**Kiểm tra:**
```bash
mariadb --version
sudo systemctl status mariadb --no-pager
```
- Ubuntu 22.04 cài MariaDB **10.6**; Ubuntu 24.04 cài **10.11**. Cả hai đều dùng được.
- Dòng `Active:` phải là **active (running)**.

#### 2b. Thiết lập an toàn ban đầu
```bash
sudo mariadb-secure-installation
```
*(Nếu báo không có lệnh này, dùng `sudo mysql_secure_installation`.)* Trả lời:

| Câu hỏi | Trả lời |
|---|---|
| Enter current password for root (enter for none) | **Enter** |
| Switch to unix_socket authentication [Y/n] | **n** |
| Change the root password? [Y/n] | **n** (root đăng nhập bằng quyền `sudo`, không cần mật khẩu riêng – an toàn hơn) |
| Remove anonymous users? [Y/n] | **Y** |
| Disallow root login remotely? [Y/n] | **Y** |
| Remove test database and access to it? [Y/n] | **Y** |
| Reload privilege tables now? [Y/n] | **Y** |

#### 2c. Đảm bảo MariaDB chỉ nhận kết nối nội bộ
```bash
sudo ss -ltnp | grep 3306
```
**Kiểm tra:** thấy `127.0.0.1:3306` → đúng (mặc định Ubuntu). Nếu thấy `0.0.0.0:3306`: mở `sudo nano /etc/mysql/mariadb.conf.d/50-server.cnf`, đặt `bind-address = 127.0.0.1`, lưu, rồi `sudo systemctl restart mariadb`. **Không mở cổng 3306 trên tường lửa.**

---

### Bước 3 – Tạo cơ sở dữ liệu và tài khoản cho ứng dụng

**3a. Tạo mật khẩu ngẫu nhiên cho tài khoản CSDL:**
```bash
openssl rand -hex 24
```
Sao chép chuỗi 48 ký tự in ra (ví dụ `4b1f…9ac2`) – gọi là **MẬT_KHẨU_CSDL**. Ghi tạm vào Notepad, lát nữa dùng 2 lần.

> Dùng đúng chuỗi do `openssl` tạo (chỉ chữ và số). Mật khẩu có ký tự `$ " ' \` # ` dễ gây lỗi khi đọc file `.env`.

**3b. Vào giao diện lệnh MariaDB:**
```bash
sudo mariadb
```
Dấu nhắc đổi thành `MariaDB [(none)]>`. Dán khối sau, **thay `MẬT_KHẨU_CSDL`** bằng chuỗi ở 3a (giữ nguyên dấu nháy đơn):
```sql
CREATE DATABASE ptkt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'ptkt'@'localhost' IDENTIFIED BY 'MẬT_KHẨU_CSDL';
CREATE USER 'ptkt'@'127.0.0.1' IDENTIFIED BY 'MẬT_KHẨU_CSDL';
GRANT ALL PRIVILEGES ON ptkt.* TO 'ptkt'@'localhost';
GRANT ALL PRIVILEGES ON ptkt.* TO 'ptkt'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```
- `utf8mb4` – lưu đúng tiếng Việt có dấu.
- Tài khoản `ptkt` **chỉ** có quyền trên CSDL `ptkt`, chỉ đăng nhập từ chính máy chủ.

**Kiểm tra** (nhập MẬT_KHẨU_CSDL khi được hỏi, màn hình không hiện ký tự):
```bash
mariadb -u ptkt -p -h 127.0.0.1 ptkt -e "SELECT 'KET NOI OK' AS ket_qua, @@character_set_database AS bang_ma;"
```
Phải thấy `KET NOI OK` và `utf8mb4`.

---

### Bước 4 – Đưa mã nguồn 1.2 lên máy chủ

> ⚠ **Ở bước này KHÔNG khởi động lại ứng dụng.** Ứng dụng cũ vẫn chạy bình thường cho tới Bước 7.

**Trên máy Windows (PowerShell):**
```powershell
cd $HOME\Downloads
scp .\ptkt-app.zip ubuntusv@<IP>:/tmp/
```

**Trên máy chủ:**
```bash
cd /tmp && rm -rf ptkt-app && unzip -o -q ptkt-app.zip
sudo rsync -a --exclude '.env' --exclude 'node_modules' --exclude 'data' /tmp/ptkt-app/ /opt/ptkt/
cd /opt/ptkt && sudo npm ci --omit=dev
```

**Kiểm tra:**
```bash
grep '"version"' /opt/ptkt/package.json
ls /opt/ptkt/lib /opt/ptkt/scripts
node -e "require('/opt/ptkt/node_modules/mysql2'); console.log('mysql2 OK')"
```
Phải thấy `"version": "1.2.0"`, file `store.js`, `migrate-sqlite-to-mariadb.js`, và `mysql2 OK`. Cảnh báo `npm warn deprecated …` không sao (như lần trước).

---

### Bước 5 – Khai báo MariaDB trong `.env`

```bash
sudo nano /opt/ptkt/.env
```
Giữ nguyên các dòng đang có (`PORT`, `HOST`, `DATA_DIR`, `JWT_SECRET`, `COOKIE_SECURE`, `SESSION_DAYS`). **Thêm vào cuối file** (thay MẬT_KHẨU_CSDL):
```
# ===== Cơ sở dữ liệu =====
DB_CLIENT=mariadb
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=ptkt
DB_USER=ptkt
DB_PASSWORD=MẬT_KHẨU_CSDL
```
Lưu: **Ctrl+O**, Enter; thoát: **Ctrl+X**.

> Giữ dòng `DATA_DIR=/var/lib/ptkt` – công cụ chuyển dữ liệu dùng nó để tìm file SQLite cũ.

**Kiểm tra:**
```bash
sudo grep -E '^(DB_|DATA_DIR)' /opt/ptkt/.env
sudo ls -l /opt/ptkt/.env
```
Đủ 7 dòng; quyền file vẫn `-rw-r----- root ptkt` (nếu khác: `sudo chown root:ptkt /opt/ptkt/.env && sudo chmod 640 /opt/ptkt/.env`).

---

### Bước 6 – Thử kết nối hai phía (chưa ghi gì)

```bash
cd /opt/ptkt
sudo -u ptkt node --env-file=.env scripts/migrate-sqlite-to-mariadb.js --check
```

**Kiểm tra** – kết quả dạng:
```
=== CHUYỂN DỮ LIỆU SQLITE → MARIADB ===
Nguồn  (SQLite /var/lib/ptkt/ptkt.db): 24 tài liệu, 9 tài khoản, 812 dòng nhật ký
Đích   (MariaDB ptkt@127.0.0.1:3306/ptkt): 0 tài liệu, 0 tài khoản, 0 dòng nhật ký
✔ Kết nối hai phía đều được. (--check: không ghi gì)
```
(Số liệu của bạn sẽ khác.) Nếu báo lỗi → Phần E, **dừng lại, chưa sang Bước 7**.

---

### Bước 7 – Dừng ứng dụng và chuyển dữ liệu

```bash
sudo systemctl stop ptkt
cd /opt/ptkt
sudo -u ptkt node --env-file=.env scripts/migrate-sqlite-to-mariadb.js
```

**Kiểm tra** – dòng cuối phải là:
```
✔ CHUYỂN DỮ LIỆU THÀNH CÔNG – số lượng và nội dung khớp 100%.
```
Công cụ tự so sánh từng tài liệu giữa SQLite và MariaDB. Tài khoản được chép **nguyên mật khẩu đã mã hoá và mã phiên**, nên mọi người dùng tiếp mật khẩu cũ.

> Nếu thấy `✘ … không khớp` hoặc lỗi khác: **không sang Bước 8**. Khởi động lại bản cũ ngay theo **Phần C** (mất < 1 phút) rồi gửi ảnh màn hình để kiểm tra.

---

### Bước 8 – Khởi động ứng dụng trên MariaDB

```bash
sudo cp /opt/ptkt/deploy/ptkt.service /etc/systemd/system/ptkt.service
sudo systemctl daemon-reload
sudo systemctl start ptkt
sleep 2
sudo systemctl status ptkt --no-pager
sudo journalctl -u ptkt -n 5 --no-pager
curl -s http://127.0.0.1:3000/api/health; echo
```
File dịch vụ mới khai báo ứng dụng khởi động **sau** MariaDB khi máy chủ bật lại.

**Kiểm tra:**
- `Active: active (running)`.
- Log có dòng: `[ptkt] Đang chạy tại http://127.0.0.1:3000  (CSDL: MariaDB – ptkt@127.0.0.1:3306/ptkt)`
- Lệnh `curl` trả về `{"ok":true,"db":"MariaDB",…}`

---

### Bước 9 – Kiểm tra trên trình duyệt

1. Mở trang, nhấn **Ctrl+F5**. Đăng nhập (có thể vẫn đang đăng nhập sẵn – bình thường).
2. **Dashboard / Tổng quan dự án:** đủ dự án, số liệu như trước.
3. **Cài đặt → Tài khoản đăng nhập:** đủ tài khoản.
4. Thử **Nhập theo tuần**: thêm/sửa một dòng → lưu thành công.
5. Mở thêm trình duyệt khác bằng tài khoản khác: thấy thay đổi ngay.

Xem dữ liệu đã nằm trong MariaDB:
```bash
sudo mariadb ptkt -e "SELECT collection, COUNT(*) AS so_tai_lieu FROM docs GROUP BY collection;"
sudo mariadb ptkt -e "SELECT path, FROM_UNIXTIME(updated_at/1000) AS luc, updated_by FROM docs ORDER BY updated_at DESC LIMIT 5;"
```
Dòng trên cùng của lệnh thứ hai là thay đổi bạn vừa làm ở bước 4.

Báo cả phòng: **hệ thống đã hoạt động lại.**

---

### Bước 10 – Sao lưu kiểu mới (MariaDB)

`backup.sh` bản mới đã được chép ở Bước 4, tự đọc `.env` để biết đang dùng MariaDB.

```bash
sudo /opt/ptkt/scripts/backup.sh
ls -lh /var/backups/ptkt | tail -3
sudo crontab -l
```
**Kiểm tra:**
- In ra `Đã sao lưu (mariadb): /var/backups/ptkt/ptkt-YYYYMMDD-HHMM.sql.gz (…K)`.
- `crontab -l` vẫn còn dòng `30 1 * * * /opt/ptkt/scripts/backup.sh …` từ lần cài đặt trước (không cần sửa). Nếu chưa có:
  ```bash
  (sudo crontab -l 2>/dev/null; echo "30 1 * * * /opt/ptkt/scripts/backup.sh >> /var/log/ptkt-backup.log 2>&1") | sudo crontab -
  ```

**(Khuyến nghị) Thử khôi phục bản sao lưu vào CSDL tạm** – để chắc chắn file sao lưu dùng được:
```bash
F=$(ls -t /var/backups/ptkt/ptkt-*.sql.gz | head -1); echo "$F"
sudo mariadb -e "CREATE DATABASE ptkt_thu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
gunzip -c "$F" | sudo mariadb ptkt_thu
sudo mariadb ptkt_thu -e "SELECT COUNT(*) AS so_tai_lieu FROM docs; SELECT COUNT(*) AS so_tai_khoan FROM users;"
sudo mariadb -e "DROP DATABASE ptkt_thu;"
```
Số tài liệu/tài khoản khớp Bước 9 là bản sao lưu tốt.

---

### Bước 11 – Cất dữ liệu SQLite cũ (sau 2–4 tuần chạy ổn định)

Trong 2–4 tuần đầu **giữ nguyên** `/var/lib/ptkt/ptkt.db` làm phương án quay lại. Sau đó:
```bash
sudo mkdir -p /var/backups/ptkt/sqlite-cu
sudo mv /var/lib/ptkt/ptkt.db* /var/backups/ptkt/sqlite-cu/
```
(Giữ dòng `DATA_DIR` trong `.env` cũng không sao.)

✅ **Hoàn tất chuyển sang MariaDB.**

---

## PHẦN C – QUAY LẠI SQLITE NẾU CÓ SỰ CỐ

Dùng khi Bước 7/8 lỗi, hoặc MariaDB gặp vấn đề chưa xử lý kịp.

```bash
sudo sed -i 's/^DB_CLIENT=.*/DB_CLIENT=sqlite/' /opt/ptkt/.env
sudo systemctl restart ptkt
sudo journalctl -u ptkt -n 3 --no-pager
```
Log hiện `(CSDL: SQLite – /var/lib/ptkt/ptkt.db)` → ứng dụng chạy lại bằng dữ liệu SQLite.

> ⚠ Dữ liệu nhập **sau** khi chuyển sang MariaDB không có trong SQLite. Nếu đã chạy MariaDB một thời gian mới cần quay lại: **trước khi** đổi `DB_CLIENT`, vào web tải **file sao lưu (.json)**; sau khi chạy lại bằng SQLite, dùng **Cài đặt → Khôi phục từ file sao lưu** để đưa dữ liệu mới vào.

Chuyển lại sang MariaDB sau khi đã sửa lỗi: làm lại Bước 6–8. Nếu MariaDB đã có dữ liệu từ lần trước, công cụ chuyển sẽ dừng để bảo vệ; muốn chép đè hoàn toàn từ SQLite thì thêm `--force`:
```bash
sudo -u ptkt node --env-file=.env scripts/migrate-sqlite-to-mariadb.js --force
```

---

## PHẦN D – VẬN HÀNH MARIADB HẰNG NGÀY

| Việc | Lệnh |
|---|---|
| Trạng thái MariaDB | `sudo systemctl status mariadb --no-pager` |
| Khởi động lại MariaDB (rồi ứng dụng) | `sudo systemctl restart mariadb && sudo systemctl restart ptkt` |
| Log MariaDB | `sudo journalctl -u mariadb -n 50 --no-pager` |
| Vào giao diện lệnh CSDL | `sudo mariadb ptkt` (thoát: `EXIT;`) |
| Dung lượng CSDL | `sudo mariadb -e "SELECT table_name, ROUND((data_length+index_length)/1024,0) AS KB FROM information_schema.tables WHERE table_schema='ptkt';"` |
| Ai sửa gì gần đây | `sudo mariadb ptkt -e "SELECT FROM_UNIXTIME(ts/1000) luc, username, action, path FROM audit ORDER BY id DESC LIMIT 30;"` |
| Sao lưu ngay | `sudo /opt/ptkt/scripts/backup.sh` |
| Quản lý tài khoản dòng lệnh | `cd /opt/ptkt && sudo -u ptkt node --env-file=.env scripts/manage-user.js list` (create / reset-password / disable / enable – như cũ) |

### Khôi phục toàn bộ từ bản sao lưu MariaDB (`.sql.gz`)
```bash
sudo systemctl stop ptkt
sudo /opt/ptkt/scripts/backup.sh                         # giữ lại trạng thái hiện tại phòng khi cần
ls -lh /var/backups/ptkt/*.sql.gz                        # chọn bản cần khôi phục
gunzip -c /var/backups/ptkt/ptkt-20261015-0130.sql.gz | sudo mariadb ptkt
sudo systemctl start ptkt
```
Bản sao lưu chứa lệnh tạo lại bảng, nên khôi phục sẽ đưa **dữ liệu và tài khoản** về đúng thời điểm sao lưu.
*(Chỉ cần khôi phục dữ liệu nghiệp vụ, giữ nguyên tài khoản → dùng file `.json` trên web như trước.)*

### Cập nhật phiên bản ứng dụng về sau
Giống mục E5 của `HUONG-DAN-TRIEN-KHAI.md` (sao lưu → rsync → `npm ci --omit=dev` → restart). MariaDB không cần thao tác gì thêm; nếu phiên bản mới thay đổi cấu trúc bảng, ứng dụng tự cập nhật khi khởi động.

### Cập nhật MariaDB
Đi kèm `sudo apt update && sudo apt -y upgrade` hằng tháng. Sau khi nâng cấp: `sudo systemctl restart ptkt`.

---

## PHẦN E – XỬ LÝ SỰ CỐ

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `ER_ACCESS_DENIED_ERROR Access denied for user 'ptkt'@'localhost'` | Sai `DB_PASSWORD` trong `.env`, hoặc chưa tạo user ở Bước 3 | So `DB_PASSWORD` với mật khẩu ở Bước 3a; thử lại lệnh kiểm tra Bước 3. Đặt lại mật khẩu: `sudo mariadb -e "ALTER USER 'ptkt'@'localhost' IDENTIFIED BY 'MK_MOI'; ALTER USER 'ptkt'@'127.0.0.1' IDENTIFIED BY 'MK_MOI';"` rồi sửa `.env` |
| `ECONNREFUSED 127.0.0.1:3306` | MariaDB chưa chạy | `sudo systemctl start mariadb`; xem log `sudo journalctl -u mariadb -n 50` |
| `ER_BAD_DB_ERROR Unknown database 'ptkt'` | Chưa tạo CSDL / sai `DB_NAME` | Làm lại Bước 3b |
| `ER_DBACCESS_DENIED_ERROR` / `command denied` | Thiếu lệnh `GRANT` | Chạy lại 2 dòng `GRANT …` và `FLUSH PRIVILEGES;` ở Bước 3b |
| Ứng dụng không lên, log: `Không kết nối / khởi tạo được cơ sở dữ liệu MariaDB` | Một trong các lỗi trên | Đọc phần mã lỗi ở cuối dòng log, tra bảng này |
| Log ghi `CSDL: SQLite` dù đã cài MariaDB | `.env` thiếu `DB_CLIENT=mariadb` | Bước 5, rồi `sudo systemctl restart ptkt` |
| Bước 6/7 báo `Không tìm thấy file SQLite` | `DATA_DIR` sai/thiếu | Kiểm tra `sudo ls -l /var/lib/ptkt/`; đặt `DATA_DIR=/var/lib/ptkt` trong `.env` |
| Bước 7 báo `MariaDB đã có dữ liệu. Dừng lại…` | Đã chạy chuyển dữ liệu trước đó | Nếu chắc chắn muốn chép đè từ SQLite: thêm `--force` |
| `npm ci` lỗi khi cài `mysql2` | VM không ra Internet | `curl -I https://registry.npmjs.org`; nhờ IT mở mạng tạm thời |
| `backup.sh`: `mariadb-dump: command not found` | Thiếu gói client | `sudo apt -y install mariadb-client` |
| `backup.sh`: `Access denied … when using LOCK TABLES` | Phiên bản dump cũ | Đã dùng `--single-transaction`; nếu vẫn lỗi: `sudo mariadb -e "GRANT LOCK TABLES ON ptkt.* TO 'ptkt'@'127.0.0.1'; FLUSH PRIVILEGES;"` |
| Tiếng Việt hiện `Ã¡…` khi xem bằng lệnh `mariadb` | Cửa sổ dòng lệnh chưa đặt UTF-8 | Chỉ ảnh hưởng hiển thị trong cửa sổ lệnh, trang web vẫn đúng. Dùng `sudo mariadb --default-character-set=utf8mb4 ptkt` |
| Sau khởi động lại máy chủ ứng dụng báo lỗi CSDL vài giây rồi tự hết | Ứng dụng khởi động trước MariaDB | Đảm bảo đã chép file dịch vụ mới (Bước 8). systemd tự khởi động lại ứng dụng sau 3 giây |

---

## PHẦN F – LÀM CÙNG CLAUDE CODE

Nếu đã cài Claude Code trên máy chủ (`HUONG-DAN-TRIEN-KHAI.md` Phần G), có thể giao:

> Đọc file HUONG-DAN-CHUYEN-MARIADB.md và thực hiện từ Bước 2 đến Bước 10 trên máy chủ này. Hỏi tôi trước mỗi lệnh có sudo. Ở Bước 3 tự tạo mật khẩu bằng openssl và ghi vào .env, không in mật khẩu ra màn hình. Dừng lại báo cáo nếu bất kỳ bước “Kiểm tra” nào không đạt.

> Luôn tự làm **Bước 1 (sao lưu 3 lớp)** trước khi giao cho Claude Code.

---

## PHỤ LỤC

### P1. Cấu trúc bảng trong CSDL `ptkt`

| Bảng | Cột chính | Nội dung |
|---|---|---|
| `docs` | `path` (khoá chính), `collection`, `doc_id`, `body` (JSON), `updated_at`, `updated_by` | Dữ liệu nghiệp vụ: `config/staff`, `config/catalog`, `projects/<mã>`, `weeks/<tuần>__<tên>` |
| `users` | `id`, `username` (duy nhất, không phân biệt hoa thường), `pass_hash` (bcrypt), `display_name`, `staff_name`, `role` (`admin`/`member`), `active`, `token_version`, `created_at` | Tài khoản đăng nhập |
| `audit` | `id`, `ts`, `username`, `action`, `path` | Nhật ký thao tác |

Tất cả dùng `InnoDB`, bảng mã `utf8mb4_unicode_ci`. Thời gian lưu dạng mili-giây (Unix) – đổi sang giờ đọc được bằng `FROM_UNIXTIME(cot/1000)`.

### P2. Câu lệnh SQL hữu ích (chỉ đọc)
```sql
-- Số tài liệu theo loại
SELECT collection, COUNT(*) FROM docs GROUP BY collection;

-- Danh sách dự án
SELECT doc_id, JSON_VALUE(body,'$.name') AS ten, JSON_VALUE(body,'$.type') AS loai,
       JSON_LENGTH(body,'$.tasks') AS so_dau_viec
FROM docs WHERE collection='projects' ORDER BY ten;

-- Ai đã nhập tuần nào
SELECT JSON_VALUE(body,'$.week') AS tuan, JSON_VALUE(body,'$.person') AS nguoi,
       JSON_LENGTH(body,'$.entries') AS so_dong
FROM docs WHERE collection='weeks' ORDER BY tuan DESC, nguoi;

-- Tài khoản
SELECT id, username, display_name, staff_name, role, active FROM users;
```
Chạy: `sudo mariadb --default-character-set=utf8mb4 ptkt` rồi dán câu lệnh.

> **Không sửa dữ liệu trực tiếp bằng SQL** (UPDATE/DELETE) khi ứng dụng đang chạy – hãy sửa qua giao diện web để có nhật ký và cập nhật tức thời cho mọi người. Nếu bắt buộc phải sửa: sao lưu trước, sửa xong `sudo systemctl restart ptkt`.

### P3. Danh sách kiểm tra cuối

- [ ] Bước 1: có 3 bản sao lưu (backup.sh, `truoc-mariadb/ptkt.db`, file `.json`)
- [ ] `mariadb --version` chạy; `ss` cho thấy `127.0.0.1:3306`
- [ ] Đăng nhập `mariadb -u ptkt -p -h 127.0.0.1 ptkt` được, bảng mã `utf8mb4`
- [ ] `package.json` là `1.2.0`, có `lib/store.js`
- [ ] `.env` có đủ 6 dòng `DB_*`, quyền `640 root:ptkt`
- [ ] Công cụ chuyển dữ liệu báo **khớp 100%**
- [ ] Log ứng dụng ghi `CSDL: MariaDB`; `/api/health` trả `"db":"MariaDB"`
- [ ] Đăng nhập bằng mật khẩu cũ được; dữ liệu đầy đủ; nhập thử thành công
- [ ] `backup.sh` tạo file `.sql.gz`; đã thử khôi phục vào `ptkt_thu`
- [ ] Ghi lại MẬT_KHẨU_CSDL ở nơi an toàn (két mật khẩu của công ty), xoá khỏi Notepad
