"use strict";
/*
 * Chuyển người phụ trách của dự án/đầu việc từ dạng chuỗi đơn sang MẢNG (hỗ trợ nhiều TM/SE/người thực hiện):
 *   dự án:   owner → owners[], se → ses[]        đầu việc: owner → owners[], collab → collabs[]
 *
 * KHÔNG bắt buộc: ứng dụng đọc được cả dữ liệu cũ (peopleOf() ở frontend/js/core/constants.js) và tự chuyển sang mảng ở lần
 * lưu kế tiếp của từng dự án. Script này chỉ để đổi hàng loạt một lần cho gọn.
 *
 *   node --env-file=.env backend/scripts/migrate-multi-people.js            xem trước (KHÔNG ghi gì)
 *   node --env-file=.env backend/scripts/migrate-multi-people.js --apply    ghi (sao lưu tệp SQLite trước nếu là SQLite)
 */
const fs = require("fs"), path = require("path");
const { createStore } = require("../lib/store");
const APPLY = process.argv.includes("--apply");
const arr = (o, plural, single) => {
  const raw = Array.isArray(o[plural]) ? o[plural] : (o[single] ? [o[single]] : []), out = [];
  for (const n of raw) { const s = typeof n === "string" ? n.trim() : ""; if (s && !out.includes(s)) out.push(s); }
  return out;
};
(async () => {
  const store = createStore();
  const rows = await store.getDocs("projects");
  let nProj = 0, nTask = 0; const out = [];
  for (const r of rows) {
    const p = JSON.parse(r.body); let changed = false;
    if (!Array.isArray(p.owners) || !Array.isArray(p.ses) || "owner" in p || "se" in p) {
      p.owners = arr(p, "owners", "owner"); p.ses = arr(p, "ses", "se"); delete p.owner; delete p.se; changed = true;
    }
    for (const t of p.tasks || []) {
      if (!Array.isArray(t.owners) || !Array.isArray(t.collabs) || "owner" in t || "collab" in t) {
        t.owners = arr(t, "owners", "owner"); t.collabs = arr(t, "collabs", "collab"); delete t.owner; delete t.collab; nTask++; changed = true;
      }
    }
    if (changed) { nProj++; out.push([r.doc_id, p]); }
  }
  console.log(`${nProj}/${rows.length} dự án và ${nTask} đầu việc cần chuyển sang dạng mảng.`);
  if (!APPLY) { console.log("Đây là bản xem trước, chưa ghi gì. Thêm --apply để ghi."); process.exit(0); }
  if ((process.env.DB_CLIENT || "mariadb").toLowerCase() === "sqlite") {
    const dir = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data"), src = path.join(dir, "ptkt.db");
    const dst = path.join(dir, "ptkt-truoc-khi-chuyen-nhieu-nguoi-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + ".db");
    fs.copyFileSync(src, dst); console.log("Đã sao lưu SQLite → " + dst);
  } else console.log("(MariaDB: hãy chắc đã chạy deploy/backup.sh trước khi --apply)");
  for (const [id, p] of out) await store.upsertDoc(`projects/${id}`, "projects", id, JSON.stringify(p), "migrate-multi-people");
  console.log("Đã ghi " + out.length + " dự án.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
