"use strict";
/* Lịch tự động của bot – tự kiểm tra mỗi 30 giây theo GIỜ MÁY CHỦ (VM phải đặt múi giờ Asia/Ho_Chi_Minh), không
   dùng thư viện cron. Giờ chạy lưu ở config/telegram (trưởng phòng sửa trên web: tài khoản → Liên kết Telegram →
   Lịch tự động); thiếu thì dùng DEFAULTS. Mỗi việc chạy tối đa 1 lần/ngày: mốc "đã chạy" ghi vào
   telegramState/<việc> nên khởi động lại máy chủ không gửi trùng; máy chủ tắt đúng giờ chạy thì bật lại trong
   cùng ngày vẫn gửi bù.
     remind  – nhắc người đã liên kết mà tuần này CHƯA nhập việc nào (hoặc còn dòng chưa có số giờ)
     alert   – (Thứ 2–Thứ 6) báo trưởng/phó phòng: người quá tải (Workload > Capacity) và việc "Đang vướng" MỚI
               kể từ lần báo trước; không có gì mới thì không nhắn
     summary – tóm tắt tuần gửi trưởng/phó phòng */
const W = require("../lib/workload");
const { h } = require("./telegram");

const DEFAULTS = {
  remind: { on: true, dow: 5, time: "15:00" },   // dow: 0 = Chủ nhật … 6 = Thứ 7
  alert: { on: true, time: "09:00" },            // Thứ 2 – Thứ 6
  summary: { on: true, dow: 5, time: "17:30" },
};
const DOW = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const n1 = x => String(W.r1(x || 0)).replace(".", ",");
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const hhmm = () => { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };

async function readConfig(store) {
  const raw = await store.getDoc("config/telegram");
  const c = raw ? JSON.parse(raw) : {};
  return { remind: { ...DEFAULTS.remind, ...c.remind }, alert: { ...DEFAULTS.alert, ...c.alert }, summary: { ...DEFAULTS.summary, ...c.summary } };
}

