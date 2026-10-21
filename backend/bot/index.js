"use strict";
/* Bot Telegram – điểm vào, được server.js gọi: create({...}) → { enabled, start, stop, status, createLinkCode, unlink }.
   Cấu hình trong .env (xem .env.example):
     TELEGRAM_BOT_TOKEN – đặt ở CẢ HAI máy của cụm: máy nào cũng cấp được mã liên kết / xem trạng thái (enabled).
     TELEGRAM_ENABLED=true – chỉ ở MỘT máy: máy đó nhận tin (long polling) và chạy lịch tự động (running).
     AI_PROVIDER/AI_API_KEY/AI_MODEL – tuỳ chọn, chỉ cần ở máy chạy bot (xem ai/index.js).
   Mọi dữ liệu liên kết (mã 1 lần, telegramLink) nằm trong CSDL, KHÔNG giữ trong bộ nhớ – vì người dùng có thể lấy mã
   trên máy này (qua bộ cân bằng tải) trong khi bot chạy ở máy kia; MariaDB nhân bản 2 chiều nên hai máy cùng thấy.
   Cấu trúc:
     telegram.js  – gọi Bot API (long polling)
     core.js      – phiên hội thoại, nút bấm, thẻ Xác nhận (Đồng ý / Sửa / Huỷ) dùng chung
     router.js    – định tuyến lệnh / nút tới các module, /help và menu lệnh theo vai trò
     flows/       – week.js (nhập tuần), views.js (xem), manage.js (dự án/đầu việc), misc.js (góp ý, nhật ký)
     notify.js    – báo khi được giao việc (hàng đợi telegramOutbox trong CSDL)
     scheduler.js – lịch tự động: nhắc nhập tuần, cảnh báo quá tải/vướng, tóm tắt tuần
     ai/          – lớp AI đa hãng (Claude, OpenAI), chỉ tạo BẢN NHÁP, không bao giờ tự ghi
   LIÊN KẾT TÀI KHOẢN: web cấp mã 1 lần (6 ký tự, sống 10 phút) → người dùng nhắn bot "/start <mã>" →
   lưu telegramLink/u<userId> = {userId, chatId, tgName, linkedAt}. Một tài khoản ↔ một chat. */
const { createClient } = require("./telegram");
const { createCore } = require("./core");
const { createRouter } = require("./router");
const { createNotify } = require("./notify");
const { createScheduler, readConfig } = require("./scheduler");
const { createAI } = require("./ai");
const FLOW_MODULES = ["week", "views", "manage", "misc"].map(n => require("./flows/" + n));

const CODE_TTL = 10 * 60e3;
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // bỏ ký tự dễ nhầm (0/O, 1/I/L)

/* Liên kết tài khoản ↔ chat – đọc thẳng CSDL mỗi lần (số tài khoản của phòng nhỏ, không cần bộ đệm; bộ đệm sẽ
   sai khi máy KIA của cụm thêm/bỏ liên kết). Mã 1 lần lưu ở telegramCode/<mã> = { userId, exp }. */
function createLinks(store, audit) {
  const fails = new Map(); // chatId → { n, t } chống dò mã – chỉ máy chạy bot nhận /start nên để bộ nhớ là đủ
  const all = async () => (await store.getDocs("telegramLink")).map(r => JSON.parse(r.body))
    .map(l => ({ userId: l.userId, chatId: String(l.chatId), tgName: l.tgName || "" }));
  const unlinkUser = userId => store.deleteDoc(`telegramLink/u${userId}`);
  return {
    all, unlinkUser,
    userIdOf: async chatId => { const l = (await all()).find(x => x.chatId === String(chatId)); return l ? l.userId : null; },
    linkOf: async userId => { const r = await store.getDoc(`telegramLink/u${userId}`); return r ? JSON.parse(r) : null; },
    async createCode(user) {
      // Dọn mã hết hạn và mã cũ của chính người này
      for (const r of await store.getDocs("telegramCode")) {
        const c = JSON.parse(r.body);
        if (c.exp < Date.now() || c.userId === user.id) await store.deleteDoc(`telegramCode/${r.doc_id}`);
      }
      let code;
      do { code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(""); }
      while (await store.getDoc(`telegramCode/${code}`));
      await store.upsertDoc(`telegramCode/${code}`, "telegramCode", code, JSON.stringify({ userId: user.id, exp: Date.now() + CODE_TTL }), user.username);
      return { code, expiresInMin: CODE_TTL / 60e3 };
    },
    async consume(code, chatId, from) {
      const now = Date.now(), f = fails.get(String(chatId)) || { n: 0, t: now };
      if (now - f.t > CODE_TTL) { f.n = 0; f.t = now; }
      if (f.n >= 5) return { error: "Nhập sai mã quá nhiều lần. Thử lại sau 10 phút." };
      const raw = /^[A-Z0-9]{6}$/.test(code) ? await store.getDoc(`telegramCode/${code}`) : null;
      const c = raw && JSON.parse(raw);
      if (!c || c.exp < now) { f.n++; fails.set(String(chatId), f); return { error: "Mã không đúng hoặc đã hết hạn. Lấy mã mới trên web (tài khoản → Liên kết Telegram)." }; }
      await store.deleteDoc(`telegramCode/${code}`); fails.delete(String(chatId));
      const user = await store.getUserById(c.userId);
      if (!user || !user.active) return { error: "Tài khoản không còn hoạt động." };
      // Một chat chỉ gắn 1 tài khoản, một tài khoản chỉ gắn 1 chat
      for (const l of await all()) if (l.chatId === String(chatId) && l.userId !== user.id) await unlinkUser(l.userId);
      const tgName = from ? (from.username ? "@" + from.username : [from.first_name, from.last_name].filter(Boolean).join(" ")) : "";
      const doc = { userId: user.id, chatId: String(chatId), tgName, linkedAt: new Date().toISOString() };
      await store.upsertDoc(`telegramLink/u${user.id}`, "telegramLink", `u${user.id}`, JSON.stringify(doc), user.username);
      audit(user, "telegram-link", tgName.slice(0, 200));
      return { user };
    },
  };
}

