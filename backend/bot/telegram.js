"use strict";
/* Client Telegram Bot API tối giản – gọi HTTPS bằng fetch có sẵn của Node, không thêm thư viện.
   Nhận tin bằng LONG POLLING (getUpdates): máy chủ chủ động hỏi Telegram, nên KHÔNG cần mở cổng vào, không cần
   tên miền/HTTPS công khai – chỉ cần máy chủ ra được Internet tới api.telegram.org:443.
   Mạng phải qua proxy: đặt HTTPS_PROXY=http://proxy:port và NODE_USE_ENV_PROXY=1 trong .env (Node ≥ 24). */

const API = process.env.TELEGRAM_API_BASE || "https://api.telegram.org"; // đổi chỉ khi kiểm thử với máy chủ Telegram giả
const sleep = ms => new Promise(r => setTimeout(r, ms));

class TgError extends Error {
  constructor(code, description) { super(`Telegram ${code}: ${description}`); this.code = code; }
}

function createClient(token) {
  let running = false, abort = null;

  async function call(method, params = {}, timeoutMs = 15000) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    if (method === "getUpdates") abort = ac;
    try {
      const res = await fetch(`${API}/bot${token}/${method}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params), signal: ac.signal,
      });
      const j = await res.json().catch(() => ({ ok: false, error_code: res.status, description: res.statusText }));
      if (!j.ok) throw new TgError(j.error_code, j.description);
      return j.result;
    } finally { clearTimeout(t); }
  }

  /* Vòng nhận tin: lỗi mạng thì chờ lùi dần (1s → 60s) rồi thử lại, không bao giờ ném lỗi ra ngoài làm sập web */
  async function poll(onUpdate) {
    running = true;
    let offset = 0, backoff = 1000;
    while (running) {
      try {
        const ups = await call("getUpdates", { offset, timeout: 50, allowed_updates: ["message", "callback_query"] }, 65000);
        backoff = 1000;
        for (const u of ups) {
          offset = u.update_id + 1;
          try { await onUpdate(u); } catch (e) { console.error("[bot] Lỗi xử lý tin:", e); }
        }
      } catch (e) {
        if (!running) break;
        if (e.code === 409) console.error("[bot] Telegram báo 409: có nơi khác đang chạy cùng bot này (máy thứ 2 trong cụm?). Chỉ bật TELEGRAM_ENABLED ở một máy.");
        else if (e.code === 401) { console.error("[bot] TELEGRAM_BOT_TOKEN không đúng – dừng bot."); running = false; break; }
        else console.error("[bot] Mất kết nối Telegram:", e.message || e);
        await sleep(backoff); backoff = Math.min(backoff * 2, 60000);
      }
    }
  }
  function stop() { running = false; if (abort) abort.abort(); }

  return {
    call, poll, stop,
    send: (chatId, text, keyboard) => call("sendMessage", {
      chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true,
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    }),
    edit: (chatId, messageId, text, keyboard) => call("editMessageText", {
      chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", disable_web_page_preview: true,
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    }).catch(e => { if (!/message is not modified/.test(e.message)) throw e; }),
    answer: (callbackId, text) => call("answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text } : {}) }).catch(() => {}),
  };
}

/* Chèn chữ người dùng vào tin nhắn parse_mode HTML */
const h = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

module.exports = { createClient, h, TgError };
