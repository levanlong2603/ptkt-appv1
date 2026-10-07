"use strict";
/*
 * Phòng Kỹ thuật – Quản trị công việc và nguồn lực
 * Máy chủ web: Express + MariaDB (hoặc SQLite) – xem lib/store.js
 *
 *  - Lưu dữ liệu dạng "tài liệu" (document):
 *      config/staff, config/catalog, projects/<id>, weeks/<tuần>__<người>
 *  - Đăng nhập bằng tài khoản; vai trò admin (Trưởng phòng) và member (nhân viên)
 *  - Quyền ghi theo bảng RULES bên dưới
 *  - Cập nhật thời gian thực cho mọi người đang mở trang (Server-Sent Events)
 */
const path = require("path");
const fs = require("fs");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { createStore } = require("./lib/store");

/* ---------------- cấu hình (đọc từ file .env) ---------------- */
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const JWT_SECRET = process.env.JWT_SECRET || "";
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 30;
const COOKIE = "ptkt_session";

if (JWT_SECRET.length < 32) {
  console.error("[LỖI] JWT_SECRET trong file .env phải dài ít nhất 32 ký tự.");
  process.exit(1);
}

/*
 * QUY TẮC GHI DỮ LIỆU THEO TỪNG BỘ SƯU TẬP (collection)
 * Thêm module mới cần lưu dữ liệu → thêm 1 dòng vào đây.
 *   "admin"       : chỉ trưởng phòng được ghi/xoá
 *   "member"      : mọi tài khoản đã đăng nhập được ghi/xoá
 *   "own-week"    : trưởng phòng ghi tất cả; nhân viên chỉ ghi dữ liệu tuần của chính mình
 *   "own-project" : trưởng phòng ghi tất cả (kể cả tạo dự án mới); nhân viên chỉ sửa/xoá
 *                   dự án do chính mình tạo (trường created_by do máy chủ ghi, không nhận từ client)
 * Mọi tài khoản đã đăng nhập đều ĐỌC được tất cả.
 */
const RULES = {
  config: "admin",          // config/staff (nhân sự), config/catalog (đầu việc chuẩn)
  projects: "own-project",  // projects/<mã dự án>  (thông tin dự án + đầu việc)
  weeks: "own-week",        // weeks/<thứ 2 của tuần>__<tên>  (dữ liệu nhập theo tuần)
};
const COLLECTIONS = new Set(Object.keys(RULES));
const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

const store = createStore();

/* ---------------- tiện ích ---------------- */
function slug(s) {
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "x";
}
const publicUser = u => ({ id: u.id, username: u.username, display_name: u.display_name, staff_name: u.staff_name, role: u.role, active: !!u.active });
const audit = (user, action, p) => store.audit(user ? user.username : null, action, p).catch(e => console.error("[audit]", e.message));
/* bọc route async để lỗi được chuyển về bộ xử lý lỗi chung */
const A = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------------- realtime (Server-Sent Events) ---------------- */
const clients = new Set();
function broadcast(collection) {
  const msg = `event: change\ndata: ${JSON.stringify({ collection })}\n\n`;
  for (const res of clients) { try { res.write(msg); } catch (e) { /* bỏ qua */ } }
}
setInterval(() => { for (const res of clients) { try { res.write(": ping\n\n"); } catch (e) {} } }, 25000).unref();

/* ---------------- ứng dụng ---------------- */
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", "loopback");
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

const auth = A(async (req, res, next) => {
  const token = req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: "Chưa đăng nhập" });
  let p;
  try { p = jwt.verify(token, JWT_SECRET); } catch (e) { return res.status(401).json({ error: "Phiên đăng nhập hết hiệu lực" }); }
  const u = await store.getUserById(p.uid);
  if (!u || !u.active || u.token_version !== p.tv) return res.status(401).json({ error: "Phiên đăng nhập hết hiệu lực" });
  req.user = u; next();
});
const adminOnly = (req, res, next) => req.user.role === "admin" ? next() : res.status(403).json({ error: "Chỉ trưởng phòng được thực hiện" });
function setSession(res, u) {
  const token = jwt.sign({ uid: u.id, tv: u.token_version }, JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: COOKIE_SECURE, maxAge: SESSION_DAYS * 864e5, path: "/" });
}

