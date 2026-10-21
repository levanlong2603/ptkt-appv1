# NGSI · Phòng Kỹ thuật – Tổng quan hệ thống

> Tài liệu tổng hợp hệ thống **Quản trị công việc và nguồn lực** của Phòng Kỹ thuật, dùng để hiểu, vận hành và
> bàn giao. Cập nhật: 21/10/2026.
>
> Tài liệu dành cho người lập trình: [`CLAUDE.md`](../CLAUDE.md) (quy ước code, công thức chi tiết).

---

## 1. Giới thiệu

Hệ thống là ứng dụng web nội bộ giúp phòng:

- lập **kế hoạch dự án**, gồm các đầu việc theo quy trình chuẩn, người phụ trách, deadline;
- cho nhân viên **nhập việc theo tuần** (làm gì, bao nhiêu giờ, trạng thái, vướng mắc gì);
- tính **tải công việc** (Workload) so với **năng lực** (Capacity) của từng người;
- theo dõi **tiến độ, quá hạn, vướng mắc**; xuất **báo cáo** tuần, dự án, tổng hợp; chấm **KPI**.

### Sơ đồ kiến trúc

```
  Trình duyệt ───────► A10 (VIP) → Nginx
  (nhân viên, TrP)              │ HTTP
                                ▼
              ┌──────────────────────────────────────┐
              │  Tiến trình Node.js (dịch vụ ptkt)   │
              │  ├─ Express: API + giao diện web     │
              │  └─ Realtime (SSE) → web tự cập nhật │
              └──────────────────┬───────────────────┘
                                 ▼
                 MariaDB (máy chủ thật, 2 máy nhân bản 2 chiều)
                 hoặc SQLite (máy lập trình cá nhân)
```

Mọi thao tác ghi đi qua **một hàm chung** `saveDoc()` / `removeDoc()` ở máy chủ. Hàm này kiểm quyền, ghi vết (audit)
và báo cho các trình duyệt đang mở cập nhật ngay.

---

## 2. Công nghệ và cấu trúc thư mục

- **Máy chủ:** Node.js ≥ 20.6 (máy local đang dùng 24), Express 4. Thư viện: `express`, `bcryptjs`, `jsonwebtoken`,
  `cookie-parser`, `mysql2` (MariaDB), `better-sqlite3` (SQLite).
- **Giao diện:** HTML/CSS/JavaScript thuần, **không build, không framework**. Thư viện xuất Excel/PDF tải từ CDN khi cần.
- **CSDL:** MariaDB trên máy chủ, SQLite trên máy cá nhân. Mọi tính năng chạy được trên cả hai.

```
ptkt-app1/
├─ backend/
│  ├─ server.js              Máy chủ: đăng nhập, quyền (RULES), saveDoc/removeDoc, API, realtime SSE
│  ├─ lib/
│  │  ├─ store.js            Truy cập CSDL (MariaDB / SQLite) – nơi DUY NHẤT đụng vào CSDL
│  │  ├─ staff.js            Đổi tên / chuyển dữ liệu nhân sự
│  │  └─ kpi.js              Chấm và chốt KPI
│  ├─ scripts/               manage-user.js (tạo/sửa tài khoản), migrate-sqlite-to-mariadb.js
│  └─ seed/seed.json         Dữ liệu mẫu nạp khi CSDL trống
├─ frontend/
│  ├─ index.html
│  ├─ css/                   theme.css (màu, chế độ tối), base.css, … theo từng màn
│  └─ js/
│     ├─ core/               utils, constants, state, model (tính toán), data, ui, server, events
│     ├─ views/              exec-dashboard, project-overview, plan, weekly-load, weekly-input, settings, help
│     └─ modules/            feedback, reports, plan-import, kpi-calc, kpi, worklog
├─ deploy/                   ptkt.service (systemd), nginx-ptkt*.conf, backup.sh, check-ha.sh, post-receive
├─ docs/TONG-QUAN-HE-THONG.md   (tài liệu này)
├─ CLAUDE.md                 Ngữ cảnh và quy ước cho người lập trình
├─ .env.example              Mẫu cấu hình
└─ package.json
```

