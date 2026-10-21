"use strict";
/* Lõi hội thoại của bot – dùng chung cho mọi luồng trong flows/*.js:
   - PHIÊN (session): mỗi chat có tối đa 1 luồng đang dở (nhập tuần, thêm dự án…), sống 30 phút. Một luồng khai báo:
       { title(s), next(d) → tên bước, view(s) → {text, kb} cho từng bước, card(s) → tóm tắt bản nháp,
         onPick(chatId, s, act, arg) → true nếu đã xử lý nút, onText(s, text) → undefined (bước này không gõ chữ)
         | "lỗi" | null (đã nhận), validate?(s) → "lỗi"|null, commit(s) → {text, kb} | {error}, editFields?(s), clear?(s, key) }
     Lõi tự lo 2 bước chung "confirm" (thẻ Xác nhận: Đồng ý / Sửa / Huỷ) và "edit" (chọn mục cần sửa), các nút chung
     cancel / pg (trang) / skip (bỏ qua bước gõ chữ) / edit / e (sửa 1 mục) / ok (ghi).
   - NÚT KHÔNG GẮN PHIÊN (ref): nút ở các màn chỉ xem (/duan, /tai…) trỏ tới 1 hàm xử lý + tham số giữ trong bộ nhớ
     (callback_data của Telegram tối đa 64 byte, không chứa nổi mã dự án dài). Hết hạn sau 24 giờ.
   Không giữ dữ liệu nghiệp vụ trong bộ nhớ: phiên/ref chỉ là trạng thái giao diện của máy đang chạy bot. */
const { slug } = require("../lib/staff");
const W = require("../lib/workload");
const { h } = require("./telegram");

const SESSION_MIN = 30;
const PAGE = 10;
const REF_TTL = 24 * 3600e3, REF_MAX = 5000;

const n1 = x => x == null ? "–" : String(W.r1(x)).replace(".", ",");
const cut = (s, n) => (s = String(s || "")).length > n ? s.slice(0, n - 1) + "…" : s;
const uid = p => p + Math.random().toString(36).slice(2, 9);
const dm = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "–";
const pct = x => x == null ? "–" : Math.round(x * 100) + "%";
/* Tin Telegram tối đa 4096 ký tự – cắt gọn ở ranh giới dòng */
function clip(text, max = 3900) {
  if (text.length <= max) return text;
  const s = text.slice(0, max); return s.slice(0, s.lastIndexOf("\n")) + "\n<i>… (còn nữa – xem đầy đủ trên web)</i>";
}

