"use strict";
/*
 * CHUYỂN DỮ LIỆU TỪ SQLITE SANG MARIADB
 * ------------------------------------------------------------
 * Đọc file SQLite cũ (mặc định: $DATA_DIR/ptkt.db hoặc biến SQLITE_PATH)
 * và chép toàn bộ: dữ liệu (docs), tài khoản (users – giữ nguyên mật khẩu), nhật ký (audit)
 * sang MariaDB theo các dòng DB_* trong file .env.
 *
 *   node --env-file=.env scripts/migrate-sqlite-to-mariadb.js           chạy thật
 *   node --env-file=.env scripts/migrate-sqlite-to-mariadb.js --check   chỉ kiểm tra, không ghi
 *   ... --force   ghi đè khi MariaDB đã có dữ liệu (XOÁ dữ liệu cũ trong MariaDB)
 *
 * File SQLite KHÔNG bị thay đổi.
 */
const path = require("path");
const fs = require("fs");
const { createSqliteStore, createMariaStore } = require("../lib/store");

const args = new Set(process.argv.slice(2));
const CHECK = args.has("--check"), FORCE = args.has("--force");
const SQLITE_PATH = process.env.SQLITE_PATH || path.join(process.env.DATA_DIR || path.join(__dirname, "..", "data"), "ptkt.db");

(async () => {
  console.log("=== CHUYỂN DỮ LIỆU SQLITE → MARIADB ===");
  if (!fs.existsSync(SQLITE_PATH)) { console.error(`✘ Không tìm thấy file SQLite: ${SQLITE_PATH}\n  Đặt biến SQLITE_PATH=/đường/dẫn/ptkt.db nếu file nằm chỗ khác.`); process.exit(1); }
  const src = createSqliteStore(SQLITE_PATH);
  const dst = createMariaStore();
  try {
    await src.init();
    const docs = await src.allDocs(), users = await src.allUsersRaw(), audits = await src.allAuditRaw();
    console.log(`Nguồn  (SQLite ${SQLITE_PATH}): ${docs.length} tài liệu, ${users.length} tài khoản, ${audits.length} dòng nhật ký`);

    await dst.init();
    const [d0, u0, a0] = [await dst.countDocs(), await dst.countUsers(), await dst.countAudit()];
    console.log(`Đích   (MariaDB ${dst.describe()}): ${d0} tài liệu, ${u0} tài khoản, ${a0} dòng nhật ký`);
    if (CHECK) { console.log("✔ Kết nối hai phía đều được. (--check: không ghi gì)"); return; }
    if ((d0 || u0) && !FORCE) {
      console.error("✘ MariaDB đã có dữ liệu. Dừng lại để tránh ghi đè.\n  Nếu chắc chắn muốn XOÁ dữ liệu trong MariaDB và chép lại từ SQLite, chạy thêm --force.");
      process.exitCode = 1; return;
    }

    // tài liệu (trong 1 giao dịch)
    await dst.replaceAllDocs(docs, "migrate");
    // tài khoản + nhật ký: giữ nguyên id để phiên đăng nhập hiện tại vẫn hợp lệ
    const mysql = require("mysql2/promise");
    const conn = await mysql.createConnection({ host: process.env.DB_HOST || "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || "ptkt", password: process.env.DB_PASSWORD || "", database: process.env.DB_NAME || "ptkt", charset: "utf8mb4_unicode_ci" });
    try {
      await conn.beginTransaction();
      await conn.query("DELETE FROM users"); await conn.query("DELETE FROM audit");
      for (const u of users)
        await conn.query("INSERT INTO users(id,username,pass_hash,display_name,staff_name,role,active,token_version,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
          [u.id, u.username, u.pass_hash, u.display_name, u.staff_name, u.role, u.active, u.token_version, u.created_at]);
      for (let i = 0; i < audits.length; i += 500) {
        const chunk = audits.slice(i, i + 500);
        await conn.query("INSERT INTO audit(id,ts,username,action,path) VALUES ?", [chunk.map(a => [a.id, a.ts, a.username, a.action, a.path])]);
      }
      const maxU = users.reduce((m, u) => Math.max(m, u.id), 0) + 1, maxA = audits.reduce((m, a) => Math.max(m, a.id), 0) + 1;
      await conn.query(`ALTER TABLE users AUTO_INCREMENT = ${maxU}`);
      await conn.query(`ALTER TABLE audit AUTO_INCREMENT = ${maxA}`);
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { await conn.end(); }

    // kiểm tra lại
    const [d1, u1, a1] = [await dst.countDocs(), await dst.countUsers(), await dst.countAudit()];
    let mismatch = 0;
    for (const d of docs) { const b = await dst.getDoc(d.path); if (b !== d.body) mismatch++; }
    console.log(`Kết quả (MariaDB): ${d1} tài liệu, ${u1} tài khoản, ${a1} dòng nhật ký; nội dung khác nguồn: ${mismatch}`);
    if (d1 === docs.length && u1 === users.length && a1 === audits.length && !mismatch) console.log("✔ CHUYỂN DỮ LIỆU THÀNH CÔNG – số lượng và nội dung khớp 100%.");
    else { console.error("✘ Số liệu không khớp – KHÔNG chuyển ứng dụng sang MariaDB, báo lại để kiểm tra."); process.exitCode = 1; }
  } catch (e) {
    console.error(`✘ Lỗi: ${e.code || ""} ${e.message}`); process.exitCode = 1;
  } finally {
    await src.close().catch(() => {}); await dst.close().catch(() => {});
  }
})();
