"use strict";
/*
 * Chuyển "Hệ số năng lực" của nhân sự từ thang cũ (cấp 1–4, nhân thẳng vào Capacity) sang thang mới 5 cấp
 * (1 · 1,2 · 1,5 · 2 · 3 – xem FACTOR_LEVELS ở frontend/js/core/constants.js).
 *
 *   node --env-file=.env backend/scripts/migrate-factor.js            xem trước (KHÔNG ghi gì): bảng cũ → mới + capacity trước/sau
 *   node --env-file=.env backend/scripts/migrate-factor.js --apply    ghi vào config/staff (sao lưu tệp SQLite trước nếu là SQLite)
 *
 * Quy đổi theo thứ tự cấp: 1 → 1 · 2 → 1,2 · 3 → 1,5 · 4 → 2 (cấp 5 → 3 chưa từng dùng ở thang cũ).
 * Chỉ đổi nhân sự có hệ số ĐÚNG LÀ 1, 2, 3 hoặc 4; hệ số đã thuộc thang mới nhưng trùng số (1 hoặc 2) KHÔNG phân biệt được
 * với thang cũ, nên CHỈ chạy 1 lần và chỉ khi dữ liệu còn là thang cũ. Script từ chối chạy lại nếu thấy dấu "factorScale: 2"
 * đã đánh dấu vào danh sách nhân sự sau lần chạy trước.
 */
const fs = require("fs"), path = require("path");
const { createStore } = require("../lib/store");
const MAP = { 1: 1, 2: 1.2, 3: 1.5, 4: 2 };
const APPLY = process.argv.includes("--apply");
const fmt = x => String(Math.round(x * 10) / 10).replace(".", ",");
(async () => {
  const store = createStore();
  const raw = await store.getDoc("config/staff");
  if (!raw) { console.log("Chưa có config/staff – không có gì để chuyển."); process.exit(0); }
  const doc = JSON.parse(raw), list = doc.list || [];
  if (doc.factorScale === 2) { console.log("Đã chuyển sang thang mới trước đó (factorScale = 2). Không chạy lại."); process.exit(0); }
  console.log("Nhân sự".padEnd(26) + "Hệ số cũ".padEnd(10) + "→ mới".padEnd(8) + "Giờ/tuần".padEnd(10) + "% họp".padEnd(7) + "Capacity cũ → mới");
  let changed = 0;
  const out = list.map(s => {
    const old = +s.factor || 1, nu = MAP[old] !== undefined ? MAP[old] : old;
    const cap = f => Math.round((+s.hours || 0) * (1 - (+s.pct || 0)) * f * 10) / 10;
    console.log(String(s.name).padEnd(26) + String(old).padEnd(10) + fmt(nu).padEnd(8) + String(s.hours).padEnd(10) + (Math.round((+s.pct || 0) * 100) + "%").padEnd(7) + fmt(cap(old)) + " → " + fmt(cap(nu)));
    if (nu !== old || MAP[old] === undefined) { if (MAP[old] === undefined) console.log("   (!) hệ số " + old + " không thuộc thang cũ 1–4, giữ nguyên"); else changed++; }
    return { ...s, factor: nu };
  });
  console.log("\n" + changed + "/" + list.length + " nhân sự đổi hệ số.");
  if (!APPLY) { console.log("Đây là bản xem trước, chưa ghi gì. Thêm --apply để ghi."); process.exit(0); }
  if ((process.env.DB_CLIENT || "mariadb").toLowerCase() === "sqlite") {
    const dir = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data"), src = path.join(dir, "ptkt.db");
    const dst = path.join(dir, "ptkt-truoc-khi-doi-he-so-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + ".db");
    fs.copyFileSync(src, dst); console.log("Đã sao lưu SQLite → " + dst);
  } else console.log("(MariaDB: hãy chắc đã chạy deploy/backup.sh trước khi --apply)");
  await store.upsertDoc("config/staff", "config", "staff", JSON.stringify({ ...doc, list: out, factorScale: 2 }), "migrate-factor");
  console.log("Đã ghi config/staff (factorScale = 2).");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