function create({ store, saveDoc, removeDoc, setTaskPt, audit, FULL_ROLES, mondayOfToday }) {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const enabled = !!token;                                            // cấp mã liên kết được (cả 2 máy)
  const running = enabled && process.env.TELEGRAM_ENABLED === "true"; // nhận tin + chạy lịch (1 máy)
  const links = createLinks(store, audit);
  const notify = createNotify({ store, links });
  let botUsername = "", tg = null, scheduler = null;

  return {
    enabled,
    async start() {
      if (!enabled) {
        if (process.env.TELEGRAM_ENABLED === "true") console.error("[bot] TELEGRAM_ENABLED=true nhưng thiếu TELEGRAM_BOT_TOKEN – bot không chạy.");
        return;
      }
      tg = createClient(token);
      if (!running) {
        // Máy phụ: chỉ lấy tên bot để hiện link trên web; KHÔNG gọi getUpdates (sẽ tranh tin với máy chạy bot → 409)
        tg.call("getMe").then(me => { botUsername = me.username || ""; console.log(`[bot] Máy này chỉ cấp mã liên kết (@${botUsername}); bot chạy ở máy có TELEGRAM_ENABLED=true.`); })
          .catch(e => console.error("[bot] Không kết nối được Telegram:", e.message));
        return;
      }
      try {
        const ai = createAI(process.env);
        const ctx = { tg, store, saveDoc, removeDoc, setTaskPt, links, FULL_ROLES, mondayOfToday, ai };
        scheduler = createScheduler(ctx);
        ctx.scheduler = scheduler;
        const core = createCore(ctx);
        const router = createRouter(core, FLOW_MODULES.map(m => m(core)));
        try {
          const me = await tg.call("getMe");
          botUsername = me.username || "";
          await router.setMenus();
        } catch (e) { console.error("[bot] Chưa kết nối được Telegram lúc khởi động (sẽ tự thử lại):", e.message); }
        tg.poll(async u => {
          if (u.message) await router.onMessage(u.message);
          else if (u.callback_query) await router.onCallback(u.callback_query);
        });
        scheduler.start();
        notify.start(tg);
        console.log(`[bot] Bot Telegram đang chạy${botUsername ? " (@" + botUsername + ")" : ""} · ${(await links.all()).length} tài khoản đã liên kết · AI: ${ai.enabled ? ai.provider : "tắt"}`);
      } catch (e) { console.error("[bot] Không khởi động được bot Telegram:", e); }
    },
    stop() { if (tg) tg.stop(); if (scheduler) scheduler.stop(); notify.stop(); },
    /* Gọi từ saveDoc() sau mỗi lần ghi (mọi máy có token) → xếp tin "được giao việc" vào hàng đợi */
    onSaved: (...a) => enabled ? notify.onSaved(...a) : undefined,
    async status(user) {
      const l = await links.linkOf(user.id);
      const out = { enabled, botUsername, linked: !!l, tgName: l ? l.tgName || "" : "" };
      if (FULL_ROLES.has(user.role)) out.schedule = await readConfig(store);
      return out;
    },
    createLinkCode: async user => ({ ...(await links.createCode(user)), botUsername }),
    unlink: user => links.unlinkUser(user.id),
  };
}

module.exports = { create };
