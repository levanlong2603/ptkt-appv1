# CLAUDE.md – Ngữ cảnh dự án cho Claude Code

Ứng dụng web nội bộ **NGSI · Phòng Kỹ thuật – Quản trị công việc và nguồn lực**.
Người dùng là người Việt: **giao diện, thông báo, chú thích code viết bằng tiếng Việt có dấu.**

## Trạng thái phát triển (cập nhật 23/10/2026)
- **Telegram và KPI & Năng lực đang tạm dừng phát triển.** Giữ nguyên mã và dữ liệu hiện có; không tự mở rộng, tái cấu trúc hoặc thay đổi nghiệp vụ của hai phần này khi làm các yêu cầu khác. Chỉ tiếp tục phát triển khi người dùng yêu cầu rõ ràng.
- Ghi chú này không có nghĩa là tắt tính năng đang chạy. Các mô tả kỹ thuật bên dưới vẫn giữ để tham khảo khi phát triển trở lại.

## Kiến trúc
- **Bố cục**: `backend/` máy chủ (server.js, lib/store.js, seed/, scripts/) · `frontend/` giao diện tĩnh (index.html, css/, js/) · `deploy/` systemd + Nginx + script vận hành. Frontend và backend tách thư mục nhưng **cùng một tiến trình Node**: Express phục vụ `frontend/` dưới dạng tệp tĩnh (`backend/server.js`), không có bước build và không có `package.json` riêng cho frontend.
- **Máy chủ**: `backend/server.js` – Node.js ≥ 20.6, Express 4. Truy cập CSDL **chỉ qua `backend/lib/store.js`** (hàm async: getDocs, getDoc, upsertDoc, deleteDoc, users…, audit, listAudit). `DB_CLIENT=mariadb` (máy chủ thật, mysql2) hoặc `sqlite` (máy lập trình, better-sqlite3) – mọi tính năng mới phải chạy được trên cả hai. Route async bọc bằng `A(async (req,res)=>…)`.
- **Dữ liệu**: bảng `docs` (MariaDB: `body` LONGTEXT chứa JSON, utf8mb4) lưu tài liệu JSON theo đường dẫn `<collection>/<id>`. Collections hiện có: `config` (`config/staff`, `config/catalog`, `config/kpiCriteria`), `projects`, `weeks`, `feedback`, `kpiNote`, `events` (Lịch & sự kiện tuần: tab "Lịch" của mục Việc trong tuần, `modules/calendar.js`, quy tắc `own`; `person` do máy chủ ép về chính nhân viên, `""` = sự kiện cả phòng). Quyền ghi khai báo trong hằng `RULES` ở `backend/server.js`:
  - `admin`: chỉ trưởng phòng ghi/xoá.
  - `member`: mọi tài khoản đã đăng nhập ghi/xoá.
  - `own-week`: trưởng phòng ghi tất cả; nhân viên chỉ ghi dữ liệu tuần của chính mình, và chỉ tuần **hiện tại trở đi** (tuần cũ đã khoá với nhân viên, chỉ trưởng phòng sửa được — xem `mondayOfToday()`).
  - `own-project`: trưởng phòng ghi tất cả (kể cả tạo dự án mới); nhân viên sửa được nếu là người tạo (`created_by`) hoặc là TM/SE của dự án, nhưng chỉ người tạo mới xoá được cả dự án. Trường `task.eval`/`task.note` (đánh giá khi hoàn thành, ghi chú trưởng phòng) chỉ trưởng phòng ghi được dù PUT cả dự án.
  - `own`: ai cũng tạo mới được; sửa/xoá thì chỉ người tạo (`created_by`, máy chủ ghi) hoặc trưởng phòng (dùng cho `feedback`).
  Bảng `users`, `audit` (ghi vết mọi lần ghi/xoá, hiện không có UI hiển thị lại nhưng vẫn ghi).
- **Giao diện**: HTML/CSS/JavaScript thuần, **không build, không framework, không npm cho frontend**. Các file `.js` là *classic script* chia sẻ phạm vi toàn cục, nạp theo thứ tự trong `frontend/index.html`; `js/main.js` luôn cuối cùng.
- **Luồng dữ liệu**: máy chủ → `S` (state, `core/state.js`) → `derive()` tạo `M` (model đã tính, `core/model.js`) → hàm `viewXxx()` trả về chuỗi HTML → `render()` gán vào `#main`. Người dùng bấm phần tử có `data-act` → `ACTIONS[act]` hoặc `core/events.js` → `write()`/`remove()` (`core/data.js`) → máy chủ phát sự kiện SSE → client tải lại collection → `schedule()` vẽ lại.

