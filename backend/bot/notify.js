"use strict";
/* Báo Telegram khi có người được GIAO VIỆC MỚI – bắt mọi lần ghi dự án qua saveDoc() (web, bot, nhập Excel…):
     - dự án mới / đổi TM, SE → báo người mới nhận vai trò đó;
     - đầu việc mới hoặc đổi người phụ trách (owner) / thực hiện (collab) → báo người mới được gán.
   Bỏ qua chính người thao tác. Gom theo người nhận → 1 tin/người/lần ghi.
   Tin được xếp vào HÀNG ĐỢI trong CSDL (telegramOutbox/<id> = {person, text, at}) chứ không gửi thẳng: lần ghi có thể xảy
   ra ở máy KHÔNG chạy bot trong cụm; máy chạy bot (TELEGRAM_ENABLED=true) quét hàng đợi mỗi 15 giây, gửi cho tài khoản
   đã liên kết có staff_name trùng tên, rồi xoá. Người chưa liên kết → bỏ tin. Tin quá 1 ngày chưa gửi được → bỏ.
   Không qua saveDoc (đổi tên nhân sự, khôi phục sao lưu) thì không báo – đúng ý, tránh báo hàng loạt. */
const { h } = require("./telegram");
const W = require("../lib/workload");

const MAX_LINES = 10;
const dm = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "";

function createNotify({ store, links }) {
  let timer = null, busy = false, tg = null;

  /* Gọi sau mỗi lần saveDoc thành công (kể cả khi máy này không chạy bot – chỉ cần có token) */
  async function onSaved(user, coll, id, ex, body) {
    if (coll !== "projects" || !body) return;
    const actor = user.staff_name || "";
    const by = user.display_name || user.username;
    const out = new Map(); // người → { roles:[], tasks:[] }
    const add = (person, kind, line) => {
      if (!person || person === actor) return;
      if (!out.has(person)) out.set(person, { roles: [], tasks: [] });
      out.get(person)[kind].push(line);
    };
    // Chỉ báo người MỚI có tên trong danh sách so với bản cũ (bản cũ có thể còn trường chuỗi owner/se/collab – W.pOwners… đọc được cả hai)
    const added = (now, before) => now.filter(n => !before.includes(n));
    const pOwn = W.pOwners(body);
    for (const n of added(pOwn, ex ? W.pOwners(ex) : [])) add(n, "roles", "TM (phụ trách)");
    for (const n of added(W.pSes(body), ex ? W.pSes(ex) : [])) add(n, "roles", "SE");
    const old = new Map(((ex && ex.tasks) || []).map(t => [t.id, t]));
    for (const t of body.tasks || []) {
      const o = old.get(t.id) || {};
      const line = `• ${h(W.shortName(t.dv))}${t.deadline ? ` <i>(hạn ${dm(t.deadline)})</i>` : ""}`;
      // Dự án mới: người phụ trách đầu việc mặc định = TM – đã báo bằng vai trò TM, không liệt kê lại từng đầu việc
      for (const n of added(W.tOwners(t), W.tOwners(o))) if (ex || !pOwn.includes(n)) add(n, "tasks", line + " – phụ trách");
      for (const n of added(W.tCollabs(t), W.tCollabs(o))) add(n, "tasks", line + " – thực hiện");
    }
    for (const [person, x] of out) {
      const L = [`📌 <b>Bạn được giao việc</b> ở dự án <b>${h(body.name || id)}</b> <i>(bởi ${h(by)})</i>`];
      if (x.roles.length) L.push(`Vai trò: <b>${x.roles.join(", ")}</b>${!ex ? ` của dự án mới (${(body.tasks || []).length} đầu việc)` : ""}`);
      if (x.tasks.length) L.push(...x.tasks.slice(0, MAX_LINES), ...(x.tasks.length > MAX_LINES ? [`<i>… và ${x.tasks.length - MAX_LINES} đầu việc khác</i>`] : []));
      const oid = "o" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await store.upsertDoc(`telegramOutbox/${oid}`, "telegramOutbox", oid, JSON.stringify({ person, text: L.join("\n"), at: Date.now() }), "bot");
    }
  }

  async function deliver() {
    if (busy || !tg) return; busy = true;
    try {
      const items = await store.getDocs("telegramOutbox");
      if (!items.length) return;
      const byName = new Map();
      for (const l of await links.all()) {
        const u = await store.getUserById(l.userId);
        if (u && u.active && u.staff_name) byName.set(u.staff_name, l.chatId);
      }
      for (const r of items) {
        const m = JSON.parse(r.body), chat = byName.get(m.person);
        if (chat) {
          try { await tg.send(chat, m.text, [[{ text: "📋 Việc của tôi", callback_data: "mine" }, { text: "📁 Dự án", callback_data: "projects" }]]); }
          catch (e) { if (Date.now() - m.at < 864e5 && e.code !== 403 && e.code !== 400) continue; } // lỗi mạng: để lần sau thử lại
        }
        await store.deleteDoc(`telegramOutbox/${r.doc_id}`);
      }
    } catch (e) { console.error("[bot] Lỗi gửi tin được giao việc:", e.message); }
    finally { busy = false; }
  }

  return {
    onSaved,
    start(client) { tg = client; timer = setInterval(deliver, 15e3); timer.unref(); setTimeout(deliver, 3e3).unref(); },
    stop() { clearInterval(timer); },
    deliver,
  };
}

module.exports = { createNotify };
