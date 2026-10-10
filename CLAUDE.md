# CLAUDE.md – Ngữ cảnh dự án cho Claude Code

Ứng dụng web nội bộ **NGSI · Phòng Kỹ thuật – Quản trị công việc và nguồn lực**.
Người dùng là người Việt: **giao diện, thông báo, chú thích code viết bằng tiếng Việt có dấu.**

## Kiến trúc
- **Bố cục**: `backend/` máy chủ (server.js, lib/store.js, seed/, scripts/) · `frontend/` giao diện tĩnh (index.html, css/, js/) · `deploy/` systemd + Nginx + script vận hành. Frontend và backend tách thư mục nhưng **cùng một tiến trình Node**: Express phục vụ `frontend/` dưới dạng tệp tĩnh (`backend/server.js`), không có bước build và không có `package.json` riêng cho frontend.
- **Máy chủ**: `backend/server.js` – Node.js ≥ 20.6, Express 4. Truy cập CSDL **chỉ qua `backend/lib/store.js`** (hàm async: getDocs, getDoc, upsertDoc, deleteDoc, users…, audit, listAudit). `DB_CLIENT=mariadb` (máy chủ thật, mysql2) hoặc `sqlite` (máy lập trình, better-sqlite3) – mọi tính năng mới phải chạy được trên cả hai. Route async bọc bằng `A(async (req,res)=>…)`.
- **Dữ liệu**: bảng `docs` (MariaDB: `body` LONGTEXT chứa JSON, utf8mb4) lưu tài liệu JSON theo đường dẫn `<collection>/<id>`. Collections hiện có: `config` (`config/staff`, `config/catalog`, `config/kpiCriteria`), `projects`, `weeks`, `feedback`, `kpiNote`. Quyền ghi khai báo trong hằng `RULES` ở `backend/server.js`:
  - `admin`: chỉ trưởng phòng ghi/xoá.
  - `member`: mọi tài khoản đã đăng nhập ghi/xoá.
  - `own-week`: trưởng phòng ghi tất cả; nhân viên chỉ ghi dữ liệu tuần của chính mình, và chỉ tuần **hiện tại trở đi** (tuần cũ đã khoá với nhân viên, chỉ trưởng phòng sửa được — xem `mondayOfToday()`).
  - `own-project`: trưởng phòng ghi tất cả (kể cả tạo dự án mới); nhân viên sửa được nếu là người tạo (`created_by`) hoặc là TM/SE của dự án, nhưng chỉ người tạo mới xoá được cả dự án. Trường `task.eval`/`task.note` (đánh giá khi hoàn thành, ghi chú trưởng phòng) chỉ trưởng phòng ghi được dù PUT cả dự án.
  - `own`: ai cũng tạo mới được; sửa/xoá thì chỉ người tạo (`created_by`, máy chủ ghi) hoặc trưởng phòng (dùng cho `feedback`).
  Bảng `users`, `audit` (ghi vết mọi lần ghi/xoá, hiện không có UI hiển thị lại nhưng vẫn ghi).
- **Giao diện**: HTML/CSS/JavaScript thuần, **không build, không framework, không npm cho frontend**. Các file `.js` là *classic script* chia sẻ phạm vi toàn cục, nạp theo thứ tự trong `frontend/index.html`; `js/main.js` luôn cuối cùng.
- **Luồng dữ liệu**: máy chủ → `S` (state, `core/state.js`) → `derive()` tạo `M` (model đã tính, `core/model.js`) → hàm `viewXxx()` trả về chuỗi HTML → `render()` gán vào `#main`. Người dùng bấm phần tử có `data-act` → `ACTIONS[act]` hoặc `core/events.js` → `write()`/`remove()` (`core/data.js`) → máy chủ phát sự kiện SSE → client tải lại collection → `schedule()` vẽ lại.

## Màn hình hiện có
Lõi (`frontend/js/views/`): Dashboard (`exec-dashboard.js`), Tổng quan dự án – chỉ xem (`project-overview.js`),
Tải tuần (`weekly-load.js`), Nhập theo tuần (`weekly-input.js`), Kế hoạch dự án (`plan.js`), Cài đặt
(`settings.js`), Hướng dẫn (`help.js`). Module mở rộng (`frontend/js/modules/`, nạp sau lõi): Góp ý
(`feedback.js`, collection `feedback`), Báo cáo (`reports.js`, xuất Excel/PDF, không lưu dữ liệu riêng –
chỉ đọc lại `M`/`S`), KPI & Năng lực (`kpi.js`, Giai đoạn 1 – xem chú thích đầu file để biết phạm vi/giới
hạn). Thứ tự nạp trong `index.html` quyết định thứ tự hiện trên menu trái.

## Công thức Workload / Capacity (`frontend/js/core/constants.js`, `model.js`)
- `Workload (giờ) = QM_HOURS[Quy mô] × PT_MULT[Độ phức tạp]` (hàm `wlOf()`); thiếu Quy mô → `null` (bắt
  buộc); thiếu Độ phức tạp → hệ số mặc định 1,0 (không chặn).
- `Capacity (giờ/tuần) = Giờ/tuần × (1 − % họp, phát sinh) × Hệ số năng lực` (`model.js`, `derive()`).
  Hệ số năng lực **chỉ nhân ở Capacity**, Workload không chia lại cho hệ số (tránh tính trùng).
