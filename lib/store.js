"use strict";
/*
 * LỚP LƯU TRỮ – một giao diện chung cho 2 loại cơ sở dữ liệu
 *   DB_CLIENT=mariadb  (mặc định từ phiên bản 1.2) – dùng thư viện mysql2
 *   DB_CLIENT=sqlite   – dùng better-sqlite3 (máy lập trình cá nhân, hoặc quay lại phương án cũ)
 *
 * Mọi hàm đều trả về Promise (dùng với await), nên server.js không cần biết đang dùng loại nào.
 */
const path = require("path");
const fs = require("fs");

const CLIENT = (process.env.DB_CLIENT || "mariadb").toLowerCase();

/* =====================================================================
 * MARIADB
 * ===================================================================== */
function createMariaStore() {
  const mysql = require("mysql2/promise");
  const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "ptkt",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "ptkt",
    charset: "utf8mb4_unicode_ci",
    connectionLimit: Number(process.env.DB_POOL) || 10,
    waitForConnections: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
    dateStrings: true,
  });
  const q = async (sql, params) => (await pool.query(sql, params))[0];

  return {
    name: "MariaDB",
    describe: () => `${process.env.DB_USER || "ptkt"}@${process.env.DB_HOST || "127.0.0.1"}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || "ptkt"}`,

    async init() {
      await q(`CREATE TABLE IF NOT EXISTS docs(
        path VARCHAR(255) NOT NULL PRIMARY KEY,
        collection VARCHAR(64) NOT NULL,
        doc_id VARCHAR(200) NOT NULL,
        body LONGTEXT NOT NULL,
        updated_at BIGINT NOT NULL,
        updated_by VARCHAR(64) NULL,
        INDEX idx_docs_collection (collection)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      await q(`CREATE TABLE IF NOT EXISTS users(
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(64) NOT NULL UNIQUE,
        pass_hash VARCHAR(100) NOT NULL,
        display_name VARCHAR(200) NOT NULL,
        staff_name VARCHAR(200) NULL,
        role ENUM('admin','member') NOT NULL,
        active TINYINT NOT NULL DEFAULT 1,
        token_version INT NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      await q(`CREATE TABLE IF NOT EXISTS audit(
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        ts BIGINT NOT NULL,
        username VARCHAR(64) NULL,
        action VARCHAR(40) NOT NULL,
        path VARCHAR(255) NULL,
        INDEX idx_audit_ts (ts)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    },

    /* ---- tài liệu ---- */
    async countDocs() { return Number((await q("SELECT COUNT(*) AS c FROM docs"))[0].c); },
    async getDocs(coll, weekGte) {
      return weekGte
        ? q("SELECT doc_id, body FROM docs WHERE collection=? AND JSON_VALUE(body,'$.week') >= ?", [coll, weekGte])
        : q("SELECT doc_id, body FROM docs WHERE collection=?", [coll]);
    },
    async getDoc(p) { const r = await q("SELECT body FROM docs WHERE path=?", [p]); return r[0] ? r[0].body : null; },
    async upsertDoc(p, coll, id, body, user) {
      await q(`INSERT INTO docs(path,collection,doc_id,body,updated_at,updated_by) VALUES(?,?,?,?,?,?)
               ON DUPLICATE KEY UPDATE body=VALUES(body), updated_at=VALUES(updated_at), updated_by=VALUES(updated_by)`,
        [p, coll, id, body, Date.now(), user]);
    },
    async deleteDoc(p) { await q("DELETE FROM docs WHERE path=?", [p]); },
    async allDocs() { return q("SELECT path, body FROM docs"); },
    async replaceAllDocs(rows, user) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query("DELETE FROM docs");
        for (const r of rows)
          await conn.query("INSERT INTO docs(path,collection,doc_id,body,updated_at,updated_by) VALUES(?,?,?,?,?,?)",
            [r.path, r.collection, r.doc_id, r.body, r.updated_at || Date.now(), r.updated_by ?? user]);
        await conn.commit();
      } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    },

    /* ---- tài khoản ---- */
    async getUserById(id) { return (await q("SELECT * FROM users WHERE id=?", [id]))[0] || null; },
    async getUserByUsername(u) { return (await q("SELECT * FROM users WHERE username=?", [u]))[0] || null; },
    async listUsers() { return q("SELECT * FROM users ORDER BY role, display_name"); },
    async createUser(u) {
      const r = await q("INSERT INTO users(username,pass_hash,display_name,staff_name,role,active,token_version,created_at) VALUES(?,?,?,?,?,?,?,?)",
        [u.username, u.pass_hash, u.display_name, u.staff_name || null, u.role, u.active ?? 1, u.token_version ?? 0, u.created_at || Date.now()]);
      return r.insertId;
    },
    async insertUserRaw(u) {
      await q("INSERT INTO users(id,username,pass_hash,display_name,staff_name,role,active,token_version,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        [u.id, u.username, u.pass_hash, u.display_name, u.staff_name || null, u.role, u.active, u.token_version, u.created_at]);
    },
    async updateUser(id, f) {
      const keys = Object.keys(f); if (!keys.length) return;
      await q(`UPDATE users SET ${keys.map(k => `${k}=?`).join(", ")} WHERE id=?`, [...keys.map(k => f[k]), id]);
    },
    async countActiveAdmins() { return Number((await q("SELECT COUNT(*) c FROM users WHERE role='admin' AND active=1"))[0].c); },
    async countAdmins() { return Number((await q("SELECT COUNT(*) c FROM users WHERE role='admin'"))[0].c); },
    async countUsers() { return Number((await q("SELECT COUNT(*) c FROM users"))[0].c); },

    /* ---- nhật ký ---- */
    async audit(username, action, p) { await q("INSERT INTO audit(ts,username,action,path) VALUES(?,?,?,?)", [Date.now(), username || null, action, p || null]); },
    async insertAuditRaw(a) { await q("INSERT INTO audit(id,ts,username,action,path) VALUES(?,?,?,?,?)", [a.id, a.ts, a.username, a.action, a.path]); },
    async listAudit(limit) { return q("SELECT id, ts, username, action, path FROM audit ORDER BY id DESC LIMIT ?", [Number(limit) || 200]); },
    async countAudit() { return Number((await q("SELECT COUNT(*) c FROM audit"))[0].c); },

    async ping() { await q("SELECT 1"); },
    async close() { await pool.end(); },
  };
}

/* =====================================================================
 * SQLITE
 * ===================================================================== */
function createSqliteStore(file) {
  const Database = require("better-sqlite3");
  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
  const dbFile = file || path.join(DATA_DIR, "ptkt.db");
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new Database(dbFile);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  const one = (sql, ...a) => db.prepare(sql).get(...a) || null;
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);

  return {
    name: "SQLite",
    describe: () => dbFile,
    async init() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS docs(path TEXT PRIMARY KEY, collection TEXT NOT NULL, doc_id TEXT NOT NULL,
          body TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT);
        CREATE INDEX IF NOT EXISTS idx_docs_collection ON docs(collection);
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
          pass_hash TEXT NOT NULL, display_name TEXT NOT NULL, staff_name TEXT,
          role TEXT NOT NULL CHECK (role IN ('admin','member')), active INTEGER NOT NULL DEFAULT 1,
          token_version INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, username TEXT, action TEXT NOT NULL, path TEXT);`);
    },
    async countDocs() { return one("SELECT COUNT(*) AS c FROM docs").c; },
    async getDocs(coll, weekGte) {
      return weekGte
        ? all("SELECT doc_id, body FROM docs WHERE collection=? AND json_extract(body,'$.week') >= ?", coll, weekGte)
        : all("SELECT doc_id, body FROM docs WHERE collection=?", coll);
    },
    async getDoc(p) { const r = one("SELECT body FROM docs WHERE path=?", p); return r ? r.body : null; },
    async upsertDoc(p, coll, id, body, user) {
      run(`INSERT INTO docs(path,collection,doc_id,body,updated_at,updated_by) VALUES(?,?,?,?,?,?)
           ON CONFLICT(path) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at, updated_by=excluded.updated_by`,
        p, coll, id, body, Date.now(), user);
    },
    async deleteDoc(p) { run("DELETE FROM docs WHERE path=?", p); },
    async allDocs() { return all("SELECT path, collection, doc_id, body, updated_at, updated_by FROM docs"); },
    async replaceAllDocs(rows, user) {
      const ins = db.prepare("INSERT INTO docs(path,collection,doc_id,body,updated_at,updated_by) VALUES(?,?,?,?,?,?)");
      db.transaction(() => {
        db.prepare("DELETE FROM docs").run();
        for (const r of rows) ins.run(r.path, r.collection, r.doc_id, r.body, r.updated_at || Date.now(), r.updated_by ?? user);
      })();
    },
    async getUserById(id) { return one("SELECT * FROM users WHERE id=?", id); },
    async getUserByUsername(u) { return one("SELECT * FROM users WHERE username=?", u); },
    async listUsers() { return all("SELECT * FROM users ORDER BY role, display_name"); },
    async createUser(u) {
      return run("INSERT INTO users(username,pass_hash,display_name,staff_name,role,active,token_version,created_at) VALUES(?,?,?,?,?,?,?,?)",
        u.username, u.pass_hash, u.display_name, u.staff_name || null, u.role, u.active ?? 1, u.token_version ?? 0, u.created_at || Date.now()).lastInsertRowid;
    },
    async insertUserRaw(u) {
      run("INSERT INTO users(id,username,pass_hash,display_name,staff_name,role,active,token_version,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        u.id, u.username, u.pass_hash, u.display_name, u.staff_name || null, u.role, u.active, u.token_version, u.created_at);
    },
    async updateUser(id, f) {
      const keys = Object.keys(f); if (!keys.length) return;
      run(`UPDATE users SET ${keys.map(k => `${k}=?`).join(", ")} WHERE id=?`, ...keys.map(k => f[k]), id);
    },
    async countActiveAdmins() { return one("SELECT COUNT(*) c FROM users WHERE role='admin' AND active=1").c; },
    async countAdmins() { return one("SELECT COUNT(*) c FROM users WHERE role='admin'").c; },
    async countUsers() { return one("SELECT COUNT(*) c FROM users").c; },
    async audit(username, action, p) { run("INSERT INTO audit(ts,username,action,path) VALUES(?,?,?,?)", Date.now(), username || null, action, p || null); },
    async insertAuditRaw(a) { run("INSERT INTO audit(id,ts,username,action,path) VALUES(?,?,?,?,?)", a.id, a.ts, a.username, a.action, a.path); },
    async listAudit(limit) { return all("SELECT id, ts, username, action, path FROM audit ORDER BY id DESC LIMIT ?", Number(limit) || 200); },
    async countAudit() { return one("SELECT COUNT(*) c FROM audit").c; },
    async allUsersRaw() { return all("SELECT * FROM users ORDER BY id"); },
    async allAuditRaw() { return all("SELECT * FROM audit ORDER BY id"); },
    async ping() { one("SELECT 1"); },
    async close() { db.close(); },
  };
}

function createStore() {
  if (CLIENT === "sqlite") return createSqliteStore();
  if (CLIENT === "mariadb" || CLIENT === "mysql") return createMariaStore();
  throw new Error(`DB_CLIENT không hợp lệ: "${CLIENT}". Dùng "mariadb" hoặc "sqlite".`);
}

module.exports = { createStore, createSqliteStore, createMariaStore, CLIENT };
