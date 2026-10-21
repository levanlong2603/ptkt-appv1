"use strict";
/* Định tuyến tin nhắn/nút bấm tới các module trong flows/*.js. Mỗi module trả về:
     { flows: {tên: luồng}, commands: [{name, desc, full?, run(chatId, user, arg)}], handlers: {tên: fn(chatId, user, args, msgId)},
       statics: {callback_data cố định: fn(chatId, user)}, freeText? }
   - commands.full = true: chỉ trưởng/phó phòng/admin thấy và dùng được.
   - Menu lệnh "/" của Telegram đặt theo vai trò: mặc định cho mọi chat là lệnh của nhân viên; chat của tài khoản toàn quyền
     được đặt riêng (scope chat) thêm các lệnh quản lý.
   - callback_data: "r|<id>" → handlers (nút không gắn phiên, core.rbtn); "<khoá phiên>|<act>|<arg>" → luồng đang dở;
     chuỗi cố định ("new", "week", "mine"…) → statics – dùng trong tin tự động (nhắc, báo giao việc) không có phiên. */
const { h } = require("./telegram");

const NOT_LINKED = "Chat này chưa liên kết với tài khoản nào.\n\nCách liên kết: đăng nhập web → bấm tên tài khoản (góc trên phải) → <b>Liên kết Telegram</b> → nhắn cho bot lệnh <code>/start MÃ</code> hiển thị ở đó.";