## Màn hình hiện có
Lõi (`frontend/js/views/`): Dashboard (`exec-dashboard.js`), Dự án – 1 trang: danh sách + thống kê, bấm 1 dự án mở trang riêng
với bảng đầu việc (`project-overview.js` + `plan.js`), Việc trong tuần – 2 tab Tải tuần (`weekly-load.js`) | Đầu việc
(`weekly-input.js`), Cài đặt (`settings.js`), Hướng dẫn (`help.js`). Module mở rộng (`frontend/js/modules/`, nạp sau lõi): Góp ý
(`feedback.js`, collection `feedback`), Báo cáo (`reports.js`, xuất Excel/PDF, không lưu dữ liệu riêng –
chỉ đọc lại `M`/`S`; 3 tab ngang hàng: "Báo cáo tuần" – theo dữ liệu Nhập theo tuần/Tải tuần (lọc Loại dự
án/Nhân sự/Tuần), bảng chi tiết gộp ô (rowspan, class `.rp-sec-grn`) theo cấp Người thực hiện (chỉ khi xem
"Tất cả nhân sự") → Dự án → Hạng mục → Đầu việc, cột "Chi tiết thực hiện" lấy từ việc đã làm trong tuần
(`e.work`); "Báo cáo dự án" – 1 dự án cụ thể theo kỳ tuần/tháng, dải KPI + bảng "Danh sách đầu việc" gộp ô
theo Hạng mục, cột "Chi tiết thực hiện" lấy "Nội dung chi tiết" tĩnh của đầu việc (`t.detail`) – khác tab
Báo cáo tuần (không có phần nhân sự); "Báo cáo tổng hợp dự án" – toàn bộ dự án đang chạy theo kỳ tuần/
tháng, dải KPI + đúng 1 bảng "Tình hình các dự án" theo đúng mẫu Excel giấy của phòng (STT/Tên dự án/Người
phụ trách/SE/Mốc HĐ/Tiến độ hiện tại/Vướng mắc/Đề xuất, đầu cột tô vàng, class `.rp-sec-xl`), không có
bảng tải nhân sự riêng. Cả 2 bảng gộp ô (`.rp-sec-grn`/`.rp-sec-xl`) đều không có thanh tiêu đề tối phía
trên như kiểu `.rp-sec-h` cũ. Quá hạn/Sắp hạn/Rủi ro ở 2 tab theo kỳ luôn tính theo tình trạng hiện tại
lúc xuất, không truy hồi lại đúng thời điểm cuối kỳ vì không lưu ảnh chụp tiến độ lịch sử – chỉ "Xong
trong kỳ" lọc thật theo kỳ đã chọn), KPI & Năng lực (`kpi.js`, Giai đoạn 1 – xem chú thích đầu file để
biết phạm vi/giới hạn). Thứ tự nạp trong `index.html` quyết định thứ tự hiện trên menu trái.

## Bot Telegram (`backend/bot/`)
- Chạy **chung tiến trình** với web (server.js gọi `require("./bot").create(...)`, `bot.start()` sau khi listen) để ghi
  qua đúng `saveDoc()`/`setTaskPt()` của server.js (cùng `canWrite`, audit, `broadcast` SSE). **Mọi đường ghi mới
  (web hay bot) phải đi qua `saveDoc()`**, không gọi thẳng `store.upsertDoc` cho dữ liệu người dùng.
- Bật bằng `.env`: `TELEGRAM_BOT_TOKEN` ở **cả 2 máy** (cấp mã liên kết), `TELEGRAM_ENABLED=true` chỉ ở **1 máy**
  (nhận tin + lịch; 2 máy cùng nhận → 409). Vì web chạy sau A10 nên **không giữ trạng thái bot trong bộ nhớ** – mã
  liên kết (`telegramCode/*`), liên kết, mốc lịch đều ở CSDL. Long polling – chỉ cần ra Internet tới api.telegram.org.
  `TELEGRAM_API_BASE` chỉ dùng khi kiểm thử với Telegram giả.
