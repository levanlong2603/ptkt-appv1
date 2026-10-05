# HƯỚNG DẪN PHÁT TRIỂN & TUỲ BIẾN
## NGSI · Phòng Kỹ thuật – Quản trị công việc và nguồn lực (phiên bản 1.2)

Tài liệu này dành cho người sẽ **chỉnh sửa giao diện, sửa màn hình có sẵn, hoặc viết thêm module mới**. Bạn chỉ cần biết cơ bản HTML/CSS/JavaScript. Nếu chưa biết lập trình, có thể giao việc cho **Claude Code** (Phần 11): tài liệu này và file `CLAUDE.md` giúp Claude Code hiểu dự án.

---

## MỤC LỤC
1. [Có gì mới ở phiên bản 1.1](#1-có-gì-mới-ở-phiên-bản-11)
2. [Kiến trúc trong 5 phút](#2-kiến-trúc-trong-5-phút)
3. [Bản đồ mã nguồn – file nào làm gì](#3-bản-đồ-mã-nguồn)
4. [Chuẩn bị máy lập trình (Windows)](#4-chuẩn-bị-máy-lập-trình-windows)
5. [Quy trình làm việc an toàn](#5-quy-trình-làm-việc-an-toàn)
6. [Bài thực hành 1 – Đổi giao diện: màu, logo, font](#6-bài-thực-hành-1--đổi-giao-diện)
7. [Bài thực hành 2 – Sửa một màn hình có sẵn](#7-bài-thực-hành-2--sửa-màn-hình-có-sẵn)
8. [Bài thực hành 3 – Viết module mới “Rủi ro dự án”](#8-bài-thực-hành-3--viết-module-mới)
9. [Bài thực hành 4 – Thêm API riêng ở máy chủ](#9-bài-thực-hành-4--thêm-api-riêng-ở-máy-chủ)
10. [Đưa thay đổi lên máy chủ thật](#10-đưa-thay-đổi-lên-máy-chủ-thật)
11. [Phát triển cùng Claude Code](#11-phát-triển-cùng-claude-code)
12. [Tra cứu nhanh: biến, hàm, thành phần giao diện](#12-tra-cứu-nhanh)
13. [Lỗi thường gặp khi phát triển](#13-lỗi-thường-gặp-khi-phát-triển)

---

## 1. CÓ GÌ MỚI Ở PHIÊN BẢN 1.1

Phiên bản 1.0 (đang chạy trên máy chủ) có toàn bộ giao diện nằm trong **một file `index.html` dài ~1.500 dòng**, rất khó sửa. Phiên bản 1.1 **giữ nguyên tính năng và dữ liệu** nhưng:

| Thay đổi | Lợi ích |
|---|---|
| Giao diện tách thành **3 file CSS + 17 file JS** theo chức năng | Muốn sửa màn hình nào thì mở đúng file đó |
| Có **cơ chế đăng ký module** (`registerView`, `ACTIONS`, `ON_SESSION`) | Thêm màn hình mới **không cần sửa mã lõi** |
| Quyền ghi dữ liệu khai báo trong bảng **`RULES`** ở `server.js` | Thêm loại dữ liệu mới chỉ cần 1 dòng |
| Lệnh `npm run dev` | Sửa `server.js` là máy chủ tự khởi động lại |
| File `CLAUDE.md` | Claude Code tự đọc để hiểu dự án |
| Module mẫu `examples/risks/` | Mẫu đầy đủ để sao chép khi viết module mới |

> **Cập nhật máy chủ đang chạy 1.0 lên 1.1:** làm đúng mục E5 trong `HUONG-DAN-TRIEN-KHAI.md` (sao lưu → chép mã mới → `npm ci` → khởi động lại). Dữ liệu và tài khoản giữ nguyên.

---

## 2. KIẾN TRÚC TRONG 5 PHÚT

```
┌──────────────────────── TRÌNH DUYỆT ────────────────────────┐        ┌──────── MÁY CHỦ ────────┐
│                                                              │        │                         │
│  S (state) ──derive()──► M (model đã tính) ──► viewXxx()     │  GET   │  server.js              │
│   ▲  dữ liệu thô          workload, tiến độ,     trả về HTML │◄───────│  /api/collection/:coll  │
│   │                       cảnh báo…                 │         │        │                         │
│   │                                             render()      │  PUT   │  RULES kiểm tra quyền   │
│   │   onSnapshot()                                  ▼         │───────►│  /api/doc/:coll/:id     │
│   └────────────── tải lại khi có thay đổi ◄──  #main (màn hình)│        │        │                │
│                                                     │         │  SSE   │        ▼                │
│   write()/remove() ◄── ACTIONS / openForm ◄── bấm data-act    │◄───────│  SQLite: bảng docs      │
└──────────────────────────────────────────────────────────────┘ "change"└─────────────────────────┘
```

**Đọc sơ đồ theo 6 ý:**
1. Dữ liệu trên máy chủ là các **tài liệu JSON** có đường dẫn `collection/id`, ví dụ `projects/p-ddos-19`, `weeks/2026-09-28__pham-hong-lam`.
2. Khi đăng nhập, trình duyệt tải các collection về biến **`S`** (`S.staff`, `S.catalog`, `S.projects`, `S.weeks`).
3. Mỗi lần vẽ, hàm **`derive()`** tính ra **`M`**: workload, trạng thái hiện tại, tiến độ, cảnh báo… Mọi màn hình **chỉ đọc `M`**, không tự tính lại.
4. Mỗi màn hình là một **hàm trả về chuỗi HTML** (`viewExec`, `viewPlan`…). `render()` gọi hàm của màn hình đang chọn và đặt kết quả vào `#main`.
5. Nút bấm có thuộc tính **`data-act="ten"`**. Bấm → chạy `ACTIONS["ten"]`. Form dùng `openForm()`. Lưu dùng `write(path, body)`.
6. Máy chủ lưu xong → phát sự kiện **SSE** cho mọi người đang mở trang → trình duyệt tải lại collection đó → vẽ lại. Nhờ vậy mọi người thấy thay đổi ngay.

**Không có bước build.** Sửa file `.js`/`.css` → lưu → tải lại trình duyệt (Ctrl+F5) là thấy.

---

## 3. BẢN ĐỒ MÃ NGUỒN

```
ptkt-app/
├── server.js                  ★ MÁY CHỦ: đăng nhập, phân quyền (RULES), API, SSE, sao lưu
├── lib/store.js               Lớp lưu trữ: MariaDB (mysql2) hoặc SQLite – mọi câu lệnh SQL nằm ở đây
├── package.json               Thư viện + lệnh npm (start, dev, user)
├── .env.example               Mẫu cấu hình
├── CLAUDE.md                  Ngữ cảnh cho Claude Code
├── HUONG-DAN-TRIEN-KHAI.md    Cài đặt & vận hành máy chủ
├── HUONG-DAN-PHAT-TRIEN.md    Tài liệu này
├── seed/seed.json             Dữ liệu ban đầu (chỉ nạp khi CSDL trống)
├── scripts/
│   ├── manage-user.js         Quản lý tài khoản bằng dòng lệnh
│   ├── migrate-sqlite-to-mariadb.js  Chuyển dữ liệu SQLite → MariaDB
│   └── backup.sh              Sao lưu hằng đêm (tự nhận MariaDB / SQLite)
├── deploy/                    Cấu hình systemd + Nginx
├── examples/
│   └── risks/risks.js         ★ MODULE MẪU – Sổ rủi ro dự án
└── public/                    ★ GIAO DIỆN
    ├── index.html             Khung trang + danh sách file CSS/JS (thứ tự nạp quan trọng)
    ├── css/
    │   ├── theme.css          ★ Màu sắc, font, chế độ tối  ← đổi giao diện bắt đầu từ đây
    │   ├── base.css           Bố cục, menu, bảng, nút, form, thẻ dùng chung
    │   └── dashboard.css      Riêng màn hình Dashboard (lớp .ex-*)
    └── js/
        ├── core/              LÕI – hạn chế sửa
        │   ├── utils.js       Ngày tháng, định dạng số, esc(), store()
        │   ├── constants.js   Loại dự án, trạng thái, biểu tượng, MENU (VIEWS) + registerView/ACTIONS/ON_SESSION
        │   ├── state.js       Biến S
        │   ├── model.js       derive() → M: workload, trạng thái, tiến độ, cảnh báo, rủi ro
        │   ├── data.js        write(), remove(), saveProject(), saveWeek()
        │   ├── export.js      Xuất Excel, sao lưu/khôi phục
        │   ├── ui.js          renderNav(), render(), thành phần dùng chung, openForm()
        │   ├── server.js      Kết nối máy chủ, SSE, đăng nhập, quản lý tài khoản
        │   └── events.js      Xử lý data-act của các màn hình có sẵn
        ├── views/             MỖI MÀN HÌNH MỘT FILE
        │   ├── exec-dashboard.js    Dashboard
        │   ├── project-overview.js  Tổng quan dự án
        │   ├── weekly-load.js       Tải tuần
        │   ├── weekly-input.js      Nhập theo tuần (+ form nhập việc)
        │   ├── plan.js              Kế hoạch dự án (+ form dự án, đầu việc)
        │   ├── settings.js          Cài đặt (+ form nhân sự, đầu việc chuẩn)
        │   └── help.js              Hướng dẫn
        ├── modules/           ★ NƠI ĐẶT MODULE MỚI CỦA BẠN
        └── main.js            Khởi động – luôn nạp cuối cùng
```

**Muốn sửa gì → mở file nào:**

| Muốn… | Mở file |
|---|---|
| Đổi màu chủ đạo, màu nền, font | `public/css/theme.css` |
| Đổi chữ “NGSI”, tiêu đề Dashboard | `public/js/views/exec-dashboard.js` (dòng có `ex-logo`) |
| Đổi chữ trên màn hình đăng nhập | `public/js/core/server.js` (hàm `showLogin`) |
| Đổi tên phòng ở thanh menu | `public/index.html` (dòng `class="brand"`) |
| Đổi tên mục menu / thứ tự menu | `public/js/core/constants.js` (mảng `VIEWS`) |
| Sửa bảng/biểu đồ ở Dashboard | `public/js/views/exec-dashboard.js` + `public/css/dashboard.css` |
| Đổi cách tính rủi ro dự án ở Dashboard | `exec-dashboard.js`, hàm `risk` trong `viewExec` |
| Đổi cách tính cảnh báo “quá hạn / sắp đến hạn” | `public/js/core/model.js` (mảng `warns`) |
| Thêm cột vào form nhập theo tuần | `public/js/views/weekly-input.js` (hàm `entryForm`) |
| Đổi quyền ai được sửa gì | `server.js` (bảng `RULES`, hàm `canWrite`) |
| Thêm / sửa câu truy vấn CSDL | `lib/store.js` (sửa cả phần MariaDB và SQLite) |
| Thêm màn hình mới | Tạo file trong `public/js/modules/` (Bài 3) |

---

## 4. CHUẨN BỊ MÁY LẬP TRÌNH (WINDOWS)

> **Nguyên tắc vàng: không sửa trực tiếp trên máy chủ thật.** Sửa và thử trên máy của bạn trước, chạy ổn rồi mới đưa lên.

### 4.1. Cài phần mềm (một lần)
| Phần mềm | Tải ở | Ghi chú khi cài |
|---|---|---|
| **Node.js 22 LTS** | https://nodejs.org → nút “LTS” | Next liên tục, giữ mặc định. Bỏ tick mục “Tools for Native Modules” cũng được |
| **Visual Studio Code** | https://code.visualstudio.com | Tick “Add to PATH” và “Open with Code” |
| **Git for Windows** | https://git-scm.com/download/win | Giữ mặc định |

Mở **PowerShell mới** và kiểm tra:
```powershell
node -v      # v22.x.x
npm -v
git --version
```

### 4.2. Lấy mã nguồn về máy
Giải nén `ptkt-app.zip` (bản 1.1) vào `D:\ptkt-app` (hoặc thư mục bạn muốn). Mở VS Code → **File → Open Folder…** → chọn `D:\ptkt-app`. Mở cửa sổ lệnh trong VS Code: **Terminal → New Terminal**.

### 4.3. Cài thư viện và cấu hình chạy thử
Gõ trong Terminal của VS Code:
```powershell
npm install
copy .env.example .env
```
Mở file `.env` trong VS Code, sửa thành:
```
PORT=3000
HOST=127.0.0.1
JWT_SECRET=chuoi-thu-nghiem-tren-may-ca-nhan-dai-hon-32-ky-tu
COOKIE_SECURE=false
SESSION_DAYS=30
DB_CLIENT=sqlite
DATA_DIR=./data
```
(Trên máy cá nhân dùng chuỗi bất kỳ ≥ 32 ký tự; máy chủ thật vẫn dùng chuỗi ngẫu nhiên.)

> **Máy cá nhân dùng `DB_CLIENT=sqlite`** – không cần cài MariaDB. Máy chủ thật dùng `DB_CLIENT=mariadb`. Mã nguồn giống hệt nhau; mọi truy cập CSDL đi qua `lib/store.js` nên tính năng viết ở máy bạn chạy được trên máy chủ. Nếu muốn thử với MariaDB ngay trên Windows: cài MariaDB từ https://mariadb.org/download, tạo CSDL như `HUONG-DAN-CHUYEN-MARIADB.md` Bước 3, rồi đặt `DB_CLIENT=mariadb` và các dòng `DB_*`.

Tạo tài khoản thử nghiệm và chạy:
```powershell
npm run user -- create
npm run dev
```
Mở trình duyệt: **http://127.0.0.1:3000** → đăng nhập bằng tài khoản vừa tạo.

**Kiểm tra:** thấy Dashboard với dữ liệu mẫu (16 dự án). Dừng máy chủ: bấm vào Terminal, **Ctrl+C**.

### 4.4. (Tuỳ chọn) Dùng dữ liệu thật để thử
Trên trang thật (máy chủ): **Cài đặt → Dữ liệu → Tải file sao lưu (.json)**. Trên máy bạn: đăng nhập trang thử → **Cài đặt → Khôi phục từ file sao lưu…** → chọn file. Dữ liệu ở máy bạn và máy chủ **độc lập**, sửa thoải mái không ảnh hưởng ai.

### 4.5. Tiện ích VS Code nên cài
Bấm biểu tượng Extensions (Ctrl+Shift+X), cài: **Prettier** (căn chỉnh code), **ESLint**, **Vietnamese Language Pack** (nếu muốn VS Code tiếng Việt).

---

## 5. QUY TRÌNH LÀM VIỆC AN TOÀN

Dùng Git để có thể quay lại khi sửa hỏng. Lần đầu:
```powershell
git init
git add -A
git commit -m "Phiên bản 1.1 gốc"
```
Mỗi lần sửa:

| Bước | Việc | Lệnh / thao tác |
|---|---|---|
| 1 | Chạy máy chủ thử | `npm run dev` |
| 2 | Sửa file trong VS Code, lưu (Ctrl+S) | |
| 3 | Xem kết quả | Trình duyệt **Ctrl+F5** |
| 4 | Mở bảng lỗi trình duyệt | **F12 → tab Console**: không có dòng đỏ |
| 5 | Thử lại các màn hình liên quan, thử cả tài khoản nhân viên | |
| 6 | Lưu mốc | `git add -A` rồi `git commit -m "Mô tả ngắn thay đổi"` |
| 7 | Sửa hỏng muốn quay lại mốc trước | `git checkout -- .` (bỏ mọi thay đổi chưa commit) |
| 8 | Đưa lên máy chủ | Phần 10 |

> Muốn lưu mã nguồn ở nơi an toàn và làm việc nhiều người: tạo kho riêng tư (private) trên GitHub/GitLab nội bộ, rồi `git remote add origin <địa-chỉ>` và `git push`. File `.gitignore` đã loại `.env`, `data/`, `node_modules/`.

---

## 6. BÀI THỰC HÀNH 1 – ĐỔI GIAO DIỆN

### 6.1. Đổi màu chủ đạo
Mở `public/css/theme.css`. Khối `:root{…}` đầu tiên là **chế độ sáng**, hai khối sau là **chế độ tối**.

Ví dụ đổi màu chính từ xanh ngọc sang xanh dương thương hiệu:
```css
/* chế độ sáng – khối :root{ đầu tiên */
  --teal:#1F5EFF; --teal-soft:#DCE6FF;
  --focus:#1F5EFF;
  --side:#0B2A5B;          /* thanh menu trái */
```
```css
/* chế độ tối – sửa ở CẢ HAI khối còn lại */
    --teal:#6E95FF; --teal-soft:#1B2A4D;
```
Lưu → Ctrl+F5. Mọi nút “primary”, thanh tiến độ, ô đang chọn đổi màu theo.

| Biến | Ảnh hưởng |
|---|---|
| `--teal`, `--teal-soft` | Màu chính và nền nhạt của nó |
| `--ink`, `--ink-2`, `--ink-3` | Chữ: đậm, vừa, nhạt |
| `--paper` / `--surface` | Nền trang / nền thẻ, bảng |
| `--line`, `--line-2` | Đường kẻ |
| `--side`, `--side-ink` | Nền và chữ thanh menu |
| `--ok` `--warn` `--bad` (+ `-soft`) | Xanh / vàng / đỏ của trạng thái |
| `--indigo`, `--ochre`, `--grey` | Màu loại Thầu, Tư vấn, Nội bộ |

Màu riêng của **Dashboard** (đỏ/cam/xanh của biểu đồ, nền tiêu đề xanh đậm) nằm ở đầu `public/css/dashboard.css` (lớp `.ex` và `.ex-top`) và hằng `EXC` đầu file `exec-dashboard.js`.

### 6.2. Đổi logo chữ “NGSI” thành logo ảnh
1. Chép file logo (vd `logo-ngsi.png`, nền trong suốt, cao ~80px) vào `public/img/`.
2. Mở `public/js/views/exec-dashboard.js`, tìm `<div class="ex-logo">NGSI</div>` sửa thành:
   ```html
   <div class="ex-logo"><img src="img/logo-ngsi.png" alt="NGSI" style="height:40px;display:block"></div>
   ```
3. Màn hình đăng nhập: mở `public/js/core/server.js`, tìm `<div class="logo">NGSI</div>` sửa tương tự (`height:44px`).

### 6.3. Đổi font chữ
Ví dụ đổi sang **Inter**:
1. `public/index.html`: thay dòng `<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro…">` bằng
   `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">`
2. `public/css/theme.css`: `--font:"Inter", "Segoe UI", Roboto, Arial, sans-serif;`

> Chọn font **có hỗ trợ tiếng Việt** (Be Vietnam Pro, Inter, Roboto, Noto Sans, Montserrat…). Nếu máy chủ không ra Internet, trình duyệt tự dùng font dự phòng.

### 6.4. Đổi tên & thứ tự menu
`public/js/core/constants.js`, mảng `VIEWS`:
```js
const VIEWS = [
  {id:"exec", label:"Dashboard", icon:"exec"},
  {id:"dash", label:"Tổng quan dự án", icon:"dash"},
  …
```
Đổi `label` để đổi tên; đổi thứ tự dòng để đổi thứ tự. **Không đổi `id`** (các file khác dùng `id` để nhận diện màn hình).

---

## 7. BÀI THỰC HÀNH 2 – SỬA MÀN HÌNH CÓ SẴN

**Yêu cầu ví dụ:** ở Dashboard, bảng “Danh sách công việc đang thực hiện” thêm cột **Phối hợp** (người phối hợp) sau cột Phụ trách.

Mở `public/js/views/exec-dashboard.js`, nhấn **Ctrl+F**.

**Bước 1 – thêm tiêu đề cột.** Tìm: `<th>Phụ trách</th>` (trong bảng có `Công việc`, `Dự án`). Sửa thành:
```html
<th>Phụ trách</th><th>Phối hợp</th>
```
**Bước 2 – thêm ô dữ liệu.** Tìm: `<td class="w2">${esc(t.owner||"–")}</td>` sửa thành:
```js
<td class="w2">${esc(t.owner||"–")}</td><td class="w2">${esc(t.collab||"–")}</td>
```
**Bước 3 – sửa số cột của dòng “không có dữ liệu”.** Trong cùng bảng tìm `colspan="11"` đổi thành `colspan="12"`.

Lưu → Ctrl+F5 → Dashboard có cột mới.

**Biết lấy dữ liệu nào?** Trong vòng lặp `list.map((t,i)=>…)`, biến `t` là **một đầu việc** của `M.tasks`. Danh sách đầy đủ các trường của `t` ở **mục 12.2**. Muốn xem trực tiếp: mở F12 → Console, gõ `M.tasks[0]` rồi Enter.

> Mẹo khám phá: trong Console gõ `S`, `M`, `M.projects[0]`, `M.staff`, `M.entries[0]` để xem dữ liệu thật đang dùng.

---

## 8. BÀI THỰC HÀNH 3 – VIẾT MODULE MỚI

**Mục tiêu:** thêm màn hình **“Rủi ro dự án”** – ghi nhận rủi ro (dự án, mô tả, mức độ, người theo dõi, hạn xử lý, trạng thái). Mọi người đều thêm được; tất cả cùng xem. Đây là mẫu chuẩn để bạn làm bất kỳ module nào khác (nghỉ phép, đào tạo, tài sản, họp giao ban…).

### Bước 1 – Cho phép máy chủ lưu loại dữ liệu mới
Mở `server.js`, tìm bảng `RULES`, thêm 1 dòng:
```js
const RULES = {
  config: "admin",
  projects: "admin",
  weeks: "own-week",
  risks: "member",     // ← thêm: mọi tài khoản được thêm/sửa rủi ro
};
```
- `"admin"` – chỉ trưởng phòng ghi.
- `"member"` – mọi người đã đăng nhập đều ghi.
- Mọi người đã đăng nhập đều **đọc** được.

Nếu đang chạy `npm run dev`, máy chủ tự khởi động lại.

### Bước 2 – Tạo file module
Chép `examples/risks/risks.js` vào `public/js/modules/risks.js`.

### Bước 3 – Khai báo file trong trang
Mở `public/index.html`, tìm dòng `<!-- ===== MODULE MỞ RỘNG …`, thêm ngay bên dưới:
```html
<script src="js/modules/risks.js"></script>
```
(phải nằm **trên** dòng `<script src="js/main.js"></script>`).

### Bước 4 – Thử
Ctrl+F5 → menu có mục **“Rủi ro dự án”** → bấm **+ Rủi ro** → điền → Ghi nhận. Mở thêm một trình duyệt khác đăng nhập tài khoản khác: rủi ro hiện ra ngay.

### Bước 5 – Hiểu module (để tự viết module khác)
File `risks.js` gồm 5 phần – mọi module đều theo khuôn này:

**① Dữ liệu – nghe thay đổi từ máy chủ**
```js
S.risks = [];
ON_SESSION.push(db => {
  db.collection("risks").onSnapshot(snap => {
    S.risks = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    schedule();          // vẽ lại màn hình
  });
});
```
`ON_SESSION` chạy sau khi đăng nhập. `onSnapshot` gọi lại mỗi khi ai đó thêm/sửa/xoá rủi ro.

**② Màn hình – hàm trả về HTML**
```js
function viewRisks() {
  let h = `<div class="head"><div><h1>Rủi ro dự án</h1>…</div>
           <button class="btn primary" data-act="risk-add">+ Rủi ro</button></div>`;
  …
  for (const r of list) {
    h += `<tr class="click" data-act="risk-edit" data-id="${esc(r.id)}">…`;
  }
  return h;
}
```
- Dùng các lớp CSS có sẵn (`head`, `band`, `stat`, `panel`, `tbl-wrap`, `pill`…) → module mới tự đồng bộ giao diện, kể cả chế độ tối.
- **Luôn bọc dữ liệu người dùng bằng `esc(...)`** để tránh lỗi hiển thị và lỗ hổng bảo mật.

**③ Form – thêm/sửa/xoá**
```js
openForm({
  title: "Ghi nhận rủi ro",
  values: v,
  fields: [
    { key: "projectId", label: "Dự án", type: "select", options: M.projects.map(p => [p.id, p.name]), required: true },
    { key: "level", label: "Mức độ", type: "seg", options: [[1,"Thấp"],[2,"Trung bình"],[3,"Cao"]] },
    { key: "due", label: "Hạn xử lý", type: "date", half: true },
    …
  ],
  onSave: async x => { await write("risks/" + id, {...}); toast("Đã ghi nhận"); },
  onDelete: async () => { await remove("risks/" + r.id); },
});
```
Các kiểu ô nhập ở **mục 12.4**.

**④ Nút bấm**
```js
ACTIONS["risk-add"]  = () => riskForm(null);
ACTIONS["risk-edit"] = el => riskForm(S.risks.find(x => x.id === el.dataset.id));
```
Phần tử có `data-act="risk-add"` khi bấm sẽ chạy hàm tương ứng. `el.dataset.id` đọc thuộc tính `data-id`.

**⑤ Đăng ký vào menu**
```js
registerView({ id: "risks", label: "Rủi ro dự án", iconSvg: '<svg …>', render: viewRisks });
```
Biểu tượng: lấy SVG nét mảnh 24×24 ở https://lucide.dev (bấm “Copy SVG”), đổi thuộc tính thành `stroke="currentColor" stroke-width="1.8"`.

### Bước 6 – Tự viết module khác: khung mẫu
Tạo `public/js/modules/ten-module.js`:
```js
"use strict";
/* MODULE: <tên> */
S.xxx = [];
ON_SESSION.push(db => db.collection("xxx").onSnapshot(snap => {
  S.xxx = snap.docs.map(d => ({ ...d.data(), id: d.id })); schedule();
}));

function viewXxx() {
  return `<div class="head"><div><h1>Tiêu đề</h1><div class="sub">Mô tả</div></div>
    <button class="btn primary" data-act="xxx-add">+ Thêm</button></div>
    <section class="panel"><div class="panel-b">${S.xxx.length} bản ghi</div></section>`;
}
function xxxForm(item) { /* openForm({...}) */ }

ACTIONS["xxx-add"] = () => xxxForm(null);
registerView({ id: "xxx", label: "Tên menu", iconSvg: "<svg…>", render: viewXxx });
```
+ thêm `xxx: "admin"` hoặc `"member"` vào `RULES` ở `server.js` + khai báo `<script>` trong `index.html`.

**Quy tắc đặt tên:** mọi file JS dùng chung phạm vi toàn cục, nên **đặt tiền tố riêng** cho hàm/hằng của module (`riskForm`, `RISK_LEVELS`, `leaveForm`…). Trùng tên `const` với file khác → trang trắng, Console báo `Identifier 'X' has already been declared`.

**CSS riêng cho module:** tạo `public/css/ten-module.css`, khai báo trong `index.html` ở dòng `<!-- CSS của module mở rộng đặt ở đây -->`:
```html
<link rel="stylesheet" href="css/ten-module.css">
```

**Muốn module xuất hiện ở Dashboard?** Thêm một thẻ vào `exec-dashboard.js` đọc `S.risks` (ví dụ đếm rủi ro mức cao đang mở) – nhớ kiểm tra `S.risks` có tồn tại: `(S.risks||[])`.

---

## 9. BÀI THỰC HÀNH 4 – THÊM API RIÊNG Ở MÁY CHỦ

Phần lớn module chỉ cần `RULES` (Bài 3). Khi cần **tính toán / truy vấn riêng ở máy chủ**, thêm một API. Ví dụ: màn hình “Nhật ký thay đổi” cho trưởng phòng xem 200 thao tác gần nhất.

**Máy chủ** – mở `server.js`, thêm ngay **trên** dòng `/* --- giao diện --- */`:
```js
app.get("/api/audit", auth, adminOnly, A(async (req, res) => {
  res.json(await store.listAudit(200));
}));
```
- `auth` – bắt buộc đăng nhập; `adminOnly` – chỉ trưởng phòng.
- `A(async …)` – bọc route bất đồng bộ để lỗi CSDL được báo đúng cách (bắt buộc với mọi route có `await`).
- **Không viết SQL trực tiếp trong `server.js`.** Cần truy vấn mới → thêm hàm vào **cả hai** phần `createMariaStore()` và `createSqliteStore()` trong `lib/store.js` (ví dụ có sẵn: `listAudit`), để chạy được trên máy chủ (MariaDB) lẫn máy cá nhân (SQLite).

**Giao diện** – `public/js/modules/audit.js`:
```js
"use strict";
S.auditRows = null;
async function loadAudit() {
  try { S.auditRows = await S.db.api("GET", "/api/audit"); } catch (e) { S.auditRows = []; }
  schedule();
}
function viewAudit() {
  if (!S.canEdit) return `<div class="empty"><b>Chỉ trưởng phòng xem được mục này</b></div>`;
  if (S.auditRows === null) { loadAudit(); return `<div class="empty">Đang tải…</div>`; }
  const ACT = { set: "Lưu", delete: "Xoá", login: "Đăng nhập", restore: "Khôi phục", "user-create": "Tạo tài khoản", "user-update": "Sửa tài khoản", "change-password": "Đổi mật khẩu" };
  return `<div class="head"><div><h1>Nhật ký thay đổi</h1><div class="sub">200 thao tác gần nhất</div></div>
    <button class="btn" data-act="audit-reload">Tải lại</button></div>
    <section class="panel tbl-wrap"><table><thead><tr><th>Thời gian</th><th>Tài khoản</th><th>Thao tác</th><th>Dữ liệu</th></tr></thead><tbody>
    ${S.auditRows.map(r => `<tr><td>${new Date(r.ts).toLocaleString("vi-VN")}</td><td>${esc(r.username || "")}</td>
      <td>${esc(ACT[r.action] || r.action)}</td><td class="small muted">${esc(r.path || "")}</td></tr>`).join("")}
    </tbody></table></section>`;
}
ACTIONS["audit-reload"] = () => { S.auditRows = null; schedule(); };
registerView({ id: "audit", label: "Nhật ký thay đổi", position: "bottom",
  iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  render: viewAudit });
```
Khai báo `<script src="js/modules/audit.js"></script>` trong `index.html` như Bài 3.

> `S.db.api(method, url, body)` tự gửi kèm phiên đăng nhập, tự báo lỗi quyền và tự hiện màn hình đăng nhập nếu hết phiên.

---

## 10. ĐƯA THAY ĐỔI LÊN MÁY CHỦ THẬT

### Cách A – Chép file (đơn giản, không cần Git server)
**Trên máy Windows** (thư mục dự án):
```powershell
cd D:\
Compress-Archive -Path .\ptkt-app\* -DestinationPath .\ptkt-app-new.zip -Force
scp .\ptkt-app-new.zip ubuntusv@<IP-máy-chủ>:/tmp/
```
> Trước khi nén, **xoá** thư mục `node_modules`, `data` và file `.env` của máy bạn khỏi bản nén (hoặc nén chọn lọc: `public`, `server.js`, `package.json`, `package-lock.json`, `scripts`, `deploy`, `seed`, `examples`, các file `.md`).

**Trên máy chủ** (SSH):
```bash
sudo /opt/ptkt/scripts/backup.sh                       # 1. sao lưu
rm -rf /tmp/ptkt-new && mkdir /tmp/ptkt-new && cd /tmp/ptkt-new
unzip -o /tmp/ptkt-app-new.zip                          # 2. giải nén
sudo rsync -a --exclude '.env' --exclude 'node_modules' --exclude 'data' /tmp/ptkt-new/ /opt/ptkt/
cd /opt/ptkt && sudo npm ci --omit=dev                  # 3. thư viện (cần nếu package.json đổi)
sudo systemctl restart ptkt                             # 4. khởi động lại
sudo systemctl status ptkt --no-pager                   # 5. kiểm tra: active (running)
```
Báo mọi người tải lại trang (Ctrl+F5).

| Đã sửa | Có cần `restart`? |
|---|---|
| Chỉ file trong `public/` (giao diện) | Không bắt buộc – người dùng Ctrl+F5 là thấy |
| `server.js`, `RULES`, API | **Có** |
| `package.json` (thêm thư viện) | **Có**, và chạy `npm ci --omit=dev` trước |
| `lib/store.js` (truy vấn CSDL) | **Có**. Nếu thêm bảng/cột mới: viết `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` trong `init()` của cả hai phần, và sao lưu trước khi cập nhật |

### Cách B – Dùng Git (khi đã có kho GitHub/GitLab riêng tư)
Máy bạn: `git push`. Máy chủ (lần đầu): nhờ IT cấp khoá truy cập kho, rồi:
```bash
cd /opt/ptkt && sudo git init && sudo git remote add origin <địa-chỉ-kho> && sudo git fetch && sudo git reset --hard origin/main
```
Các lần sau:
```bash
sudo /opt/ptkt/scripts/backup.sh
cd /opt/ptkt && sudo git pull && sudo npm ci --omit=dev && sudo systemctl restart ptkt
```

### Quay lại phiên bản trước nếu bản mới lỗi
- Cách A: giữ lại file zip cũ, làm lại các lệnh trên với file cũ.
- Cách B: `sudo git log --oneline` → `sudo git reset --hard <mã-commit-cũ>` → `sudo systemctl restart ptkt`.
- Dữ liệu hỏng do lỗi code: khôi phục theo mục E3 của `HUONG-DAN-TRIEN-KHAI.md`.

---

## 11. PHÁT TRIỂN CÙNG CLAUDE CODE

Claude Code đọc mã nguồn, sửa file, chạy lệnh thử, giải thích – bạn mô tả bằng tiếng Việt điều mình muốn.

### 11.1. Cài trên máy Windows
```powershell
npm install -g @anthropic-ai/claude-code
cd D:\ptkt-app
claude
```
Lần đầu làm theo hướng dẫn đăng nhập tài khoản Claude. Tài liệu chính thức: https://docs.claude.com/en/docs/claude-code/overview
(Claude Code cũng có trong ứng dụng Claude Desktop – tab **Code** – nếu bạn thích giao diện thay vì dòng lệnh.)

Claude Code **tự đọc file `CLAUDE.md`** ở thư mục dự án, nên đã biết kiến trúc, quy ước và cách mở rộng.

### 11.2. Cách giao việc hiệu quả
1. **Mô tả kết quả mong muốn**, không cần nói cách làm.
2. **Yêu cầu đề xuất trước khi sửa** với thay đổi lớn.
3. **Chạy thử và tự kiểm tra** sau khi sửa.
4. **Commit sau mỗi việc hoàn thành.**

### 11.3. Câu lệnh mẫu
**Thêm module:**
> Tạo module “Nghỉ phép” theo khuôn mẫu của examples/risks: nhân viên đăng ký nghỉ (từ ngày, đến ngày, lý do), trưởng phòng duyệt/từ chối. Nhân viên chỉ sửa đơn của mình, trưởng phòng sửa tất cả – thêm quy tắc phù hợp vào RULES và canWrite. Ở màn hình Tải tuần, capacity của người nghỉ giảm theo số ngày nghỉ trong tuần. Trình bày kế hoạch trước khi viết code.

**Đổi giao diện:**
> Đổi màu chủ đạo sang xanh dương #1F5EFF cho cả chế độ sáng và tối, thay chữ NGSI ở Dashboard và màn hình đăng nhập bằng file public/img/logo.png. Chạy npm run dev và kiểm tra không có lỗi Console.

**Thêm biểu đồ:**
> Ở Dashboard thêm thẻ “Xu hướng mức sử dụng 8 tuần” dạng biểu đồ đường SVG (không dùng thư viện ngoài), đặt ở hàng thứ 3, dùng dữ liệu M.entries và capacity M.staff.

**Sửa lỗi:**
> Nhân viên báo khi chép việc từ tuần trước thì quy mô bị mất. Tìm nguyên nhân trong public/js/views/weekly-input.js, giải thích rồi sửa.

**Rà soát trước khi đưa lên máy chủ:**
> Rà soát toàn bộ thay đổi so với commit trước: có chỗ nào thiếu esc(), trùng tên biến toàn cục, phá vỡ định dạng dữ liệu cũ, hay lỗ hổng quyền ở server.js không?

### 11.4. Lưu ý an toàn
- Làm trên **máy cá nhân**, không chạy Claude Code trực tiếp trên máy chủ thật khi phát triển tính năng.
- Đọc lại thay đổi (VS Code → tab **Source Control** xem từng dòng đổi) trước khi commit.
- Không dán mật khẩu, `JWT_SECRET`, dữ liệu khách hàng nhạy cảm vào cuộc trò chuyện.

---

## 12. TRA CỨU NHANH

### 12.1. `S` – dữ liệu thô & lựa chọn hiện tại (`core/state.js`)
| Trường | Ý nghĩa |
|---|---|
| `S.staff` | `[{name, hours, pct, factor}]` nhân sự |
| `S.catalog` | `[{type, name, qm, pt, result, evidence}]` đầu việc chuẩn |
| `S.projects` | `[{id, name, type, owner, se, milestones, situation, order, tasks:[…]}]` |
| `S.weeks` | `[{week, person, entries:[{id, projectId, taskId, work, qm, pt, status, ms, nn, note}]}]` |
| `S.user` | Tài khoản đang đăng nhập `{username, display_name, staff_name, role}` |
| `S.canEdit` | `true` nếu là trưởng phòng |
| `S.me` | Tên nhân sự đang chọn ở “Tôi là” |
| `S.view` | id màn hình đang mở |
| `S.week` | Ngày thứ 2 của tuần đang xem (`"YYYY-MM-DD"`) |
| `S.db` | Kết nối dữ liệu (`S.db.api(method, url, body)`) |

### 12.2. `M` – dữ liệu đã tính (`core/model.js`, tính lại mỗi lần vẽ)
| Trường | Ý nghĩa |
|---|---|
| `M.today`, `M.thisMon` | Hôm nay, thứ 2 tuần này |
| `M.staff` | Nhân sự + `cap` (capacity điểm/tuần) |
| `M.projects` | Dự án đã sắp xếp + `_tasks`, `_prog` (tiến độ 0–1), `_next` (mốc tiếp theo), `_late`, `_soon`, `_stuck`, `_maxms`, `_phases` |
| `M.pById` | `Map` id dự án → dự án |
| `M.tasks` | Mọi đầu việc, mỗi phần tử có: `p` (dự án), `dv`, `detail`, `owner`, `collab`, `deadline`, `pr`, `qmE`, `ptE`, `wl` (workload), `status` (trạng thái hiện tại), `src`, `ms`, `nn`, `upd`, `lastWeek`, `done`, `ontime`, `warns` (`[[mức,"Quá hạn"],…]`), `phase` |
| `M.entries` | Mọi dòng nhập tuần: `week`, `person`, `projectId`, `taskId`, `ref` (`{p,t}`), `qm`, `pt`, `wl`, `status`, `ms`, `nn`, `work`, `note`, `type` |

### 12.3. Hàm tiện ích
| Hàm | Ví dụ | Kết quả |
|---|---|---|
| `esc(s)` | `esc("<b>")` | `&lt;b&gt;` – **bắt buộc** khi chèn dữ liệu vào HTML |
| `dm(d)`, `dmy(d)` | `dmy("2026-10-05")` | `05/10/2026` |
| `todayISO()`, `mondayOf(d)`, `addDays(d,n)`, `days(a,b)`, `isoWeek(d)` | `isoWeek("2026-09-28")` | `40` |
| `pct(x)`, `fmt1(x)` | `pct(0.913)` | `91%` |
| `uid(prefix)` | `uid("r")` | `r8k2…` mã ngẫu nhiên |
| `toast(msg)` | | Thông báo nhỏ cuối màn hình |
| `write(path, body)` | `write("risks/r1", {...})` | Lưu tài liệu (Promise) |
| `remove(path)` | | Xoá tài liệu |
| `schedule()` | | Vẽ lại màn hình (gộp nhiều lần gọi) |
| `stPill(status)`, `warnPills(warns)`, `typeDot(type)`, `strip(project)`, `weekNav()` | | Thành phần giao diện có sẵn |
| `donut(segs, center, sub, size)` | (Dashboard) | Biểu đồ vòng SVG |

### 12.4. `openForm` – các kiểu ô nhập
```js
openForm({
  title, subtitle, values,            // values: object giá trị ban đầu
  info: "<html hiển thị trên form>",  // tuỳ chọn
  fields: [ … ],
  saveLabel: "Lưu",
  onSave: async values => { … },      // ném lỗi new Error("…") để báo lỗi và giữ form mở
  onDelete: async () => { … },        // trả về false để huỷ đóng form
  readOnly: false
});
```
| `type` | Hiển thị | Thuộc tính thêm |
|---|---|---|
| `text`, `password`, `number` | Ô nhập | |
| `date` | Chọn ngày (giá trị `"YYYY-MM-DD"`) | |
| `textarea` | Ô nhiều dòng | |
| `select` | Danh sách thả xuống | `options: [[giá_trị, "Nhãn"], …]` |
| `seg` | Nhóm nút chọn 1 | `options` như trên |
| `check` | Ô tích | |
| `{heading:"…"}` | Tiêu đề nhóm | |

Thuộc tính chung: `key`, `label`, `required`, `half: true` (2 ô cạnh nhau), `hint: "…"` hoặc `hint: (giá_trị, mọi_giá_trị) => "…"`, `onChange: (giá_trị, api) => api.setOptions("key-khác", [...])` (danh sách phụ thuộc).

### 12.5. Lớp CSS dùng lại
| Lớp | Dùng cho |
|---|---|
| `.head` + `h1` + `.sub` | Tiêu đề màn hình |
| `.band` > `.stat` (`.bad`/`.warn`/`.ok`) > `.v` + `.l` | Dải số liệu lớn |
| `.panel` > `.panel-h` + `.panel-b` | Khung thẻ |
| `.tbl-wrap` > `table`, `tr.click`, `td.num` | Bảng (cuộn ngang trên điện thoại) |
| `.btn`, `.btn.primary`, `.btn.danger`, `.btn.ghost` | Nút |
| `.pill.ok/.warn/.bad/.info/.mute` | Nhãn trạng thái |
| `.empty` (+ `<b>`) | Trạng thái chưa có dữ liệu |
| `.row2`, `.grid2`, `.stack` | Chia cột |
| `.small`, `.muted`, `.cell-main`, `.cell-sub` | Chữ nhỏ, chữ nhạt |

### 12.6. Thứ tự nạp file (trong `index.html`)
`utils → constants → state → model → data → export → ui → views/* → core/server → core/events → modules/* → main`

File nạp sau dùng được hàm của file nạp trước. Mã chạy **ngay khi nạp** (không nằm trong hàm) chỉ được dùng thứ đã nạp trước nó. Module luôn đặt sau `core/events.js` và trước `main.js`.

---

## 13. LỖI THƯỜNG GẶP KHI PHÁT TRIỂN

Luôn mở **F12 → Console** khi thử – dòng đỏ cho biết file và số dòng lỗi.

| Hiện tượng | Nguyên nhân | Cách sửa |
|---|---|---|
| Trang trắng hoặc kẹt “Đang tải dữ liệu…” | Lỗi cú pháp JS | Console chỉ file:dòng. Kiểm tra nhanh: `node --check public/js/modules/ten.js` |
| `Identifier 'X' has already been declared` | Trùng tên `const`/`let` giữa các file | Đổi tên có tiền tố module |
| `X is not defined` | File dùng hàm của file nạp sau, hoặc quên khai báo `<script>` | Kiểm tra thứ tự trong `index.html` |
| Menu không có mục mới | Chưa khai báo `<script>` hoặc chưa gọi `registerView` | |
| Bấm nút không có phản ứng | Sai tên `data-act` so với `ACTIONS[...]` | So khớp chính tả |
| Lưu báo “Bạn không có quyền” | Collection chưa có trong `RULES` hoặc quy tắc là `admin` | Thêm/sửa `RULES`, khởi động lại máy chủ |
| Sửa xong không thấy thay đổi | Trình duyệt dùng bản cũ | Ctrl+F5; với `server.js` cần khởi động lại (`npm run dev` tự làm) |
| Dữ liệu người dùng làm vỡ giao diện | Quên `esc()` | Bọc mọi dữ liệu bằng `esc()` |
| `npm run dev` báo `JWT_SECRET … 32 ký tự` | `.env` thiếu/ngắn | Mục 4.3 |
| `Không kết nối / khởi tạo được cơ sở dữ liệu MariaDB` trên máy cá nhân | `.env` thiếu `DB_CLIENT=sqlite` | Thêm `DB_CLIENT=sqlite` và `DATA_DIR=./data` |
| `EADDRINUSE: address already in use :::3000` | Máy chủ cũ còn chạy | Đóng cửa sổ Terminal cũ, hoặc đổi `PORT=3001` trong `.env` |

---

*Hết tài liệu. Khi viết thêm module, nhớ cập nhật mục “Bản đồ mã nguồn” và file `CLAUDE.md` để người sau (và Claude Code) nắm được.*
