# CLAUDE.md – Ngữ cảnh dự án cho Claude Code

Ứng dụng web nội bộ **NGSI · Phòng Kỹ thuật – Quản trị công việc và nguồn lực**.
Người dùng là người Việt: **giao diện, thông báo, chú thích code viết bằng tiếng Việt có dấu.**

## Kiến trúc
- **Bố cục**: `backend/` máy chủ (server.js, lib/store.js, seed/, scripts/) · `frontend/` giao diện tĩnh (index.html, css/, js/) · `deploy/` systemd + Nginx + script vận hành · `docs/` tài liệu · `examples/` module mẫu. Frontend và backend tách thư mục nhưng **cùng một tiến trình Node**: Express phục vụ `frontend/` dưới dạng tệp tĩnh (`backend/server.js`), không có bước build và không có `package.json` riêng cho frontend.
- **Máy chủ**: `backend/server.js` – Node.js ≥ 20.6, Express 4. Truy cập CSDL **chỉ qua `backend/lib/store.js`** (hàm async: getDocs, getDoc, upsertDoc, deleteDoc, users…, audit, listAudit). `DB_CLIENT=mariadb` (máy chủ thật, mysql2) hoặc `sqlite` (máy lập trình, better-sqlite3) – mọi tính năng mới phải chạy được trên cả hai. Route async bọc bằng `A(async (req,res)=>…)`.
- **Dữ liệu**: bảng `docs` (MariaDB: `body` LONGTEXT chứa JSON, utf8mb4) lưu tài liệu JSON theo đường dẫn `<collection>/<id>`. Collections hiện có: `config` (staff, catalog), `projects`, `weeks`. Quyền ghi khai báo trong hằng `RULES` ở `backend/server.js` (`admin` | `member` | `own-week`). Bảng `users`, `audit`.
- **Giao diện**: HTML/CSS/JavaScript thuần, **không build, không framework, không npm cho frontend**. Các file `.js` là *classic script* chia sẻ phạm vi toàn cục, nạp theo thứ tự trong `frontend/index.html`; `js/main.js` luôn cuối cùng.
- **Luồng dữ liệu**: máy chủ → `S` (state, `core/state.js`) → `derive()` tạo `M` (model đã tính, `core/model.js`) → hàm `viewXxx()` trả về chuỗi HTML → `render()` gán vào `#main`. Người dùng bấm phần tử có `data-act` → `ACTIONS[act]` hoặc `core/events.js` → `write()`/`remove()` (`core/data.js`) → máy chủ phát sự kiện SSE → client tải lại collection → `schedule()` vẽ lại.

## Cách mở rộng (ưu tiên, không sửa lõi)
- Màn hình mới: tạo `frontend/js/modules/<ten>.js`, gọi `registerView({id,label,iconSvg,render})`.
- Nút bấm: `ACTIONS["ten-hanh-dong"] = (el, e) => {...}` và dùng `data-act="ten-hanh-dong"` trong HTML.
- Dữ liệu mới: thêm dòng vào `RULES` trong `backend/server.js`; client nghe bằng `ON_SESSION.push(db => db.collection("x").onSnapshot(snap => {...; schedule();}))`.
- Form: dùng `openForm({title, values, fields, onSave, onDelete})` (kiểu field: text, password, number, date, textarea, select, seg, check, heading; tuỳ chọn half, required, hint, onChange).
- Khai báo `<script src="js/modules/<ten>.js">` trong `index.html` trước `js/main.js`. CSS riêng: `frontend/css/<ten>.css`.
- Ví dụ mẫu đầy đủ: `examples/risks/risks.js`.

## Quy ước bắt buộc
- Luôn `esc()` mọi dữ liệu người dùng trước khi chèn vào HTML.
- Đặt tiền tố cho hàm/hằng của module (vd `riskForm`, `RISK_LEVELS`) – mọi file chung phạm vi toàn cục, trùng tên `const` sẽ lỗi trang.
- Màu sắc dùng biến CSS trong `frontend/css/theme.css` (`var(--teal)`, `var(--bad)`…), hỗ trợ chế độ tối.
- Lớp CSS có sẵn: `.head .sub .panel .panel-h .panel-b .band .stat .btn .btn.primary .pill.(ok|warn|bad|info|mute) .tbl-wrap table tr.click .empty .row2`.
- Quyền phải kiểm tra ở **máy chủ** (`RULES`/`canWrite`), không chỉ ẩn nút.
- Không đổi định dạng tài liệu đang có (`projects`, `weeks`, `config`) mà không viết bước chuyển đổi dữ liệu.
- Không commit `.env`, `data/`, `node_modules/`.

## Lệnh
- Máy cá nhân: `.env` đặt `DB_CLIENT=sqlite`, `DATA_DIR=./data`.
- Chạy phát triển (tự khởi động lại khi sửa backend/server.js): `npm run dev` → http://127.0.0.1:3000
- Tạo tài khoản: `npm run user -- create`
- Kiểm tra cú pháp: `node --check backend/server.js` và `for f in frontend/js/**/*.js; do node --check "$f"; done`

## Triển khai
Máy chủ thật: mã ở `/opt/ptkt`, CSDL MariaDB `ptkt` (user `ptkt`@localhost), dịch vụ systemd `ptkt`, Nginx. Quy trình cập nhật: `docs/HUONG-DAN-TRIEN-KHAI.md` mục E5. Luôn sao lưu trước khi cập nhật.