- `telegram.js` (Bot API qua fetch) · `core.js` (phiên hội thoại, nút, thẻ Xác nhận/Sửa dùng chung – xem chú thích đầu
  file để biết giao diện 1 "luồng") · `router.js` (lệnh → module; `/help` và menu "/" theo vai trò, lệnh `full:true` chỉ
  cho FULL_ROLES) · `flows/week.js` (`/nhap`, `/tuannay` + sửa/xoá dòng, `/cheptuan`, AI; bám đúng `entryForm`/`copyPrev`
  ở weekly-input.js: giờ 0,5–32, không vượt capacity còn lại, 1 dòng/đầu việc/tuần trừ Nội bộ; qm suy ra từ giờ) ·
  `flows/views.js` (`/tai`, `/duan`, `/hantoi`, `/viectoi` – chỉ đọc) · `flows/manage.js` (`/themduan`, `/themviec`,
  `/tinhhinh` – bám `projectForm`/`taskForm` ở plan.js) · `flows/misc.js` (`/gopy`, `/nhatky`) · `notify.js` (báo "được
  giao việc": `saveDoc` gọi `bot.onSaved` → hàng đợi `telegramOutbox/*` → máy chạy bot gửi mỗi 15 giây) ·
  `scheduler.js` (nhắc nhập tuần, cảnh báo quá tải/vướng, tóm tắt tuần; cấu hình `config/telegram`, mốc đã gửi
  `telegramState/*`) · `ai/` (đa hãng: `AI_PROVIDER=none|anthropic|openai`, chỉ tạo bản nháp, luôn qua Xác nhận).
- Thêm lệnh mới: viết vào module phù hợp trong `flows/` (trả về `{flows, commands, handlers, statics}`), thêm tên lệnh
  vào `GROUPS` ở router.js để hiện trong `/help`. Mọi thao tác ghi phải đi qua thẻ Xác nhận và `saveDoc()`/`removeDoc()`.
- Liên kết tài khoản: `POST /api/telegram/link-code` (mã 1 lần, 10 phút) → nhắn bot `/start <mã>` →
  `telegramLink/u<userId>`. `telegramLink`/`telegramState`/`telegramCode`/`telegramOutbox` có quy tắc `"server"` và
  `READ_ROLES` rỗng.
- Phía máy chủ tính Workload/Capacity/trạng thái đầu việc/tiến độ dự án (`taskInfo`, `projectSummary`) ở `backend/lib/workload.js` – hằng số nạp thẳng từ
  `frontend/js/core/constants.js` bằng `vm`; **sửa công thức ở model.js thì sửa tương ứng ở workload.js**.
- Giao diện: `frontend/js/modules/telegram.js` (menu tài khoản → "Liên kết Telegram"; trưởng phòng thêm "Lịch tự động Telegram").

## Công thức Workload / Capacity (`frontend/js/core/constants.js`, `model.js`)
- **Đầu việc theo kế hoạch**: `Workload (giờ) = QM_HOURS[Quy mô]`, thiếu Quy mô thì `null`.
- **Một lượt nhập tuần**: Workload bằng `e.hours`, không nhân hệ số độ phức tạp. Dòng cũ thiếu giờ dùng `wlOf(e.qm, e.pt)` theo Quy mô. Quy mô và Độ phức tạp vẫn giữ để tham khảo; Độ phức tạp vẫn đồng bộ về đầu việc khi lưu. Công thức này áp dụng cho cả web, KPI và Telegram, kể cả khi đọc tuần cũ.
- `Capacity (giờ/tuần) = 40` cố định cho mọi nhân sự trên web, KPI và bot Telegram. Không áp dụng hệ số năng lực hay phần trăm trừ họp/phát sinh; giữ tương thích các trường dữ liệu cũ.
- Tiến độ dự án trên web (`p._prog`, `p._phases`, `planStat()`) = số đầu việc Hoàn thành / số đầu việc chưa Hủy. Mỗi đầu việc có trọng số bằng nhau, không phụ thuộc Quy mô cũ. Đây là ngoại lệ có chủ đích với logic Telegram/KPI đang tạm dừng; không tự cập nhật hai module đó.
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
  `rpEnsureExcel()`/`rpEnsurePdf()` trong `reports.js`). Vẫn không có bước build; chỉ thêm CDN (jsDelivr)
  cho thư viện cần file nhị phân thật: ExcelJS cho `.xlsx` (dựng bảng thật, gộp ô bằng `ws.mergeCells`);
  PDF dùng html2canvas + jsPDF – chụp đúng khối DOM `#rp-print` đang hiển thị thành ảnh rồi dán vào từng
  trang A4 (`rpExportPdf()`), đảm bảo PDF luôn giống hệt bảng xem trước trên web, không tự dựng lại bảng.

