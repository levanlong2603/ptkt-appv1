"use strict";
/* Hằng số: loại dự án, trạng thái, nguyên nhân ma sát, biểu tượng, menu + bảng đăng ký mở rộng */
/* ================= constants ================= */
/* Vai trò tài khoản: admin (hệ thống/khởi tạo CSDL, ẩn khỏi Cài đặt) > head (Trưởng phòng) >
   deputy (Phó phòng) > member (Nhân viên). Hiện admin/head/deputy đều toàn quyền như nhau (FULL_ROLES),
   khớp với FULL_ROLES ở backend/server.js – sẽ tách quyền riêng cho từng vai trò sau. "admin" không có
   nhãn hiển thị ở đây vì không bao giờ xuất hiện trên giao diện (máy chủ đã lọc khỏi GET /api/users). */
const FULL_ROLES = new Set(["admin","head","deputy"]);
const isFullRole = r => FULL_ROLES.has(r);
/* Thứ bậc quản lý tài khoản (khớp ROLE_RANK ở backend/server.js): không sửa được tài khoản/gán được vai
   trò cao hơn cấp của chính mình. Không liên quan quyền ghi dữ liệu dự án/tuần (vẫn ngang nhau ở 3 vai
   trò toàn quyền, xem FULL_ROLES) – chỉ áp dụng cho trang Cài đặt → Tài khoản đăng nhập. */
const ROLE_RANK = {admin:4, head:3, deputy:2, member:1};
/* "admin" chỉ dùng cho nhãn hiển thị CỦA CHÍNH phiên đăng nhập đó (vd trong userbox) – không xuất hiện
   trong danh sách chọn ở form tài khoản vì máy chủ đã ẩn hẳn khỏi GET /api/users. */
const ROLE_LABEL = {admin:"Admin", head:"Trưởng phòng", deputy:"Phó phòng", member:"Nhân viên"};
const TYPES = ["Triển khai", "Thầu", "Nội bộ"];
const TYPE_COLOR = {"Triển khai":"var(--teal)","Thầu":"var(--indigo)","Nội bộ":"var(--grey)"};
/* Bộ lọc dự án dùng chung cho Kế hoạch dự án & Tổng quan dự án (S.typeFilter) – tách Triển khai thành Đang triển khai / Hoàn thành */
const PLAN_FILTERS = [
  {key:"Tất cả", label:"Tất cả"},
  {key:"Đang triển khai", label:"Đang triển khai", type:"Triển khai", done:false},
  {key:"Hoàn thành", label:"Hoàn thành", type:"Triển khai", done:true},
  {key:"Thầu", label:"Thầu", type:"Thầu"}
];
function planIsDone(p){ return !!p._allDone; }
/* TM (Phụ trách) hoặc SE của dự án – dùng để giới hạn những dự án nhân viên được thấy */
function projectAssigned(p, name){ return !!name && (p.owner===name || p.se===name); }
function planMatchFilter(p, key){
  const f = PLAN_FILTERS.find(x=>x.key===key) || PLAN_FILTERS[0];
  if(f.key==="Tất cả") return true;
  if(f.type && p.type!==f.type) return false;
  if(f.done!=null && planIsDone(p)!==f.done) return false;
  return true;
}
const ST_ALL = ["Chưa bắt đầu","Đang làm","Đang vướng","Tạm dừng","Hoàn thành","Hủy"];
const ST_WEEK = ["Đang làm","Đang vướng","Tạm dừng","Hoàn thành","Hủy"];
const OPEN = new Set(["Chưa bắt đầu","Đang làm","Đang vướng","Tạm dừng"]);
const CAUSES = ["Khách hàng","Hãng","Hàng hóa / thiết bị","Cộng sự","Hệ thống","Thay đổi yêu cầu","Chờ quyết định"];
const QM_HINT = {1:"0,5–2 giờ",2:"2–8 giờ",3:"8–12 giờ",4:"12–24 giờ",5:"24–32 giờ"};
const PT_HINT = {1:"Đơn giản",2:"Quen thuộc",3:"Cần chuyên môn",4:"Cần chuyên gia",5:"Chưa có tiền lệ"};
/* Công thức Workload: quy Quy mô (bậc thời gian) ra số giờ đại diện thực tế (trung điểm khoảng giờ ở
   QM_HINT), nhân với hệ số của Độ phức tạp — để Workload (giờ) chia cho Capacity (giờ/tuần, xem
   settings.js) ra đúng % tải thực tế. Độ phức tạp đầu việc (không phải "Độ khó dự án") là yếu tố duy nhất
   cộng thêm vào Quy mô; workload sau đó còn được chia cho Hệ số năng lực người phụ trách (xem model.js). */