function createCore(ctx) {
  const { tg, store, links, FULL_ROLES } = ctx;
  const sessions = new Map(), flows = {}, handlers = {}, refs = new Map();
  let refSeq = 0;
  setInterval(() => {
    const now = Date.now();
    for (const [c, s] of sessions) if (s.exp < now) sessions.delete(c);
    for (const [k, r] of refs) if (r.exp < now) refs.delete(k);
  }, 60e3).unref();

  /* ---------- dữ liệu & người dùng ---------- */
  async function loadData() {
    const d = await W.loadData(store, W.mondayOf(new Date(Date.now() - 156 * 7 * 864e5)));
    d.latest = W.latestByTask(d.weeks);
    d.pById = new Map(d.projects.map(p => [p.id, p]));
    return d;
  }
  async function userOf(chatId) {
    const id = await links.userIdOf(chatId);
    if (!id) return null;
    const u = await store.getUserById(id);
    return u && u.active ? u : null;
  }
  const isFull = u => FULL_ROLES.has(u.role);
  const isInternal = p => !!p && p.type === "Nội bộ";
  /* TM/SE của dự án – khớp projectAssigned() ở frontend/js/core/constants.js */
  const assigned = (p, who) => !!who && (W.pOwners(p).includes(who) || W.pSes(p).includes(who));
  /* Người phụ trách hoặc thực hiện đầu việc t */
  const onTask = (t, who) => !!who && (W.tOwners(t).includes(who) || W.tCollabs(t).includes(who));
  /* Được sửa dự án/đầu việc – khớp canManageProject() ở plan.js và canWrite "own-project" ở server.js */
  const canManage = (u, p) => isFull(u) || p.created_by === u.username || assigned(p, u.staff_name);
  async function getJSON(path) { const r = await store.getDoc(path); return r ? JSON.parse(r) : null; }
  const weekDoc = (person, week) => getJSON(`weeks/${week || ctx.mondayOfToday()}__${slug(person)}`);
  const taskOf = (p, taskId) => p && (p.tasks || []).find(t => t.id === taskId);

  /* ---------- nút ---------- */
  const rows = (arr, per) => arr.reduce((a, b, i) => (i % per ? a[a.length - 1].push(b) : a.push([b]), a), []);
  /* Nút không gắn phiên: rbtn("Xem", "duanp", {id}) → khi bấm gọi handlers.duanp(chatId, user, {id}, msgId) */
  function rbtn(text, handler, args = {}) {
    const id = (++refSeq).toString(36);
    refs.set(id, { handler, args, exp: Date.now() + REF_TTL });
    if (refs.size > REF_MAX) refs.delete(refs.keys().next().value);
    return { text, callback_data: "r|" + id };
  }
  /* Nút trong phiên: callback_data = "<khoá phiên>|<hành động>|<tham số>" */
  const btn = (s, text, act, arg = "") => ({ text, callback_data: `${s.k}|${act}|${arg}` });
  const cancelRow = s => [btn(s, "✖ Huỷ", "cancel")];
  const skipRow = s => [btn(s, "Bỏ qua", "skip"), btn(s, "✖ Huỷ", "cancel")];
  function pager(s, total) {
    const nav = [];
    if (s.page > 0) nav.push(btn(s, "◀ Trước", "pg", s.page - 1));
    if ((s.page + 1) * PAGE < total) nav.push(btn(s, "Sau ▶", "pg", s.page + 1));
    return nav.length ? [nav] : [];
  }
  /* Danh sách chọn có phân trang trong phiên: items = [[nhãn, giá trị]], bấm → onPick(act, chỉ số trong s.opts) */
  function pickList(s, items, act, per = 1) {
    s.opts = items.map(x => x[1]);
    const page = items.slice(s.page * PAGE, (s.page + 1) * PAGE);
    return [...rows(page.map((x, i) => btn(s, cut(x[0], 60), act, s.page * PAGE + i)), per), ...pager(s, items.length)];
  }

  /* ---------- phiên ---------- */
  const touch = s => { s.exp = Date.now() + SESSION_MIN * 60e3; };
  function startFlow(chatId, user, data, flow, d = {}) {
    const s = { k: Math.random().toString(36).slice(2, 5), flow, step: null, d, opts: [], page: 0, msgId: null, msgText: "", exp: 0, user, data };
    sessions.set(String(chatId), s); touch(s); return s;
  }
  const getSession = chatId => { const s = sessions.get(String(chatId)); return s && s.exp > Date.now() ? s : null; };
  const endSession = chatId => sessions.delete(String(chatId));

  async function view(s) {
    const F = flows[s.flow];
    const card = F.card(s), pre = card ? card + "\n\n" : "";
    if (s.step === "confirm") {
      const err = F.validate ? await F.validate(s) : null;
      const canEdit = !!(F.editFields && F.editFields(s).length);
      return {
        text: `<b>${F.title(s)}</b>\n\n${card}` + (err ? `\n\n❗ ${h(err)}` : ""),
        kb: [[...(err ? [] : [btn(s, "✅ Đồng ý", "ok")]), ...(canEdit ? [btn(s, "✏️ Sửa", "edit")] : []), btn(s, "❌ Huỷ", "cancel")]],
      };
    }
    if (s.step === "edit") {
      return { text: pre + "Sửa mục nào?", kb: [...rows(F.editFields(s).map(([label, key]) => btn(s, label, "e", key)), 2), [btn(s, "◀ Quay lại", "e", "back")]] };
    }
    const v = await F.view(s, pre);
    return { text: clip(v.text), kb: v.kb };
  }
  /* Vẽ bước hiện tại: sửa tin nhắn đang có (khi bấm nút) hoặc gửi tin mới (khi người dùng gõ chữ) */
  async function show(chatId, s, mode = "edit") {
    const v = await view(s);
    if (mode === "edit" && s.msgId) { await tg.edit(chatId, s.msgId, v.text, v.kb); s.msgText = v.text; return; }
    if (s.msgId) await tg.edit(chatId, s.msgId, s.msgText).catch(() => {}); // gỡ nút ở tin cũ, tránh bấm nhầm
    const m = await tg.send(chatId, v.text, v.kb);
    s.msgId = m.message_id; s.msgText = v.text;
  }
  async function goNext(chatId, s, mode) { s.step = flows[s.flow].next(s.d, s); s.page = 0; await show(chatId, s, mode); }

  async function commit(chatId, s) {
    const F = flows[s.flow];
    const err0 = F.validate ? await F.validate(s) : null;
    if (err0) return show(chatId, s);
    let r;
    try { r = await F.commit(s); } catch (e) { console.error("[bot] commit:", e); r = { error: "Lỗi máy chủ – thử lại sau." }; }
    endSession(chatId);
    if (r.error) return tg.edit(chatId, s.msgId, `${F.card(s)}\n\n❌ Không lưu được: ${h(r.error)}`);
    return tg.edit(chatId, s.msgId, clip(r.text), r.kb);
  }

  async function onSessionCallback(chatId, s, act, arg) {
    const F = flows[s.flow], d = s.d;
    switch (act) {
      case "cancel": endSession(chatId); return tg.edit(chatId, s.msgId, "Đã huỷ, không lưu gì.");
      case "pg": s.page = Number(arg) || 0; return show(chatId, s);
      case "skip": d[s.step] = ""; return goNext(chatId, s);
      case "edit": s.step = "edit"; return show(chatId, s);
      case "e":
        if (arg !== "back") { if (F.clear) F.clear(s, arg); else delete d[arg]; }
        return goNext(chatId, s);
      case "ok": return commit(chatId, s);
    }
    if (await F.onPick(chatId, s, act, arg)) return;
  }
  async function onSessionText(chatId, s, text) {
    const r = await flows[s.flow].onText(s, text);
    if (r === undefined) return false;               // bước hiện tại không nhận chữ
    if (r) { await tg.send(chatId, `❗ ${h(r)}`); return true; }
    await goNext(chatId, s, "send"); return true;
  }

  return {
    ctx, tg, store, flows, handlers, W, h, n1, cut, uid, dm, pct, clip, slug, PAGE,
    loadData, userOf, isFull, isInternal, assigned, onTask, canManage, getJSON, weekDoc, taskOf,
    rows, rbtn, btn, cancelRow, skipRow, pager, pickList,
    startFlow, getSession, endSession, touch, show, goNext, onSessionCallback, onSessionText,
    refOf: id => { const r = refs.get(id); return r && r.exp > Date.now() ? r : null; },
  };
}

module.exports = { createCore };