## Quy ước bắt buộc
- Lưu việc tuần trên web qua `POST /api/weeks/save`: gửi `document`, `revision` của tuần đã đọc và `deadlineUpdates` (kèm `expectedDeadline`). `saveWeekBundle()` chuẩn bị qua `saveDoc()` với `atomicDocs()`, rồi `store.commitDocs()` so sánh/ghi toàn bộ trong một giao dịch SQLite/MariaDB. Sai quyền, dữ liệu hoặc phiên bản thì không lưu phần nào; audit/SSE chỉ phát sau commit. Client không PATCH deadline riêng trước khi lưu tuần. Endpoint kiểm tra giờ 0,5–32, tổng tải không quá 40 giờ, đầu việc tồn tại/trùng; vẫn cho phép dòng nháp chưa có giờ khi chép tuần.
- Đồng bộ web giữa nhiều máy chủ: giữ SSE và kiểm tra `GET /api/versions` mỗi 15 giây khi tab hiển thị. Fingerprint tính từ nội dung và đường dẫn tài liệu trong CSDL chung, phát hiện cả sửa/xoá/restore; máy chủ cache tối đa 5 giây. Client chỉ tải lại collection có phiên bản đổi, kiểm tra ngay khi quay lại tab và dừng polling khi đóng kết nối/đăng xuất. Không polling các collection KPI/Telegram. Kiểm thử: `tests/week-bundle.test.js`, `tests/web-sync.test.js`.
- Trạng thái đầu việc trên web: nhập Excel là một lần cập nhật tại thời điểm **lưu nhập thành công**, không dùng ngày sửa của file và không chỉ coi là trạng thái ban đầu. Máy chủ ghi `task.updatedAt` và `task.init.statusUpdatedAt`; nhập tuần ghi `entry.updatedAt`/`entry.statusUpdatedAt`. `model.js` chọn trạng thái có `statusUpdatedAt` mới nhất giữa dự án và tuần. Form dự án hiển thị trạng thái đang có hiệu lực; `_statusChanged` chỉ gửi khi thực sự đổi lựa chọn. Sửa deadline/tên/giờ không tự ghi đè mốc trạng thái. Dữ liệu cũ thiếu mốc thời gian vẫn đọc theo quy tắc cũ, không tự gán thời điểm nhập giả. Đây là thay đổi luồng web/lưu chung; Telegram và KPI vẫn tạm dừng, chưa cập nhật riêng logic đọc của hai module này. Kiểm thử: `node --test tests/task-status-updates.test.js`.
- Chống ghi đè dự án: API đọc `projects` trả `_rev` (SHA-256 của JSON gốc). Khi PUT phải gửi lại đúng `_rev` đã đọc; `normalizeProjectPeople()` giữ metadata này dù `clean()` bỏ các trường `_`. Máy chủ trả HTTP 409 nếu phiên bản cũ và dùng `store.compareAndSwapDoc()` để so sánh/ghi nguyên tử trên SQLite/MariaDB. `_rev` không lưu trong JSON. Không tự thay bằng phiên bản mới hoặc tự thử lại ghi toàn bộ dự án khi có xung đột; giữ form để người dùng sao chép nội dung, tải lại rồi mở lại form. Các route sửa riêng deadline/độ phức tạp/ghi chú cũng kiểm tra trước khi ghi. Kiểm thử: `node --test tests/project-conflict.test.js`.
- Luôn `esc()` mọi dữ liệu người dùng trước khi chèn vào HTML.
- Đặt tiền tố cho hàm/hằng của module (vd `riskForm`, `RISK_LEVELS`) – mọi file chung phạm vi toàn cục, trùng tên `const` sẽ lỗi trang.
- Màu sắc dùng biến CSS trong `frontend/css/theme.css` (`var(--teal)`, `var(--bad)`…), hỗ trợ chế độ tối.
- Lớp CSS có sẵn: `.head .sub .panel .panel-h .panel-b .band .stat .btn .btn.primary .btn.ghost .btn.danger .pill.(ok|warn|bad|info|mute) .tbl-wrap table tr.click .empty .row2 .grid2 .chips .chip-btn .seg-in .weeknav .hbar .data-ico .data-t`.
- Nhân sự (`S.staff`, `config/staff`) có các trường tuỳ chọn cộng dồn qua nhiều lần mở rộng: `years` (kinh
  nghiệm, chỉ gợi ý), `factor` (hệ số năng lực, 5 mức cố định), `title` (chức danh, dùng cho KPI & Năng
  lực Giai đoạn 2) – tài liệu cũ thiếu trường nào thì coi như rỗng/0, không cần script chuyển đổi.