/* --- đăng nhập (có giới hạn số lần sai) --- */
const fails = new Map();
app.post("/api/login", A(async (req, res) => {
  const ip = req.ip, now = Date.now();
  const f = fails.get(ip) || { n: 0, t: now };
  if (now - f.t > 15 * 60e3) { f.n = 0; f.t = now; }
  if (f.n >= 10) return res.status(429).json({ error: "Sai quá nhiều lần. Thử lại sau 15 phút." });
  const { username, password } = req.body || {};
  const u = username ? await store.getUserByUsername(String(username).trim()) : null;
  if (!u || !u.active || !bcrypt.compareSync(String(password || ""), u.pass_hash)) {
    f.n++; fails.set(ip, f);
    return res.status(401).json({ error: "Sai tên đăng nhập hoặc mật khẩu" });
  }
  fails.delete(ip); setSession(res, u); audit(u, "login");
  res.json(publicUser(u));
}));
app.post("/api/logout", (req, res) => { res.clearCookie(COOKIE, { path: "/" }); res.status(204).end(); });
app.get("/api/health", A(async (req, res) => {
  try { await store.ping(); res.json({ ok: true, db: store.name, time: new Date().toISOString() }); }
  catch (e) { res.status(503).json({ ok: false, db: store.name, error: "Không kết nối được cơ sở dữ liệu" }); }
}));
app.get("/api/me", auth, (req, res) => res.json(publicUser(req.user)));
app.post("/api/me/password", auth, A(async (req, res) => {
  const { current, next } = req.body || {};
  if (!bcrypt.compareSync(String(current || ""), req.user.pass_hash)) return res.status(400).json({ error: "Mật khẩu hiện tại không đúng" });
  if (String(next || "").length < 8) return res.status(400).json({ error: "Mật khẩu mới phải có ít nhất 8 ký tự" });
  await store.updateUser(req.user.id, { pass_hash: bcrypt.hashSync(String(next), 10), token_version: req.user.token_version + 1 });
  const u = await store.getUserById(req.user.id);
  setSession(res, u); audit(u, "change-password");
  res.status(204).end();
}));

/* --- dữ liệu --- */
app.get("/api/collection/:coll", auth, A(async (req, res) => {
  const coll = req.params.coll;
  if (!COLLECTIONS.has(coll)) return res.status(404).json({ error: "Không có dữ liệu này" });
  const weekGte = req.query.field === "week" && req.query.gte ? String(req.query.gte) : null;
  const rows = await store.getDocs(coll, weekGte);
  res.json(rows.map(r => ({ id: r.doc_id, data: JSON.parse(r.body) })));
}));

function canWrite(user, coll, id, body, existing) {
  const rule = RULES[coll];
  if (user.role === "admin") return true;
  if (rule === "member") return true;
  // Dự án mới (không có bản cũ) chỉ trưởng phòng tạo được; nhân viên chỉ sửa/xoá dự án do mình tạo
  if (rule === "own-project") return existing ? existing.created_by === user.username : false;
  if (rule !== "own-week" || !user.staff_name) return false;
  const check = b => b && b.person === user.staff_name && id === `${b.week}__${slug(b.person)}`;
  if (existing && !check(existing)) return false;
  if (body && !check(body)) return false;
  return true;
}
app.put("/api/doc/:coll/:id", auth, A(async (req, res) => {
  const { coll, id } = req.params, body = req.body;
  if (!COLLECTIONS.has(coll) || !ID_RE.test(id)) return res.status(400).json({ error: "Đường dẫn không hợp lệ" });
  if (!body || typeof body !== "object" || Array.isArray(body)) return res.status(400).json({ error: "Dữ liệu không hợp lệ" });
  const p = `${coll}/${id}`;
  const ex = await store.getDoc(p);
  const exBody = ex && JSON.parse(ex);
  if (!canWrite(req.user, coll, id, body, exBody)) return res.status(403).json({ error: "Bạn không có quyền sửa phần này" });
  if (coll === "projects") body.created_by = exBody ? (exBody.created_by ?? null) : req.user.username;
  await store.upsertDoc(p, coll, id, JSON.stringify(body), req.user.username);
  audit(req.user, "set", p); broadcast(coll);
  res.status(204).end();
}));
app.delete("/api/doc/:coll/:id", auth, A(async (req, res) => {
  const { coll, id } = req.params;
  if (!COLLECTIONS.has(coll) || !ID_RE.test(id)) return res.status(400).json({ error: "Đường dẫn không hợp lệ" });
  const p = `${coll}/${id}`;
  const ex = await store.getDoc(p);
  if (!ex) return res.status(204).end();
  if (!canWrite(req.user, coll, id, null, JSON.parse(ex))) return res.status(403).json({ error: "Bạn không có quyền xoá phần này" });
  await store.deleteDoc(p);
  audit(req.user, "delete", p); broadcast(coll);
  res.status(204).end();
}));
app.get("/api/events", auth, (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.write("retry: 5000\n\n");
  clients.add(res);
  req.on("close", () => clients.delete(res));
});

/* --- sao lưu / khôi phục (trưởng phòng) --- */
app.get("/api/backup", auth, adminOnly, A(async (req, res) => {
  const data = {};
  for (const r of await store.allDocs()) data[r.path] = JSON.parse(r.body);
  const name = `Sao-luu-theo-doi-cong-viec-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.json`;
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.json({ app: "ptkt", version: 1, exported: new Date().toISOString(), data });
}));
app.post("/api/restore", auth, adminOnly, A(async (req, res) => {
  const data = req.body && req.body.data;
  if (!data || typeof data !== "object" || !Object.keys(data).some(k => k.startsWith("projects/")))
    return res.status(400).json({ error: "File không đúng định dạng sao lưu" });
  const rows = [];
  for (const [p, body] of Object.entries(data)) {
    const [coll, id] = p.split("/");
    if (!COLLECTIONS.has(coll) || !ID_RE.test(id || "")) continue;
    rows.push({ path: p, collection: coll, doc_id: id, body: JSON.stringify(body) });
  }
  await store.replaceAllDocs(rows, req.user.username);
  audit(req.user, "restore"); broadcast("*");
  res.status(204).end();
}));

