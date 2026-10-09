"use strict";
/* Hằng số: loại dự án, trạng thái, nguyên nhân ma sát, biểu tượng, menu + bảng đăng ký mở rộng */
/* ================= constants ================= */
const TYPES = ["Triển khai", "Thầu", "Nội bộ"];
const TYPE_COLOR = {"Triển khai":"var(--teal)","Thầu":"var(--indigo)","Nội bộ":"var(--grey)"};
/* Bộ lọc dự án dùng chung cho Kế hoạch dự án & Tổng quan dự án (S.typeFilter) – tách Triển khai thành Đang triển khai / Hoàn thành */
const PLAN_FILTERS = [
  {key:"Tất cả", label:"Tất cả"},
  {key:"Đang triển khai", label:"Đang triển khai", type:"Triển khai", done:false},
  {key:"Hoàn thành", label:"Hoàn thành", type:"Triển khai", done:true},
  {key:"Thầu", label:"Thầu", type:"Thầu"}
];
function planIsDone(p){ return p._prog === 1; }
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
  help:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01"/></svg>'
};
const VIEWS = [
  {id:"exec", label:"Dashboard", icon:"exec"},
  {id:"dash", label:"Tổng quan dự án", icon:"dash"},
  {id:"load", label:"Tải tuần", icon:"load"},
  {id:"input", label:"Nhập theo tuần", icon:"input"},
  {id:"plan", label:"Kế hoạch dự án", icon:"plan"},
  {sep:true},
  {id:"settings", label:"Cài đặt", icon:"set"},
  {id:"help", label:"Hướng dẫn", icon:"help"}
];


/* ---------- Bảng đăng ký mở rộng (dùng khi thêm module mới) ---------- */
/** id màn hình → hàm trả về HTML của màn hình đó */
const VIEW_RENDER = {};
/** tên hành động (thuộc tính data-act trên nút) → hàm xử lý (element, event) */
const ACTIONS = {};
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