- Tiến độ dự án (`p._prog`, `p._phases`, `planStat()`) dùng trọng số `t.wl ?? 1` (không phải `t.wl || 0`)
  để đầu việc thiếu Quy mô không "biến mất" khỏi mẫu số gây tiến độ ảo 100%.
- `planIsDone(p)` dựa vào `p._allDone` (mọi đầu việc chưa Hủy đều Hoàn thành), không dùng `p._prog===1`.
- `t.doers` (`model.js`): người "Thực hiện" hiển thị = người được gán sẵn (`t.collab`) **hợp** người đã
  nhập tuần cho đúng đầu việc đó ở **tuần gần nhất có dữ liệu** (không tính mọi tuần từ trước tới giờ).

## Cách mở rộng (ưu tiên, không sửa lõi)
- Màn hình mới: tạo `frontend/js/modules/<ten>.js`, gọi `registerView({id,label,iconSvg,render})`.
- Nút bấm: `ACTIONS["ten-hanh-dong"] = (el, e) => {...}` và dùng `data-act="ten-hanh-dong"` trong HTML.
- Dữ liệu mới: thêm dòng vào `RULES` trong `backend/server.js`; client nghe bằng `ON_SESSION.push(db => db.collection("x").onSnapshot(snap => {...; schedule();}))`.
- Form: dùng `openForm({title, values, fields, onSave, onDelete})` (kiểu field: text, password, number, date, textarea, select, seg, check, heading, badge (hiển thị tĩnh dạng `.pill`, không phải ô nhập – dùng `text`/`tone`, không đọc/ghi `vals`); tuỳ chọn half, required, hint, onChange).
- Khai báo `<script src="js/modules/<ten>.js">` trong `index.html` trước `js/main.js`. CSS riêng: `frontend/css/<ten>.css`.
- Muốn thêm mục menu ở vị trí cụ thể (không phải đầu/cuối danh sách chính): tự thao tác mảng `VIEWS` toàn
  cục sau khi `registerView`/gán trực tiếp (xem `reports.js`, `kpi.js` chèn ngay sau 1 mục có sẵn bằng
  `VIEWS.splice(VIEWS.findIndex(v=>v.id==="...")+1, 0, {...})`).
- Thư viện ngoài nặng (xuất Excel/PDF…): **không** thêm `<script>` tĩnh trong `<head>` (làm chậm mọi trang) –
  tải "lười" bằng cách chèn `<script>` CDN động chỉ khi người dùng thực sự cần (xem `rpLoadScript()` /
  `rpEnsureExcel()` trong `reports.js`). Vẫn không có bước build; chỉ thêm CDN (jsDelivr) cho thư viện cần
  file nhị phân thật (ExcelJS cho `.xlsx`, pdfmake cho `.pdf` – pdfmake có sẵn font Roboto hỗ trợ tiếng Việt).

## Quy ước bắt buộc
- Luôn `esc()` mọi dữ liệu người dùng trước khi chèn vào HTML.
- Đặt tiền tố cho hàm/hằng của module (vd `riskForm`, `RISK_LEVELS`) – mọi file chung phạm vi toàn cục, trùng tên `const` sẽ lỗi trang.
- Màu sắc dùng biến CSS trong `frontend/css/theme.css` (`var(--teal)`, `var(--bad)`…), hỗ trợ chế độ tối.
- Lớp CSS có sẵn: `.head .sub .panel .panel-h .panel-b .band .stat .btn .btn.primary .btn.ghost .btn.danger .pill.(ok|warn|bad|info|mute) .tbl-wrap table tr.click .empty .row2 .grid2 .chips .chip-btn .seg-in .weeknav .hbar .data-ico .data-t`.
- Nhân sự (`S.staff`, `config/staff`) có các trường tuỳ chọn cộng dồn qua nhiều lần mở rộng: `years` (kinh
  nghiệm, chỉ gợi ý), `factor` (hệ số năng lực, 5 mức cố định), `title` (chức danh, dùng cho KPI & Năng
  lực Giai đoạn 2) – tài liệu cũ thiếu trường nào thì coi như rỗng/0, không cần script chuyển đổi.
- Quyền phải kiểm tra ở **máy chủ** (`RULES`/`canWrite`), không chỉ ẩn nút.
- Không đổi định dạng tài liệu đang có (`projects`, `weeks`, `config`) mà không viết bước chuyển đổi dữ liệu.
- Không commit `.env`, `data/`, `node_modules/`.

## Lệnh
- Máy cá nhân: `.env` đặt `DB_CLIENT=sqlite`, `DATA_DIR=./data`.
- Chạy phát triển (tự khởi động lại khi sửa backend/server.js): `npm run dev` → http://127.0.0.1:3000
- Tạo tài khoản: `npm run user -- create`
- Kiểm tra cú pháp: `node --check backend/server.js` và `for f in frontend/js/**/*.js; do node --check "$f"; done`

## Triển khai
Máy chủ thật: mã ở `/opt/ptkt`, CSDL MariaDB `ptkt` (user `ptkt`@localhost), dịch vụ systemd `ptkt`, Nginx. Quy trình cập nhật: sao lưu (`deploy/backup.sh`) → chép mã mới vào `/opt/ptkt` (giữ `.env` và dữ liệu) → `npm ci --omit=dev` → `systemctl restart ptkt`. Luôn sao lưu trước khi cập nhật.