const QM_HOURS = {1:1.25, 2:5, 3:10, 4:18, 5:28};
const PT_MULT = {1:0.8, 2:0.9, 3:1.1, 4:1.3, 5:1.5};
/* Thiếu Độ phức tạp (cả theo kế hoạch lẫn danh mục chuẩn đều không có) → coi như hệ số 1 (trung tính),
   không chặn tính workload; Quy mô vẫn là trường bắt buộc nên thiếu qm thì không tính được (null). */
function wlOf(qm, pt){
  if(!qm) return null;
  return Math.round(QM_HOURS[qm]*(pt ? PT_MULT[pt] : 1)*10)/10;
}
const ICONS = {
  dash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  load:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  input:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  plan:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.3"/><circle cx="4.5" cy="12" r="1.3"/><circle cx="4.5" cy="18" r="1.3"/></svg>',
  set:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  exec:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 13l3-3 2.5 2.5L17 8"/></svg>',
  help:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01"/></svg>',
  bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 9a6 6 0 1 1 12 0c0 4.5 1.5 6 1.5 6h-15S6 13.5 6 9z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>',
  grid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="5" height="5" rx="1.2"/><rect x="14" y="4" width="5" height="5" rx="1.2"/><rect x="4" y="14" width="5" height="5" rx="1.2"/><rect x="14" y="14" width="5" height="5" rx="1.2"/></svg>',
  chevronDown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>',
  calendar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="5" width="17" height="16" rx="2.2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  panelLeft:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2.2"/><path d="M9.5 4v16"/><path d="M14.5 10l-2 2 2 2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  task:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  box:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
  logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
  eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3l18 18"/><path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.2 0 10 7 10 7a16.3 16.3 0 0 1-3.2 4"/><path d="M6.6 6.6C3.7 8.4 2 12 2 12s3.8 7 10 7c1.4 0 2.6-.3 3.7-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>'
};
/* "dash" gộp chung "Tổng quan dự án" + "Kế hoạch dự án" (2 tab trong 1 màn – xem project-overview.js:
   viewProject()/plan.js) từ khi có yêu cầu gộp 2 mục menu, không còn mục "plan" riêng nữa. Giữ nguyên id
   "dash" (không đổi tên) để không phải sửa lại các chỗ đang tham chiếu S.view==="dash"/VIEW_RENDER.dash/
   VIEWS.findIndex(v=>v.id==="dash") (reports.js chèn "Báo cáo" ngay sau mục này). */
const VIEWS = [
  {id:"exec", label:"Dashboard", icon:"exec"},
  {id:"dash", label:"Dự án", icon:"dash"},
  {id:"input", label:"Việc trong tuần", icon:"input"}, // gồm 2 tab: Tải tuần (weekly-load.js) | Đầu việc (weekly-input.js) – xem viewWeek()
  {sep:true},
  {id:"settings", label:"Cài đặt", icon:"set"},
  {id:"help", label:"Hướng dẫn", icon:"help"}
];


/* ---------- Bảng đăng ký mở rộng (dùng khi thêm module mới) ---------- */
/** id màn hình → hàm trả về HTML của màn hình đó */
const VIEW_RENDER = {};
/** tên hành động (thuộc tính data-act trên nút) → hàm xử lý (element, event) */
const ACTIONS = {};
/** id màn hình → hàm trả về số thông báo hiện ở menu (0/undefined = không hiện chấm) */
const NAV_BADGE = {};
/** các hàm chạy sau khi đăng nhập, nhận db để đăng ký nghe dữ liệu */
const ON_SESSION = [];
/**
 * Đăng ký một màn hình mới vào menu.
 *   registerView({ id:"risks", label:"Rủi ro", iconSvg:"<svg…>", render: viewRisks })
 *   position: "main" (mặc định – trước nhóm Cài đặt) | "bottom" (cuối menu)
 */
function registerView({id, label, icon, iconSvg, render, position = "main"}){
  const key = icon || id;
  if(iconSvg) ICONS[key] = iconSvg;
  const def = {id, label, icon: key};
  const i = VIEWS.findIndex(v => v.sep);
  if(position === "bottom" || i < 0) VIEWS.push(def); else VIEWS.splice(i, 0, def);
  VIEW_RENDER[id] = render;
}
/* Cho máy chủ (Node) dùng lại đúng bảng hệ số workload khi tính KPI lúc chốt kỳ (modules/kpi-calc.js);
   trên trình duyệt `module` không tồn tại nên dòng này không làm gì. */
if(typeof module!=="undefined" && module.exports) module.exports = {QM_HOURS, PT_MULT, wlOf};