---

## 3. Ứng dụng web

### 3.1 Các màn hình

| Màn | File | Nội dung chính |
|---|---|---|
| Dashboard | `views/exec-dashboard.js` | Tổng quan phòng: quá hạn, sắp đến hạn (14 ngày), ma sát/vướng, việc cần xử lý |
| Dự án – Tổng quan | `views/project-overview.js` | Mọi người xem được tất cả dự án (chỉ xem) |
| Dự án – Kế hoạch | `views/plan.js` | Tạo/sửa dự án, đầu việc theo quy trình chuẩn, deadline, quy mô, đánh giá khi hoàn thành; nhập từ Excel (`plan-import.js`) |
| Tải tuần | `views/weekly-load.js` | Workload/Capacity từng người theo tuần |
| Nhập theo tuần | `views/weekly-input.js` | Mỗi người nhập việc trong tuần; chép tuần trước; **Nhật ký** ngày (`worklog.js`) |
| Báo cáo | `modules/reports.js` | Báo cáo tuần, báo cáo dự án, báo cáo tổng hợp dự án; xuất Excel/PDF |
| KPI & Năng lực | `modules/kpi.js`, `kpi-calc.js` | Chấm và chốt KPI theo kỳ |
| Góp ý | `modules/feedback.js` | Góp ý, yêu cầu cải tiến, phản hồi, trạng thái xử lý |
| Cài đặt | `views/settings.js` | Nhân sự & capacity, quy trình chuẩn (danh mục đầu việc), tài khoản, sao lưu/khôi phục |
| Hướng dẫn | `views/help.js` | Hướng dẫn sử dụng |

### 3.2 Vai trò tài khoản

| Vai trò | Ý nghĩa |
|---|---|
| `admin` | Tài khoản hệ thống, chỉ tạo bằng dòng lệnh (`npm run user -- create`), ẩn khỏi Cài đặt |
| `head` | Trưởng phòng – toàn quyền |
| `deputy` | Phó phòng – toàn quyền (hiện ngang trưởng phòng) |
| `member` | Nhân viên |

Mỗi tài khoản nên **gắn với một nhân sự** (`staff_name`). Không gắn thì không nhập tuần được.

### 3.3 Quyền ghi dữ liệu (`RULES` trong `server.js`)

| Quy tắc | Áp dụng cho | Ai được ghi |
|---|---|---|
| `admin` | `config` (nhân sự, danh mục), `kpiNote` | Chỉ tài khoản toàn quyền |
| `own-project` | `projects` | Toàn quyền: tất cả, kể cả tạo dự án mới. Nhân viên: sửa nếu là người tạo hoặc TM/SE; chỉ người tạo được xoá cả dự án. Đánh giá/ghi chú TrP chỉ toàn quyền |
| `own-week` | `weeks`, `worklog` | Toàn quyền: mọi người, mọi tuần. Nhân viên: chỉ của mình, chỉ từ **tuần hiện tại** trở đi |
| `own` | `feedback`, `feedbackReply` | Ai cũng tạo được; sửa/xoá: người viết |
| `server` | `kpiReview` | Không ai ghi qua API chung, chỉ máy chủ |

Quyền luôn được **kiểm tra ở máy chủ**. Ẩn nút trên giao diện chỉ là phụ.

### 3.4 Công thức tính

- **Capacity (giờ/tuần)** = Giờ/tuần × (1 − % họp, phát sinh) × Hệ số năng lực. Ví dụ: 40 × 0,8 × 1 = **32h**.
- **Workload của một lượt nhập tuần** = Số giờ thật × hệ số Độ phức tạp. Hệ số theo mức 1–5: 0,8 / 0,9 / 1,1 / 1,3 / 1,5;
  bỏ trống thì ×1. Lượt cũ chỉ có Quy mô thì tính theo `wlOf(qm, pt)`.