function createRouter(core, modules) {
  const { tg, ctx } = core;
  const commands = [], statics = {};
  let freeText = null;
  for (const m of modules) {
    Object.assign(core.flows, m.flows);
    Object.assign(core.handlers, m.handlers);
    Object.assign(statics, m.statics);
    commands.push(...m.commands);
    if (m.freeText) freeText = m.freeText;
  }
  // Lệnh chung (không thuộc module nào)
  commands.push(
    { name: "tomtat", desc: "Gửi ngay bản tóm tắt tuần", full: true, run: chatId => ctx.scheduler.runNow("summary", chatId) },
    { name: "canhbao", desc: "Kiểm tra ngay quá tải / vướng", full: true, run: chatId => ctx.scheduler.runNow("alert", chatId) },
    { name: "huy", desc: "Huỷ thao tác đang dở", run: chatId => tg.send(chatId, "Đã huỷ.") },
    { name: "help", desc: "Danh sách lệnh", run: (chatId, user) => tg.send(chatId, help(user)) },
    { name: "huylienket", desc: "Bỏ liên kết Telegram", hidden: true, run: async (chatId, user) => { await ctx.links.unlinkUser(user.id); return tg.send(chatId, "Đã bỏ liên kết. Bot sẽ không nhắn cho bạn nữa."); } },
  );
  const byName = new Map(commands.map(c => [c.name, c]));
  const allowed = (c, user) => !c.full || core.isFull(user);

  const GROUPS = [
    ["Nhập tuần", ["nhap", "tuannay", "cheptuan", "nhatky"]],
    ["Xem", ["tai", "viectoi", "hantoi", "duan"]],
    ["Dự án", ["themduan", "themviec", "tinhhinh"]],
    ["Báo cáo", ["tomtat", "canhbao"]],
    ["Khác", ["gopy", "huy", "help", "huylienket"]],
  ];
  function help(user) {
    const L = [];
    for (const [title, names] of GROUPS) {
      const cs = names.map(n => byName.get(n)).filter(c => c && allowed(c, user));
      if (cs.length) L.push(`<b>${title}</b>`, ...cs.map(c => `/${c.name} – ${c.desc}`), "");
    }
    if (ctx.ai && ctx.ai.enabled) L.push("💬 Có thể gõ tự nhiên, vd: <i>“làm 3h test ATP dự án DC 09, đang làm”</i> – bot sẽ hỏi xác nhận trước khi lưu.");
    return L.join("\n").trim();
  }
  /* Menu lệnh "/" của Telegram (tối đa 100 lệnh) */
  const menu = full => commands.filter(c => !c.hidden && (!c.full || full)).map(c => ({ command: c.name, description: c.desc }));
  async function setMenus() {
    await tg.call("setMyCommands", { commands: menu(false) });
    for (const l of await ctx.links.all()) await setChatMenu(l.chatId, await ctx.store.getUserById(l.userId));
  }
  async function setChatMenu(chatId, user) {
    if (!user) return;
    const scope = { type: "chat", chat_id: Number(chatId) };
    await (core.isFull(user) ? tg.call("setMyCommands", { scope, commands: menu(true) }) : tg.call("deleteMyCommands", { scope })).catch(() => {});
  }

  async function cmdStart(chatId, from, arg) {
    if (arg) {
      const r = await ctx.links.consume(arg.trim().toUpperCase(), chatId, from);
      if (r.error) return tg.send(chatId, `❌ ${h(r.error)}`);
      await setChatMenu(chatId, r.user);
      return tg.send(chatId, `✅ Đã liên kết với tài khoản <b>${h(r.user.display_name)}</b>${r.user.staff_name ? ` (${h(r.user.staff_name)})` : ""}.\n\n` + help(r.user));
    }
    const u = await core.userOf(chatId);
    return tg.send(chatId, u ? `Xin chào <b>${h(u.display_name)}</b>!\n\n` + help(u) : NOT_LINKED);
  }

  async function onMessage(msg) {
    const chatId = msg.chat.id;
    if (msg.chat.type !== "private") return; // chỉ trò chuyện riêng, không hoạt động trong nhóm
    const text = (msg.text || "").trim();
    const m = /^\/(\w+)(?:@\w+)?(?:\s+(.*))?$/s.exec(text);
    if (m && m[1] === "start") return cmdStart(chatId, msg.from, m[2]);
    const user = await core.userOf(chatId);
    if (!user) return tg.send(chatId, NOT_LINKED);
    if (m) {
      core.endSession(chatId); // gõ lệnh mới = bỏ thao tác đang dở
      const c = byName.get(m[1].toLowerCase());
      if (!c) return tg.send(chatId, help(user));
      if (!allowed(c, user)) return tg.send(chatId, "Lệnh này chỉ dành cho trưởng phòng/phó phòng.\n\n" + help(user));
      return c.run(chatId, user, m[2] || "");
    }
    if (!text) return;
    const s = core.getSession(chatId);
    if (s) { core.touch(s); s.user = user; if (await core.onSessionText(chatId, s, text)) return; }
    if (freeText) return freeText(chatId, user, text);
    return tg.send(chatId, help(user));
  }

  async function onCallback(cq) {
    const chatId = cq.message && cq.message.chat.id, msgId = cq.message && cq.message.message_id;
    if (!chatId) return;
    const user = await core.userOf(chatId);
    if (!user) { await tg.answer(cq.id); return tg.send(chatId, NOT_LINKED); }
    const data = String(cq.data || "");
    if (statics[data]) { await tg.answer(cq.id); return statics[data](chatId, user); }
    if (data.startsWith("r|")) {
      const r = core.refOf(data.slice(2));
      if (!r || !core.handlers[r.handler]) return tg.answer(cq.id, "Nút này đã hết hạn – gõ lại lệnh để xem mới nhất");
      await tg.answer(cq.id);
      return core.handlers[r.handler](chatId, user, r.args, msgId);
    }
    const [k, act, arg] = data.split("|");
    const s = core.getSession(chatId);
    if (!s || s.k !== k) return tg.answer(cq.id, "Thao tác đã hết hạn – gõ lại lệnh để bắt đầu lại");
    await tg.answer(cq.id);
    core.touch(s); s.user = user; s.msgId = msgId;
    return core.onSessionCallback(chatId, s, act, arg);
  }

  return { onMessage, onCallback, help, setMenus };
}

module.exports = { createRouter };
