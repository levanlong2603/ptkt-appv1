"use strict";
/* Hằng số: loại dự án, trạng thái, nguyên nhân ma sát, biểu tượng, menu + bảng đăng ký mở rộng */
/* ================= constants ================= */
const TYPES = ["Triển khai", "Thầu", "Tư vấn", "Nội bộ"];
const TYPE_COLOR = {"Triển khai":"var(--teal)","Thầu":"var(--indigo)","Tư vấn":"var(--ochre)","Nội bộ":"var(--grey)"};
const ST_ALL = ["Chưa bắt đầu","Đang làm","Đang vướng","Tạm dừng","Hoàn thành","Hủy"];
const ST_WEEK = ["Đang làm","Đang vướng","Tạm dừng","Hoàn thành","Hủy"];
const OPEN = new Set(["Chưa bắt đầu","Đang làm","Đang vướng","Tạm dừng"]);
const CAUSES = ["Khách hàng","Hãng","Hàng hóa / thiết bị","Cộng sự","Hệ thống","Thay đổi yêu cầu","Chờ quyết định"];
const QM_HINT = {1:"0,5–2 giờ",2:"2–8 giờ",3:"8–24 giờ",4:"trên 24 giờ",5:"cả tuần và hơn"};
const PT_HINT = {1:"Đơn giản",2:"Quen thuộc",3:"Cần chuyên môn",4:"Cần chuyên gia",5:"Chưa có tiền lệ"};
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