- **Workload kế hoạch của một đầu việc** = Giờ đại diện của Quy mô × hệ số Độ phức tạp. Giờ theo mức 1–5: 1,25 / 5 / 10 / 18 / 28h.
- **Tiến độ dự án** = tỉ lệ Workload đã Hoàn thành trên tổng, bỏ đầu việc Hủy. Đầu việc thiếu Quy mô vẫn tính trọng số 1.
- **Trạng thái hiện tại của đầu việc** = trạng thái ở lượt nhập tuần gần nhất; chưa có lượt nào thì lấy trạng thái ban đầu.
- **Quá hạn** = còn mở và deadline < hôm nay. **Sắp hạn** = còn mở và deadline trong 14 ngày tới. Không tính dự án Nội bộ.

Khi nhập tuần, mỗi đầu việc chỉ có **1 dòng/tuần** (trừ dự án Nội bộ), giờ phải từ **0,5 đến 32**, và tải của dòng
**không được vượt phần capacity còn lại** của tuần.

---

## 4. Dữ liệu

- Bảng `docs`: mọi dữ liệu nghiệp vụ, dạng tài liệu JSON theo đường dẫn `<collection>/<id>`.
- Bảng `users`: tài khoản (mật khẩu đã băm bcrypt).
- Bảng `audit`: ghi vết mọi lần ghi/xoá (ai, lúc nào, tài liệu nào).

| Collection | Ví dụ id | Nội dung |
|---|---|---|
| `config` | `staff`, `catalog`, `kpiCriteria` | Nhân sự & capacity; danh mục đầu việc chuẩn; tiêu chí KPI |
| `projects` | `p-nokia-dc-09` | Dự án + danh sách đầu việc `tasks[]` |
| `weeks` | `2026-10-19__le-minh-thang` | Nhập tuần của 1 người: `{week, person, entries[]}` |
| `worklog` | `2026-10-19__le-minh-thang` | Nhật ký ngày: `{week, person, days[{date, text}]}` |
| `feedback`, `feedbackReply` | `fb…`, `fr…` | Góp ý và phản hồi |
| `kpiNote`, `kpiReview` | `<kỳ>__<tên>` | Nhận xét và bản đánh giá KPI |

---

## 5. Cấu hình `.env`

File `.env` nằm cạnh `package.json`, **không đưa lên git**. Mẫu: `.env.example`.

| Biến | Ý nghĩa | Máy local | Máy chủ thật |
|---|---|---|---|
| `PORT` | Cổng ứng dụng | 3000 (đang chạy 3001, xem mục 6) | 3000 |
| `HOST` | Địa chỉ lắng nghe | `127.0.0.1` | `127.0.0.1` (sau Nginx) |
| `JWT_SECRET` | Chuỗi bí mật ký phiên đăng nhập, ≥ 32 ký tự | ngẫu nhiên | ngẫu nhiên (`openssl rand -hex 32`) |
| `COOKIE_SECURE` | `true` nếu dùng https | `false` | theo thực tế |
| `SESSION_DAYS` | Số ngày giữ đăng nhập | 30 | 30 |
| `DB_CLIENT` | `mariadb` hoặc `sqlite` | `sqlite` | `mariadb` |
| `DB_HOST/PORT/NAME/USER/PASSWORD` | Kết nối MariaDB | – | theo máy chủ |
| `DATA_DIR` | Thư mục file SQLite | `./data` | `/var/lib/ptkt` |

Lưu ý khi sửa `.env`:
- Viết `TÊN=giá trị` trên cùng một dòng, không dấu cách quanh `=`, không ngoặc kép.
- Không viết chú thích trên cùng dòng với giá trị.