function createScheduler(ctx) {
  const { tg, store, links, FULL_ROLES, mondayOfToday } = ctx;
  let timer = null, busy = false;
  const config = () => readConfig(store);
  async function getState(job) { const r = await store.getDoc(`telegramState/${job}`); return r ? JSON.parse(r) : {}; }
  const setState = (job, s) => store.upsertDoc(`telegramState/${job}`, "telegramState", job, JSON.stringify(s), "bot");

  /* Người nhận: tài khoản đã liên kết, còn hoạt động */
  async function recipients(filter) {
    const out = [];
    for (const l of await links.all()) {
      const u = await store.getUserById(l.userId);
      if (u && u.active && filter(u)) out.push({ u, chatId: l.chatId });
    }
    return out;
  }
  const managers = () => recipients(u => FULL_ROLES.has(u.role));
  async function sendAll(list, text, kb) {
    for (const r of list) {
      try { await tg.send(r.chatId, text, kb); }
      catch (e) {
        console.error(`[bot] Không gửi được cho ${r.u.username}:`, e.message);
        if (e.code === 403) await links.unlinkUser(r.u.id); // người dùng đã chặn bot
      }
    }
  }

  /* ---------- các việc ---------- */
  async function weekData() {
    const week = mondayOfToday();
    const data = await W.loadData(store, W.mondayOf(new Date(Date.now() - 156 * 7 * 864e5)));
    data.latest = W.latestByTask(data.weeks);
    data.pById = new Map(data.projects.map(p => [p.id, p]));
    return { week, data, cur: data.weeks.filter(w => w.week === week) };
  }
  const taskLabel = (data, e) => {
    const p = data.pById.get(e.projectId), t = p && (p.tasks || []).find(x => x.id === e.taskId);
    return `${h(p ? p.name : e.projectId)} – ${h(t ? W.shortName(t.dv) : e.taskId)}`;
  };

  async function jobRemind(onlyChat) {
    const { week, cur } = await weekData();
    const list = await recipients(u => !!u.staff_name);
    const targets = list.filter(r => {
      const doc = cur.find(w => w.person === r.u.staff_name);
      const es = doc ? doc.entries || [] : [];
      return !es.length || es.some(e => e.hours == null && e.qm == null);
    }).filter(r => !onlyChat || r.chatId === onlyChat);
    await sendAll(targets, `⏰ <b>Nhắc nhập tuần ${h(week)}</b>\nBạn chưa nhập việc tuần này (hoặc còn dòng chưa có số giờ). Bấm nút bên dưới để nhập ngay trên Telegram.`,
      [[{ text: "➕ Nhập việc", callback_data: "new" }, { text: "📋 Xem tuần này", callback_data: "week" }]]);
    return targets.length;
  }

  function overloaded(data, week) {
    return W.loadByPerson(data, week).filter(r => r.cap > 0 && r.wl > r.cap).sort((a, b) => b.wl / b.cap - a.wl / a.cap);
  }
  function stuckEntries(cur) {
    const out = [];
    for (const w of cur) for (const e of w.entries || []) if (e.status === "Đang vướng") out.push({ ...e, person: w.person, key: `${w.week}|${w.person}|${e.id}` });
    return out.sort((a, b) => (b.ms || 0) - (a.ms || 0));
  }

  async function jobAlert(onlyChat) {
    const { week, data, cur } = await weekData();
    const st = onlyChat ? {} : await getState("alert");
    const seen = new Set(st.week === week ? st.seen || [] : []);
    const over = overloaded(data, week);
    const stuck = stuckEntries(cur), fresh = stuck.filter(e => !seen.has(e.key));
    const overKey = over.map(r => `${r.name}:${r.wl}`).join(",");
    const overChanged = overKey !== (st.week === week ? st.overKey : "");
    const L = [];
    if (over.length && (overChanged || onlyChat)) {
      L.push(`🔥 <b>Quá tải tuần ${h(week)}</b>`);
      for (const r of over) L.push(`• ${h(r.name)}: ${n1(r.wl)}h / ${n1(r.cap)}h (${Math.round(r.wl / r.cap * 100)}%)`);
    }
    const show = onlyChat ? stuck : fresh;
    if (show.length) {
      if (L.length) L.push("");
      L.push(`🚧 <b>Việc đang vướng${onlyChat ? "" : " (mới)"}</b>`);
      for (const e of show.slice(0, 15)) L.push(`• ${taskLabel(data, e)}\n   ${h(e.person)}${e.ms ? ` · ma sát ${e.ms}` : ""}${e.nn ? ` · ${h(e.nn)}` : ""}${e.note ? `\n   <i>${h(e.note.slice(0, 160))}</i>` : ""}`);
      if (show.length > 15) L.push(`… và ${show.length - 15} việc khác – xem trên web (chuông thông báo).`);
    }
    if (onlyChat) {
      await tg.send(onlyChat, L.length ? L.join("\n") : `✅ Tuần ${h(week)}: không ai quá tải, không có việc đang vướng.`);
    } else {
      if (L.length) await sendAll(await managers(), L.join("\n"));
      await setState("alert", { ...st, week, seen: stuck.map(e => e.key), overKey });
    }
    return L.length;
  }

  async function jobSummary(onlyChat) {
    const { week, data, cur } = await weekData();
    const loads = W.loadByPerson(data, week);
    const entered = new Set(cur.filter(w => (w.entries || []).length).map(w => w.person));
    const missing = data.staff.map(s => s.name).filter(n => !entered.has(n));
    const all = cur.flatMap(w => (w.entries || []).map(e => ({ ...e, person: w.person })));
    const done = all.filter(e => e.status === "Hoàn thành");
    const stuck = all.filter(e => e.status === "Đang vướng");
    const over = loads.filter(r => r.cap > 0 && r.wl > r.cap);
    const totH = W.r1(loads.reduce((a, r) => a + r.hours, 0));
    const totWl = W.r1(loads.reduce((a, r) => a + r.wl, 0)), totCap = W.r1(data.staff.reduce((a, s) => a + s.cap, 0));
    const L = [
      `📊 <b>Tóm tắt tuần ${h(week)}</b>`,
      `• Đã nhập: <b>${entered.size}/${data.staff.length}</b> người` + (missing.length ? `\n   Chưa nhập: ${missing.map(h).join(", ")}` : ""),
      `• Tổng giờ: <b>${n1(totH)}h</b> · Tải: ${n1(totWl)}h / ${n1(totCap)}h capacity (${totCap ? Math.round(totWl / totCap * 100) : 0}%)`,
      `• Hoàn thành: <b>${done.length}</b> việc · Đang vướng: <b>${stuck.length}</b> · Quá tải: <b>${over.length}</b> người`,
    ];
    if (done.length) { L.push("", "✅ <b>Hoàn thành</b>"); for (const e of done.slice(0, 10)) L.push(`• ${taskLabel(data, e)} <i>(${h(e.person)})</i>`); if (done.length > 10) L.push(`… và ${done.length - 10} việc khác`); }
    if (stuck.length) { L.push("", "🚧 <b>Đang vướng</b>"); for (const e of stuck.slice(0, 10)) L.push(`• ${taskLabel(data, e)} <i>(${h(e.person)}${e.nn ? " · " + h(e.nn) : ""})</i>`); if (stuck.length > 10) L.push(`… và ${stuck.length - 10} việc khác`); }
    if (over.length) { L.push("", "🔥 <b>Quá tải</b>"); for (const r of over) L.push(`• ${h(r.name)}: ${n1(r.wl)}h / ${n1(r.cap)}h`); }
    if (onlyChat) await tg.send(onlyChat, L.join("\n"));
    else await sendAll(await managers(), L.join("\n"));
    return 1;
  }

  const JOBS = { remind: jobRemind, alert: jobAlert, summary: jobSummary };

  /* ---------- đồng hồ ---------- */
  async function tick() {
    if (busy) return; busy = true;
    try {
      const c = await config(), day = today(), now = hhmm(), dow = new Date().getDay();
      for (const job of Object.keys(JOBS)) {
        const j = c[job];
        if (!j.on || !/^\d{2}:\d{2}$/.test(j.time || "") || now < j.time) continue;
        if (job === "alert" ? (dow === 0 || dow === 6) : dow !== Number(j.dow)) continue;
        const st = await getState(job);
        if (st.lastDay === day) continue;
        await setState(job, { ...st, lastDay: day }); // ghi mốc TRƯỚC khi gửi: lỗi giữa chừng thì thôi, không gửi lặp mỗi 30 giây
        try { await JOBS[job](); console.log(`[bot] Đã chạy lịch "${job}" (${day} ${now})`); }
        catch (e) { console.error(`[bot] Lỗi lịch "${job}":`, e); }
      }
    } catch (e) { console.error("[bot] Lỗi đồng hồ lịch:", e.message); }
    finally { busy = false; }
  }

  return {
    start() { timer = setInterval(tick, 30e3); timer.unref(); setTimeout(tick, 5e3).unref(); },
    stop() { clearInterval(timer); },
    /* Chạy ngay cho 1 chat (lệnh /tomtat, /canhbao của trưởng phòng) – không đổi mốc "đã gửi" */
    runNow: (job, chatId) => JOBS[job](chatId),
    config, DEFAULTS, DOW,
  };
}

module.exports = { createScheduler, readConfig, DEFAULTS };