- Người của dự án/đầu việc là **mảng** (nhiều người): dự án `owners[]` (TM), `ses[]` (SE); đầu việc `owners[]` (TM), `collabs[]`
  (người thực hiện) – chỉnh riêng từng đầu việc, sửa TM dự án không đổi đầu việc cũ. Dữ liệu cũ (chuỗi `owner/se/collab`) đọc
  được qua `peopleOf()` (`core/constants.js`, bản tương đương ở `backend/server.js`); lưu thì ghi mảng và xoá trường chuỗi
  (`normalizeProjectPeople()` ở `core/data.js`, máy chủ chuẩn hoá lại). Luôn dùng `pOwners/pSes/tOwners/tCollabs`, không đọc
  thẳng `p.owner`. Đổi hàng loạt (tuỳ chọn): `backend/scripts/migrate-multi-people.js`.
- Dự án (`projects/<id>`) có 2 trường tường thuật hiện ở Kế hoạch dự án/Tổng quan dự án: `milestones` (Mốc
  hợp đồng), `situation` (Tình hình/vướng mắc chung); và 2 trường thêm sau, nhập chung 1 form `projectForm`
  (plan.js) nhưng **chỉ hiện ở Báo cáo → Báo cáo tổng hợp dự án**, không hiện lại ở thẻ dự án: `progress`
  (Tiến độ hiện tại), `proposal` (Đề xuất) – cố ý tách theo yêu cầu người dùng, đừng gộp lại khi sửa.
- Quyền phải kiểm tra ở **máy chủ** (`RULES`/`canWrite`), không chỉ ẩn nút.
- Không đổi định dạng tài liệu đang có (`projects`, `weeks`, `config`) mà không viết bước chuyển đổi dữ liệu.
- Không commit `.env`, `data/`, `node_modules/`.

## Lệnh

- Phiên đăng nhập: JWT chứa `sid` riêng từng lần đăng nhập; bảng `sessions` lưu thời điểm hoạt động và hạn tuyệt đối, hỗ trợ SQLite/MariaDB. Sau 30 phút không hoạt động, phiên luôn bị từ chối kể cả gửi lại token hoặc khởi động lại máy chủ. Chỉ `POST /api/activity` gia hạn; đăng xuất xoá phiên hiện tại. Token cũ không có `sid` phải đăng nhập lại. Kiểm tra bằng `node --test tests/session-timeout.test.js`.
- Máy cá nhân: `.env` đặt `DB_CLIENT=sqlite`, `DATA_DIR=./data`.
- Chạy phát triển (tự khởi động lại khi sửa backend/server.js): `npm run dev` → http://127.0.0.1:3000
- Tạo tài khoản: `npm run user -- create`
- Kiểm tra cú pháp: `node --check backend/server.js` và `for f in frontend/js/**/*.js; do node --check "$f"; done`

## Triển khai
Máy chủ thật: mã ở `/opt/ptkt`, CSDL MariaDB `ptkt` (user `ptkt`@localhost), dịch vụ systemd `ptkt`, Nginx. Quy trình cập nhật: sao lưu (`deploy/backup.sh`) → chép mã mới vào `/opt/ptkt` (giữ `.env` và dữ liệu) → `npm ci --omit=dev` → `systemctl restart ptkt`. Luôn sao lưu trước khi cập nhật.

