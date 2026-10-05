"use strict";
/*
 * Quản lý tài khoản từ dòng lệnh (dùng khi chưa có tài khoản nào, hoặc quên mật khẩu trưởng phòng)
 *
 *   npm run user -- create          tạo tài khoản (hỏi từng thông tin)
 *   npm run user -- list            xem danh sách tài khoản
 *   npm run user -- reset-password  đặt lại mật khẩu
 *   npm run user -- disable <tên>   khoá tài khoản
 *   npm run user -- enable  <tên>   mở khoá tài khoản
 */
const readline = require("readline");
const bcrypt = require("bcryptjs");
const { createStore } = require("../lib/store");
const store = createStore();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
const queue = []; let waiter = null; let muted = false;
rl.on("line", l => { if (waiter) { const w = waiter; waiter = null; w(l); } else queue.push(l); });
const origWrite = rl._writeToOutput;
rl._writeToOutput = function (s) { if (!muted) return origWrite.call(rl, s); if (s === "\r\n" || s === "\n") return origWrite.call(rl, s); };
function ask(q) {
  process.stdout.write(q);
  return new Promise(r => { if (queue.length) r(queue.shift().trim()); else waiter = a => r(a.trim()); });
}
async function askHidden(q) {
  muted = true; const a = await ask(q); muted = false;
  if (!process.stdin.isTTY) process.stdout.write("\n");
  return a;
}
async function staffNames() {
  try { const b = await store.getDoc("config/staff"); return b ? (JSON.parse(b).list || []).map(s => s.name) : []; }
  catch (e) { return []; }
}

async function create() {
  console.log("\n=== TẠO TÀI KHOẢN ===");
  const username = await ask("Tên đăng nhập (chữ không dấu, số, . _ -), ví dụ: trp.kythuat : ");
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) throw new Error("Tên đăng nhập không hợp lệ.");
  const display = await ask("Tên hiển thị (ví dụ: Nguyễn Văn A): ") || username;
  const roleIn = (await ask("Vai trò – gõ 1 = Trưởng phòng (admin), 2 = Nhân viên (member) [1]: ")) || "1";
  const role = roleIn === "2" ? "member" : "admin";
  const names = await staffNames();
  if (names.length) { console.log("Danh sách nhân sự hiện có:"); names.forEach((n, i) => console.log(`  ${i + 1}. ${n}`)); }
  const st = await ask(`Gắn với nhân sự số mấy (Enter để bỏ qua${role === "member" ? " – nhân viên NÊN gắn" : ""}): `);
  const staff = st && names[Number(st) - 1] ? names[Number(st) - 1] : null;
  const p1 = await askHidden("Mật khẩu (ít nhất 8 ký tự): ");
  const p2 = await askHidden("Nhập lại mật khẩu: ");
  if (p1.length < 8) throw new Error("Mật khẩu quá ngắn.");
  if (p1 !== p2) throw new Error("Hai lần nhập mật khẩu không khớp.");
  if (await store.getUserByUsername(username)) throw new Error("Tên đăng nhập đã tồn tại.");
  await store.createUser({ username, pass_hash: bcrypt.hashSync(p1, 10), display_name: display, staff_name: staff, role });
  console.log(`\n✔ Đã tạo tài khoản "${username}" (${role === "admin" ? "Trưởng phòng" : "Nhân viên"}${staff ? ", gắn với " + staff : ""}).`);
}
async function list() {
  const rows = await store.listUsers();
  if (!rows.length) return console.log("Chưa có tài khoản nào.");
  console.table(rows.map(r => ({ "Tên đăng nhập": r.username, "Tên hiển thị": r.display_name, "Nhân sự": r.staff_name || "", "Vai trò": r.role, "Hoạt động": r.active ? "có" : "khoá" })));
}
async function resetPassword() {
  const username = await ask("Tên đăng nhập cần đặt lại mật khẩu: ");
  const u = await store.getUserByUsername(username);
  if (!u) throw new Error("Không tìm thấy tài khoản.");
  const p1 = await askHidden("Mật khẩu mới (ít nhất 8 ký tự): ");
  const p2 = await askHidden("Nhập lại mật khẩu mới: ");
  if (p1.length < 8 || p1 !== p2) throw new Error("Mật khẩu quá ngắn hoặc hai lần nhập không khớp.");
  await store.updateUser(u.id, { pass_hash: bcrypt.hashSync(p1, 10), token_version: u.token_version + 1, active: 1 });
  console.log("✔ Đã đặt lại mật khẩu.");
}
async function setActive(username, active) {
  const u = await store.getUserByUsername(username || "");
  if (!u) return console.log("Không tìm thấy tài khoản.");
  await store.updateUser(u.id, { active: active ? 1 : 0, token_version: u.token_version + 1 });
  console.log(`✔ Đã ${active ? "mở khoá" : "khoá"} tài khoản ${username}.`);
}

(async () => {
  const [cmd, arg] = process.argv.slice(2);
  try {
    await store.init();
    if (cmd === "create") await create();
    else if (cmd === "list") await list();
    else if (cmd === "reset-password") await resetPassword();
    else if (cmd === "disable") await setActive(arg, false);
    else if (cmd === "enable") await setActive(arg, true);
    else console.log("Cách dùng: npm run user -- create | list | reset-password | disable <tên> | enable <tên>");
  } catch (e) { console.error("✘ " + e.message); process.exitCode = 1; }
  rl.close(); await store.close().catch(() => {});
})();