---

## 6. Chạy trên máy local (Windows)

Thư mục: `C:\Users\Phongpv\OneDrive\Desktop\TM_Dept\ptkt-app1`

```bash
npm install                          # lần đầu (better-sqlite3 cần được phép chạy script cài đặt)
# .env: DB_CLIENT=sqlite, DATA_DIR=./data, JWT_SECRET=<chuỗi ngẫu nhiên>
npm run user -- create               # tạo tài khoản admin (lần đầu)
```

Chạy máy chủ ở **cổng 3001**, vì cổng 3000 trên máy đang bị một dự án khác (`Bid_Project`) dùng:

```powershell
$env:PORT='3001'; node --env-file=.env backend/server.js
```

Mở **http://127.0.0.1:3001**. Log khởi động đúng sẽ có:

```
[ptkt] Đang chạy tại http://127.0.0.1:3001  (CSDL: SQLite – data\ptkt.db)
```

Muốn chạy bằng `npm start` thì đổi `PORT=3001` trong `.env`, hoặc tắt Bid_Project trước.

**Tài khoản local:** `admin` (hệ thống, không gắn nhân sự) và `longlv` (Phó phòng, gắn Lê Văn Long). Mật khẩu không
ghi trong tài liệu này.

---

## 7. Triển khai lên máy chủ

Hạ tầng: 2 máy Ubuntu (SERVER3/SERVER4) sau A10, MariaDB nhân bản 2 chiều, dịch vụ systemd `ptkt`, mã nguồn ở `/opt/ptkt`.
Cập nhật bằng `git push` tới `ssh://ubuntusv@192.168.11.205/opt/ptkt-repo.git`; hook `post-receive` tự lấy mã, chạy
`npm ci --omit=dev` và khởi động lại dịch vụ.

1. **Sao lưu:** `sudo /opt/ptkt/deploy/backup.sh`
2. **Đẩy mã:** `git add -A && git commit -m "…" && git push origin master`. Xem kết quả: `sudo tail -n 20 /var/log/ptkt-deploy.log`.
   Máy thứ hai cập nhật theo cách vẫn làm.
3. **Kiểm tra:** `sudo journalctl -u ptkt -n 30 --no-pager` và `sudo /opt/ptkt/deploy/check-ha.sh` (dịch vụ, Nginx,
   MariaDB, nhân bản giữa 2 máy, số tài liệu 2 máy phải bằng nhau).

`.env` và dữ liệu không bị ghi đè khi cập nhật.

### Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Dịch vụ không chạy | `sudo journalctl -u ptkt -n 50` để xem lỗi; thường do `.env` sai hoặc không kết nối được CSDL |
| Số tài liệu 2 máy khác nhau | Nhân bản MariaDB có vấn đề – xem `check-ha.sh` (`SHOW SLAVE STATUS`) |
| Web ở máy này không thấy thay đổi vừa làm ở máy kia ngay | Realtime chỉ trong cùng một máy; tải lại trang là thấy |

---

## 8. Kiểm tra mã

Kiểm tra cú pháp nhanh trước khi triển khai:
```bash
node --check backend/server.js
for f in backend/lib/*.js frontend/js/**/*.js; do node --check "$f"; done
```

---

## 9. Mở rộng tiếp

**Thêm màn hình web:**
1. Tạo `frontend/js/modules/<tên>.js` và gọi `registerView(...)`.
2. Khai báo `<script>` trong `index.html`, đặt trước `main.js`.
3. Dữ liệu mới thì thêm một dòng vào `RULES` trong `server.js`. Mọi lần ghi đi qua `saveDoc()` / `removeDoc()`.

Chi tiết quy ước (đặt tên, `esc()`, màu CSS, form `openForm`) trong `CLAUDE.md`.

Sửa công thức ở `frontend/js/core/model.js` thì kiểm tra lại các màn và báo cáo dùng chung công thức đó.
