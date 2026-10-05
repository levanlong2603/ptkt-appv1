"use strict";
/* Trạng thái ứng dụng (S): dữ liệu đã tải + lựa chọn hiện tại của người dùng */
/* ================= state ================= */
const S = {
  db:null, user:null, canEdit:false, conn:"wait",
  staff:[], catalog:[], projects:[], weeks:[],
  view: store("view") || "exec", period:"week", exPr:"Tất cả",
  week: mondayOf(todayISO()),
  me: store("me") || "",
  typeFilter:"Tất cả", openProject:null, planSel:null, planQuery:""
};