/* --- quản lý tài khoản (trưởng phòng) --- */
app.get("/api/users", auth, adminOnly, A(async (req, res) => {
  res.json((await store.listUsers()).map(publicUser));
}));
app.post("/api/users", auth, adminOnly, A(async (req, res) => {
  const { username, password, display_name, staff_name, role } = req.body || {};
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(String(username || ""))) return res.status(400).json({ error: "Tên đăng nhập 3–40 ký tự, chỉ gồm chữ không dấu, số, dấu . _ -" });
  if (String(password || "").length < 8) return res.status(400).json({ error: "Mật khẩu phải có ít nhất 8 ký tự" });
  if (!["admin", "member"].includes(role)) return res.status(400).json({ error: "Vai trò không hợp lệ" });
  if (await store.getUserByUsername(username)) return res.status(400).json({ error: "Tên đăng nhập đã tồn tại" });
  const id = await store.createUser({ username, pass_hash: bcrypt.hashSync(String(password), 10), display_name: String(display_name || username), staff_name: staff_name || null, role });
  audit(req.user, "user-create", username);
  res.json(publicUser(await store.getUserById(id)));
}));
app.patch("/api/users/:id", auth, adminOnly, A(async (req, res) => {
  const u = await store.getUserById(Number(req.params.id));
  if (!u) return res.status(404).json({ error: "Không tìm thấy tài khoản" });
  const b = req.body || {};
  const role = b.role ?? u.role, active = b.active === undefined ? u.active : (b.active ? 1 : 0);
  if (!["admin", "member"].includes(role)) return res.status(400).json({ error: "Vai trò không hợp lệ" });
  if (u.role === "admin" && (role !== "admin" || !active) && (await store.countActiveAdmins()) <= 1)
    return res.status(400).json({ error: "Phải còn ít nhất một tài khoản trưởng phòng đang hoạt động" });
  let tv = u.token_version, hash = u.pass_hash;
  if (role !== u.role) tv++;   // đổi vai trò: buộc đăng nhập lại để nhận quyền mới
  if (b.password) {
    if (String(b.password).length < 8) return res.status(400).json({ error: "Mật khẩu phải có ít nhất 8 ký tự" });
    hash = bcrypt.hashSync(String(b.password), 10); tv++;
  }
  if (!active && u.active) tv++;
  await store.updateUser(u.id, { display_name: String(b.display_name ?? u.display_name), staff_name: (b.staff_name ?? u.staff_name) || null, role, active, pass_hash: hash, token_version: tv });
  audit(req.user, "user-update", u.username);
  res.json(publicUser(await store.getUserById(u.id)));
}));

/* --- giao diện --- */
app.use(express.static(path.join(__dirname, "..", "frontend"), {
  index: "index.html",
  setHeaders: (res, file) => { if (file.endsWith(".html")) res.setHeader("Cache-Control", "no-cache"); }
}));
app.use("/api", (req, res) => res.status(404).json({ error: "Không tìm thấy" }));
app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Dữ liệu quá lớn" });
  if (res.headersSent) return;
  res.status(500).json({ error: "Lỗi máy chủ" });
});

/* ---------------- khởi động ---------------- */
let server;
async function seedIfEmpty() {
  const seedFile = path.join(__dirname, "seed", "seed.json");
  if ((await store.countDocs()) > 0 || !fs.existsSync(seedFile)) return;
  const seed = JSON.parse(fs.readFileSync(seedFile, "utf8"));
  const rows = Object.entries(seed).map(([p, body]) => { const [coll, id] = p.split("/"); return { path: p, collection: coll, doc_id: id, body: JSON.stringify(body), updated_by: "seed" }; });
  await store.replaceAllDocs(rows, "seed");
  console.log(`[seed] Đã nạp ${rows.length} tài liệu dữ liệu ban đầu.`);
}
(async () => {
  try {
    await store.init();
    await seedIfEmpty();
  } catch (e) {
    console.error(`[LỖI] Không kết nối / khởi tạo được cơ sở dữ liệu ${store.name} (${store.describe()}): ${e.code || ""} ${e.message}`);
    console.error("       Kiểm tra các dòng DB_* trong file .env và dịch vụ cơ sở dữ liệu.");
    process.exit(1);
  }
  server = app.listen(PORT, HOST, async () => {
    console.log(`[ptkt] Đang chạy tại http://${HOST}:${PORT}  (CSDL: ${store.name} – ${store.describe()})`);
    if (!(await store.countAdmins())) console.log("[ptkt] Chưa có tài khoản trưởng phòng. Chạy: npm run user -- create");
  });
})();
function shutdown() {
  console.log("[ptkt] Đang dừng…");
  for (const r of clients) { try { r.end(); } catch (e) {} }
  const done = () => store.close().catch(() => {}).finally(() => process.exit(0));
  if (server) server.close(done); else done();
  setTimeout(() => process.exit(0), 4000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
