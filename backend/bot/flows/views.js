"use strict";
/* Các màn CHỈ XEM của bot: /tai (tải tuần), /duan (tổng quan dự án), /hantoi (sắp hạn & quá hạn), /viectoi (việc được giao).
   Số liệu tính bằng backend/lib/workload.js – cùng công thức với web (model.js/derive(), weekly-load.js, exec-dashboard.js):
     - Tải tuần: Workload = giờ × hệ số Độ phức tạp, so với Capacity; bỏ lượt Hủy (loadByPerson).
     - Dự án: tiến độ theo trọng số Quy mô (wlOf ?? 1), bỏ Hủy; quá hạn/sắp hạn (≤14 ngày) chỉ tính việc còn mở, không tính
       dự án Nội bộ (projectSummary/taskInfo).
   Phạm vi: nhân viên xem tải/hạn của CHÍNH MÌNH; trưởng/phó phòng/admin xem cả phòng. Dự án: mọi người xem tất cả (như tab
   Tổng quan trên web), dự án mình là TM/SE lên đầu. Nút ở đây không gắn phiên (rbtn) – bấm lại bất cứ lúc nào trong 24 giờ. */
module.exports = core => {
  const { W, h, n1, cut, dm, pct, rbtn, rows, clip, tg, isFull, isInternal, assigned, onTask, canManage, ctx } = core;
  const PAGE = core.PAGE;
  const addWeeks = (wk, n) => W.mondayOf(new Date(new Date(wk + "T00:00:00").getTime() + n * 7 * 864e5 + 12 * 3600e3));
  /* Gửi mới (gõ lệnh) hoặc sửa tin đang xem (bấm nút trang/tuần) */
  const out = (chatId, msgId, text, kb) => msgId ? tg.edit(chatId, msgId, clip(text), kb) : tg.send(chatId, clip(text), kb);
  const staffOf = (u, data) => data.staff.find(s => s.name === u.staff_name);
  const people = t => [...new Set([...W.tOwners(t), ...W.tCollabs(t)])].join(", ") || "chưa giao";

  /* ---------- /tai ---------- */
  async function tai(chatId, user, args = {}, msgId) {
    const cur = ctx.mondayOfToday(), wk = args.week || cur;
    const data = await core.loadData(), loads = W.loadByPerson(data, wk);
    const nav = [rbtn("◀ Tuần trước", "tai", { week: addWeeks(wk, -1) }), ...(wk !== cur ? [rbtn("Tuần này", "tai", { week: cur })] : []), rbtn("Tuần sau ▶", "tai", { week: addWeeks(wk, 1) })];
    const icon = r => !r.cap ? "▫️" : r.wl > r.cap ? "🔥" : r.wl >= 0.9 * r.cap ? "⚠️" : r.wl < 0.5 * r.cap ? "💤" : "✅";
    if (isFull(user)) {
      const missing = new Map(data.weeks.filter(w => w.week === wk).map(w => [w.person, (w.entries || []).filter(e => e.status !== "Hủy" && W.entryWl(e) == null).length]));
      const list = loads.filter(r => r.cap || r.n).sort((a, b) => (b.cap ? b.wl / b.cap : 0) - (a.cap ? a.wl / a.cap : 0));
      const tot = list.reduce((a, r) => a + r.wl, 0), cap = list.reduce((a, r) => a + r.cap, 0);
      const lines = list.map(r => `${icon(r)} ${h(r.name)}: <b>${n1(r.wl)}h</b> / ${n1(r.cap)}h (${r.cap ? Math.round(r.wl / r.cap * 100) : 0}%)` + (r.n ? "" : " · <i>chưa nhập</i>") + (missing.get(r.name) ? ` · ${missing.get(r.name)} dòng chưa có giờ` : ""));
      return out(chatId, msgId, `📊 <b>Tải tuần ${h(wk)} – cả phòng</b>\nTổng: <b>${n1(tot)}h / ${n1(cap)}h</b> (${cap ? Math.round(tot / cap * 100) : 0}%)\n\n${lines.join("\n") || "<i>Chưa có nhân sự.</i>"}\n\n<i>🔥 quá tải · ⚠️ ≥90% · ✅ vừa · 💤 &lt;50%</i>`, [nav]);
    }
    if (!user.staff_name) return tg.send(chatId, "Tài khoản chưa gắn với nhân sự nào.");
    const r = loads.find(x => x.name === user.staff_name) || { wl: 0, cap: (staffOf(user, data) || {}).cap || 0, hours: 0 };
    const doc = data.weeks.find(w => w.week === wk && w.person === user.staff_name), es = doc ? doc.entries || [] : [];
    const lines = es.map(e => {
      const p = data.pById.get(e.projectId), t = core.taskOf(p, e.taskId), wl = e.status === "Hủy" ? null : W.entryWl(e);
      return `• ${h(cut(p ? p.name : e.projectId, 30))} – ${h(cut(t ? W.shortName(t.dv) : e.taskId, 40))}: ${e.hours != null ? n1(e.hours) + "h" : "chưa có giờ"}${wl != null ? ` → ${n1(wl)}h tải` : ""} · ${h(e.status || "–")}`;
    });
    return out(chatId, msgId, `📊 <b>Tải tuần ${h(wk)} – ${h(user.staff_name)}</b>\n${icon(r)} <b>${n1(r.wl)}h / ${n1(r.cap)}h</b> (${r.cap ? Math.round(r.wl / r.cap * 100) : 0}%) · còn trống ${n1(Math.max(0, r.cap - r.wl))}h\nGiờ thật đã nhập: ${n1(r.hours)}h\n\n${lines.join("\n") || "<i>Chưa nhập việc nào.</i>"}`, [nav]);
  }

  /* ---------- /duan ---------- */
  function activeProjects(user, data) {
    const who = user.staff_name, today = W.todayISO();
    const mine = p => assigned(p, who) || (p.tasks || []).some(t => onTask(t, who));
    return data.projects.filter(p => !isInternal(p) && (p.tasks || []).length)
      .map(p => W.projectSummary(p, data.latest, today)).filter(x => !x.allDone)
      .map((x, i) => ({ ...x, mine: mine(x.p), i })).sort((a, b) => (b.mine - a.mine) || a.i - b.i);
  }
  const flags = x => [x.late ? `⏰${x.late}` : "", x.soon ? `📅${x.soon}` : "", x.stuck ? `🚧${x.stuck}` : ""].filter(Boolean).join(" ");
  async function duan(chatId, user, args = {}, msgId) {
    const data = await core.loadData(), list = activeProjects(user, data), page = args.page || 0;
    const part = list.slice(page * PAGE, (page + 1) * PAGE);
    const lines = part.map((x, i) => `<b>${page * PAGE + i + 1}.</b> ${x.mine ? "⭐ " : ""}${h(x.p.name)} — <b>${pct(x.prog)}</b> ${flags(x)}`);
    const nav = [...(page > 0 ? [rbtn("◀ Trước", "duan", { page: page - 1 })] : []), ...((page + 1) * PAGE < list.length ? [rbtn("Sau ▶", "duan", { page: page + 1 })] : [])];
    return out(chatId, msgId, `📁 <b>Dự án đang chạy</b> (${list.length})\n<i>⭐ của bạn · ⏰ quá hạn · 📅 sắp hạn 14 ngày · 🚧 đang vướng</i>\n\n${lines.join("\n") || "<i>Không có dự án nào đang chạy.</i>"}\n\nBấm số để xem chi tiết:`,
      [...rows(part.map((x, i) => rbtn(String(page * PAGE + i + 1), "duanp", { id: x.p.id, back: page })), 5), ...(nav.length ? [nav] : [])]);
  }
  async function duanP(chatId, user, { id, back }, msgId) {
    const data = await core.loadData(), p = data.pById.get(id);
    if (!p) return out(chatId, msgId, "Dự án không còn tồn tại.");
    const x = W.projectSummary(p, data.latest);
    const open = x.tasks.filter(t => t.open).sort((a, b) => (b.late - a.late) || (b.soon - a.soon) || (b.stuck - a.stuck) || String(a.t.deadline || "9").localeCompare(String(b.t.deadline || "9")));
    const ic = t => t.late ? "⏰" : t.soon ? "📅" : t.stuck ? "🚧" : "•";
    const lines = open.slice(0, 25).map(t => `${ic(t)} ${h(cut(W.shortName(t.t.dv), 50))} – <i>${h(t.status)}</i> · ${h(people(t.t))}${t.t.deadline ? ` · hạn ${dm(t.t.deadline)}` : ""}`);
    if (open.length > 25) lines.push(`<i>… và ${open.length - 25} đầu việc khác</i>`);
    const done = x.tasks.filter(t => t.status === "Hoàn thành").length, live = x.tasks.filter(t => t.status !== "Hủy").length;
    const kb = [];
    if (canManage(user, p)) kb.push([rbtn("➕ Thêm đầu việc", "themviecP", { id }), rbtn("📝 Cập nhật tình hình", "tinhhinhP", { id })]);
    kb.push([rbtn("◀ Danh sách dự án", "duan", { page: back || 0 })]);
    return out(chatId, msgId, [
      `📁 <b>${h(p.name)}</b> (${h(p.type)})`,
      `TM: ${h(W.pOwners(p).join(", ") || "–")} · SE: ${h(W.pSes(p).join(", ") || "–")}`,
      `Tiến độ: <b>${pct(x.prog)}</b> (${done}/${live} đầu việc xong) ${flags(x)}`,
      ...(p.milestones ? ["", `<b>Mốc hợp đồng</b>\n${h(cut(p.milestones, 400))}`] : []),
      ...(p.situation ? ["", `<b>Tình hình / vướng mắc</b>\n${h(cut(p.situation, 500))}`] : []),
      "", `<b>Đầu việc đang mở (${open.length})</b>`, lines.join("\n") || "<i>Không còn đầu việc nào đang mở.</i>",
    ].join("\n"), kb);
  }

  /* ---------- /hantoi ---------- */
  async function hantoi(chatId, user) {
    const data = await core.loadData(), today = W.todayISO(), who = user.staff_name, full = isFull(user);
    if (!full && !who) return tg.send(chatId, "Tài khoản chưa gắn với nhân sự nào.");
    const all = data.projects.filter(p => !isInternal(p)).flatMap(p => W.projectSummary(p, data.latest, today).tasks)
      .filter(t => (t.late || t.soon) && (full || onTask(t.t, who)))
      .sort((a, b) => a.t.deadline.localeCompare(b.t.deadline));
    const line = t => `• <b>${dm(t.t.deadline)}</b> ${h(cut(W.shortName(t.t.dv), 45))} – ${h(cut(t.p.name, 30))}${full ? ` · ${h(people(t.t))}` : ""}` +
      (t.late ? ` <i>(trễ ${W.daysBetween(t.t.deadline, today)} ngày)</i>` : ` <i>(${W.daysBetween(today, t.t.deadline) === 0 ? "hôm nay" : "còn " + W.daysBetween(today, t.t.deadline) + " ngày"})</i>`);
    const late = all.filter(t => t.late), soon = all.filter(t => t.soon);
    return tg.send(chatId, clip([
      `🗓 <b>Hạn chót${full ? " – cả phòng" : " – việc của bạn"}</b>`,
      "", `⏰ <b>Quá hạn (${late.length})</b>`, late.map(line).join("\n") || "<i>Không có.</i>",
      "", `📅 <b>Đến hạn trong 14 ngày (${soon.length})</b>`, soon.map(line).join("\n") || "<i>Không có.</i>",
    ].join("\n")));
  }

  /* ---------- /viectoi ---------- */
  async function viectoi(chatId, user) {
    if (!user.staff_name) return tg.send(chatId, "Tài khoản chưa gắn với nhân sự nào.");
    const data = await core.loadData(), who = user.staff_name;
    const list = data.projects.filter(p => !isInternal(p)).flatMap(p => W.projectSummary(p, data.latest).tasks)
      .filter(t => t.open && onTask(t.t, who))
      .sort((a, b) => (b.late - a.late) || (b.soon - a.soon) || String(a.t.deadline || "9").localeCompare(String(b.t.deadline || "9")));
    const show = list.slice(0, 30);
    const lines = show.map((t, i) => `<b>${i + 1}.</b> ${t.late ? "⏰" : t.soon ? "📅" : t.stuck ? "🚧" : "•"} ${h(cut(W.shortName(t.t.dv), 50))}\n   ${h(cut(t.p.name, 40))} · <i>${h(t.status)}</i> · ${W.tOwners(t.t).includes(who) ? "phụ trách" : "thực hiện"}${t.t.deadline ? ` · hạn ${dm(t.t.deadline)}` : ""}`);
    return tg.send(chatId, clip(`📋 <b>Việc được giao cho ${h(who)}</b> (${list.length} đang mở)\n\n${lines.join("\n") || "<i>Bạn không có đầu việc nào đang mở.</i>"}` +
      (show.length ? "\n\n<i>Bấm ➕ số tương ứng để nhập tuần cho việc đó.</i>" : "") + (list.length > 30 ? `\n<i>… và ${list.length - 30} việc khác</i>` : "")),
      rows(show.map((t, i) => rbtn(`➕ ${i + 1}`, "nhapTask", { pid: t.p.id, tid: t.t.id })), 5));
  }

  return {
    flows: {},
    commands: [
      { name: "tai", desc: "Xem tải tuần", run: (c, u) => tai(c, u) },
      { name: "duan", desc: "Tổng quan dự án đang chạy", run: (c, u) => duan(c, u) },
      { name: "hantoi", desc: "Việc sắp hạn & quá hạn", run: hantoi },
      { name: "viectoi", desc: "Việc được giao cho tôi", run: viectoi },
    ],
    handlers: { tai, duan, duanp: duanP },
    statics: { mine: viectoi, projects: (c, u) => duan(c, u) },
  };
};
