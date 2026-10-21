"use strict";
/* Nhập theo tuần qua bot: /nhap, /tuannay (kèm sửa/xoá từng dòng), /cheptuan, và câu tự do (AI).
   Ghi ĐÚNG như màn "Nhập theo tuần" (frontend/js/views/weekly-input.js → entryForm/onSave, copyPrev):
     - tài liệu weeks/<thứ 2>__<slug tên> = {week, person, entries}; 1 lượt nhập = {id, projectId, taskId, work, qm, hours,
       pt, status, ms, nn, note}; xoá dòng cuối cùng → xoá cả tài liệu (như saveWeek với danh sách rỗng);
     - kiểm tra: giờ 0,5–32; tải lượt này không vượt phần Capacity còn lại của tuần; mỗi đầu việc 1 dòng/tuần (trừ dự án
       Nội bộ) – đầu việc đã có thì lượt mới CẬP NHẬT dòng đó;
     - ghi qua saveDoc()/removeDoc() → cùng kiểm quyền own-week, audit, realtime; Độ phức tạp đồng bộ về Kế hoạch (setTaskPt).
   Chỉ nhập cho CHÍNH người nhắn, chỉ TUẦN HIỆN TẠI. Quy mô (qm – chỉ tham khảo) suy ra từ số giờ (qmFromHours). */
module.exports = core => {
  const { W, h, n1, cut, uid, btn, rows, cancelRow, skipRow, pickList, rbtn, taskOf, isInternal, weekDoc, ctx } = core;
  const { tg } = core;
  const HOUR_BTNS = [0.5, 1, 2, 3, 4, 6, 8, 16];
  const MS_HINT = { 1: "Vướng nhẹ", 2: "Vướng vừa", 3: "Vướng nhiều", 4: "Phụ thuộc nghiêm trọng", 5: "Bị đình trệ" };
  const week = () => ctx.mondayOfToday();
  const NO_STAFF = "Tài khoản của bạn chưa gắn với nhân sự nào nên chưa nhập tuần được. Nhờ trưởng phòng gắn ở Cài đặt → Tài khoản đăng nhập.";

  /* Dự án người này được chọn – khớp projOpts trong entryForm (weekly-input.js) */
  function allowedProjects(user, data) {
    const who = user.staff_name, full = core.isFull(user);
    const mine = p => core.assigned(p, who) || (p.tasks || []).some(t => core.onTask(t, who));
    const recent = new Set(data.weeks.filter(w => w.person === who).flatMap(w => (w.entries || []).map(e => e.projectId)));
    const list = data.projects.filter(p => (p.tasks || []).length && (full || isInternal(p) || mine(p))
      && (isInternal(p) || !W.projectDone(p, data.latest)));
    const rank = p => mine(p) ? 0 : recent.has(p.id) ? 1 : isInternal(p) ? 2 : 3;
    return list.map((p, i) => [p, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0]);
  }
  /* Đầu việc chọn được: dự án thường chỉ hiện việc còn mở (+ việc của lượt đang sửa); Nội bộ hiện hết */
  const allowedTasks = (p, data, keepId) =>
    (p.tasks || []).filter(t => isInternal(p) || t.id === keepId || W.C.OPEN.has(W.taskStatus(p, t, data.latest)));

  /* Capacity còn lại của tuần, trừ chính dòng đang sửa (khớp remainH/budgetH ở entryForm) */
  async function remaining(s) {
    const who = s.user.staff_name, st = s.data.staff.find(x => x.name === who) || { cap: 0 };
    const doc = await weekDoc(who);
    const other = (doc ? doc.entries || [] : []).filter(e => e.id !== s.d.entryId && e.status !== "Hủy")
      .reduce((a, e) => a + (W.entryWl(e) || 0), 0);
    return { cap: st.cap, left: Math.max(0, W.r1(st.cap - other)) };
  }
  /* Chọn xong đầu việc: nếu đã có dòng trong tuần (và không phải Nội bộ) → lượt này cập nhật dòng đó */
  async function pickTask(s, taskId) {
    const d = s.d, p = s.data.pById.get(d.projectId);
    d.taskId = taskId; delete d.entryId;
    if (!isInternal(p)) {
      const doc = await weekDoc(s.user.staff_name);
      const ex = doc && (doc.entries || []).find(e => e.projectId === d.projectId && e.taskId === taskId);
      if (ex) { d.entryId = ex.id; d.qm = ex.qm; }
    }
  }

  const flow = {
    title: () => `Xác nhận lượt nhập tuần ${h(week())}`,
    /* Bước kế tiếp còn thiếu – undefined = chưa hỏi; null/"" = đã trả lời "không/bỏ qua" */
    next(d) {
      if (!d.projectId) return "project";
      if (!d.taskId) return "task";
      if (d.hours == null) return "hours";
      if (d.pt === undefined) return "pt";
      if (!d.status) return "status";
      const stuck = d.status === "Đang vướng";
      if (stuck && d.ms === undefined) return "ms";
      if (stuck && d.nn === undefined) return "nn";
      if (d.note === undefined && (stuck || d.askNote)) return "note";
      if (d.work === undefined) return "work";
      return "confirm";
    },
    card(s) {
      const d = s.d, p = d.projectId && s.data.pById.get(d.projectId), t = taskOf(p, d.taskId);
      const L = [];
      if (p) L.push(`📁 <b>${h(p.name)}</b>`);
      if (t) L.push(`📌 ${h(W.shortName(t.dv))}`);
      if (d.hours != null) L.push(`⏱ ${n1(d.hours)} giờ` + (d.pt !== undefined ? ` · Độ phức tạp: ${d.pt ? d.pt + " – " + W.C.PT_HINT[d.pt] : "Mặc định"}` : ""));
      if (d.status) L.push(`🔖 ${h(d.status)}` + (d.ms ? ` · Ma sát ${d.ms} (${MS_HINT[d.ms]})` : "") + (d.nn ? ` · ${h(d.nn)}` : ""));
      if (d.note) L.push(`⚠️ Vướng mắc: ${h(d.note)}`);
      if (d.work) L.push(`📝 ${h(d.work)}`);
      if (d.entryId) L.push(`<i>(Cập nhật dòng đã có trong tuần)</i>`);
      return L.join("\n");
    },
    async view(s, pre) {
      const d = s.d;
      switch (s.step) {
        case "project": {
          const list = allowedProjects(s.user, s.data);
          if (!list.length) return { text: "Bạn chưa được giao dự án nào để nhập. Liên hệ trưởng phòng.", kb: [cancelRow(s)] };
          return { text: `<b>Nhập việc tuần ${h(week())}</b>\nChọn <b>dự án</b> (${list.length}):`,
            kb: [...pickList(s, list.map(p => [(isInternal(p) ? "🏢 " : "") + p.name, p.id]), "p"), cancelRow(s)] };
        }
        case "task": {
          const p = s.data.pById.get(d.projectId), list = allowedTasks(p, s.data, d.taskId);
          if (!list.length) return { text: pre + "Dự án này không còn đầu việc nào đang mở.", kb: [[btn(s, "◀ Chọn dự án khác", "back")], cancelRow(s)] };
          return { text: pre + `Chọn <b>đầu việc</b> (${list.length}):`,
            kb: [...pickList(s, list.map(t => [W.shortName(t.dv), t.id]), "t"), [btn(s, "◀ Dự án khác", "back"), btn(s, "✖ Huỷ", "cancel")]] };
        }
        case "hours": {
          const rem = await remaining(s);
          return { text: pre + `<b>Số giờ thực hiện</b> trong tuần cho đầu việc này?\n<i>Còn trống ${n1(rem.left)}h / ${n1(rem.cap)}h capacity. Có thể gõ số, vd 2,5</i>`,
            kb: [...rows(HOUR_BTNS.map(x => btn(s, n1(x) + "h", "h", x)), 4), cancelRow(s)] };
        }
        case "pt": {
          const t = taskOf(s.data.pById.get(d.projectId), d.taskId), cur = t && t.pt;
          return { text: pre + `<b>Độ phức tạp</b>? (nhân vào số giờ để tính tải)` + (cur ? `\n<i>Kế hoạch đang ghi: ${cur} – ${W.C.PT_HINT[cur]}</i>` : ""),
            kb: [[btn(s, "Mặc định (×1)", "pt", 0)], ...rows([1, 2, 3, 4, 5].map(n => btn(s, `${n === cur ? "✓ " : ""}${n} · ${W.C.PT_HINT[n]}`, "pt", n)), 2), cancelRow(s)] };
        }
        case "status": return { text: pre + "<b>Trạng thái</b> đầu việc?", kb: [...rows(W.C.ST_WEEK.map((x, i) => btn(s, x, "s", i)), 2), cancelRow(s)] };
        case "ms": return { text: pre + "<b>Mức ma sát</b> (vướng đến đâu)?", kb: [...[1, 2, 3, 4, 5].map(n => [btn(s, `${n} · ${MS_HINT[n]}`, "ms", n)]), cancelRow(s)] };
        case "nn": return { text: pre + "<b>Nguyên nhân</b> vướng?", kb: [...rows(W.C.CAUSES.map((c, i) => btn(s, c, "nn", i)), 2), [btn(s, "Bỏ qua", "nn", -1)], cancelRow(s)] };
        case "note": return { text: pre + "Gõ nội dung <b>vướng mắc / cần ai hỗ trợ</b>:", kb: [skipRow(s)] };
        case "work": return { text: pre + "Gõ <b>việc đã làm</b> trong tuần:", kb: [skipRow(s)] };
      }
      return { text: "…" };
    },
    async onPick(chatId, s, act, arg) {
      const d = s.d, num = Number(arg);
      switch (act) {
        case "back": delete d.projectId; delete d.taskId; delete d.entryId; break;
        case "p": { const pid = s.opts[num]; if (!pid) return true; if (pid !== d.projectId) { delete d.taskId; delete d.entryId; } d.projectId = pid; break; }
        case "t": { const tid = s.opts[num]; if (!tid) return true; await pickTask(s, tid); break; }
        case "h": d.hours = num; break;
        case "pt": d.pt = num || null; break;
        case "s":
          d.status = W.C.ST_WEEK[num];
          if (d.status !== "Đang vướng") { if (d.ms === undefined) d.ms = null; if (d.nn === undefined) d.nn = ""; }
          break;
        case "ms": d.ms = num; break;
        case "nn": d.nn = num >= 0 ? W.C.CAUSES[num] : ""; break;
        default: return false;
      }
      await core.goNext(chatId, s); return true;
    },
    onText(s, text) {
      if (s.step === "hours") {
        const v = Number(text.replace(",", "."));
        if (!(v >= 0.5 && v <= 32)) return "Số giờ phải từ 0,5 đến 32. Gõ lại số giờ:";
        s.d.hours = Math.round(v * 2) / 2; return null;
      }
      if (s.step === "work" || s.step === "note") { s.d[s.step] = text.slice(0, 1000); return null; }
      return undefined;
    },
    editFields: () => [["Dự án", "project"], ["Đầu việc", "task"], ["Số giờ", "hours"], ["Độ phức tạp", "pt"], ["Trạng thái", "status"], ["Vướng mắc", "note"], ["Việc đã làm", "work"]],
    clear(s, key) {
      const d = s.d;
      if (key === "project") { delete d.projectId; delete d.taskId; delete d.entryId; }
      else if (key === "task") { delete d.taskId; delete d.entryId; }
      else if (key === "status") { delete d.status; delete d.ms; delete d.nn; }
      else if (key === "note") { delete d.note; d.askNote = true; if (d.status === "Đang vướng") { delete d.ms; delete d.nn; } }
      else delete d[key];
    },
    async validate(s) {
      const d = s.d;
      if (!(d.hours >= 0.5 && d.hours <= 32)) return "Thời gian thực hiện phải từ 0,5 đến 32 giờ.";
      const wl = W.r1(d.hours * (d.pt ? W.C.PT_MULT[d.pt] : 1)), rem = await remaining(s);
      if (d.status !== "Hủy" && wl > rem.left)
        return `Việc này tính tải ${n1(wl)}h (giờ × Độ phức tạp), vượt phần còn lại của tuần (${n1(rem.left)}h / ${n1(rem.cap)}h). Bấm Sửa để giảm giờ hoặc Độ phức tạp.`;
      return null;
    },
    async commit(s) {
      const d = s.d, who = s.user.staff_name, wk = week();
      const doc = await weekDoc(who), list = doc ? [...(doc.entries || [])] : [];
      const p = s.data.pById.get(d.projectId), t = taskOf(p, d.taskId);
      // Kiểm tra lại trùng ngay trước khi ghi (có thể vừa nhập trên web trong lúc đang trò chuyện với bot)
      if (!d.entryId && !isInternal(p)) { const ex = list.find(e => e.projectId === d.projectId && e.taskId === d.taskId); if (ex) d.entryId = ex.id; }
      const clean = { id: d.entryId || uid("e"), projectId: d.projectId, taskId: d.taskId, work: d.work || "",
        qm: d.qm || W.qmFromHours(d.hours), hours: d.hours, pt: d.pt || null, status: d.status || "", ms: d.ms ?? null, nn: d.nn || "", note: d.note || "" };
      const i = list.findIndex(e => e.id === clean.id);
      if (i >= 0) list[i] = clean; else list.push(clean);
      const err = await ctx.saveDoc(s.user, "weeks", `${wk}__${core.slug(who)}`, { week: wk, person: who, entries: list });
      if (err) return { error: err.error };
      if (d.pt && t && !isInternal(p) && d.pt !== t.pt) await ctx.setTaskPt(s.user, p.id, t.id, d.pt).catch(() => {});
      return { text: `✅ <b>Đã lưu</b> vào tuần ${h(wk)} – web cập nhật ngay.\n\n${flow.card(s).replace(/\n<i>\(Cập nhật dòng.*$/s, "")}`,
        kb: [[{ text: "➕ Nhập việc khác", callback_data: "new" }, { text: "📋 Xem tuần này", callback_data: "week" }]] };
    },
  };

  /* ---------- lệnh ---------- */
  async function cmdNhap(chatId, user) {
    if (!user.staff_name) return tg.send(chatId, NO_STAFF);
    const s = core.startFlow(chatId, user, await core.loadData(), "week");
    s.step = "project";
    await core.show(chatId, s, "send");
  }
  /* Bắt đầu /nhap với dự án + đầu việc chọn sẵn (từ /viectoi) – vẫn kiểm tra người này được nhập đầu việc đó */
  async function nhapTask(chatId, user, { pid, tid }) {
    if (!user.staff_name) return tg.send(chatId, NO_STAFF);
    const data = await core.loadData(), p = data.pById.get(pid);
    if (!p || !allowedProjects(user, data).includes(p) || !allowedTasks(p, data).some(t => t.id === tid))
      return tg.send(chatId, "Đầu việc này không còn mở hoặc bạn không được nhập. Gõ /nhap để chọn lại.");
    const s = core.startFlow(chatId, user, data, "week", { projectId: pid });
    await pickTask(s, tid);
    await core.goNext(chatId, s, "send");
  }

  async function cmdWeek(chatId, user) {
    if (!user.staff_name) return tg.send(chatId, NO_STAFF);
    const data = await core.loadData(), doc = await weekDoc(user.staff_name), es = doc ? doc.entries || [] : [];
    const st = data.staff.find(x => x.name === user.staff_name) || { cap: 0 };
    const tot = W.r1(es.filter(e => e.status !== "Hủy").reduce((a, e) => a + (W.entryWl(e) || 0), 0));
    const lines = es.map((e, i) => {
      const p = data.pById.get(e.projectId), t = taskOf(p, e.taskId);
      return `<b>${i + 1}.</b> <b>${h(p ? p.name : e.projectId)}</b> – ${h(t ? W.shortName(t.dv) : e.taskId)}\n   ${e.hours != null ? n1(e.hours) + "h" : "⚠️ chưa có giờ"} · ${h(e.status || "chưa có trạng thái")}${e.work ? " · " + h(cut(e.work, 80)) : ""}`;
    });
    const editBtns = es.flatMap((e, i) => [rbtn(`✏️ ${i + 1}`, "wedit", { id: e.id }), rbtn(`🗑 ${i + 1}`, "wdelask", { id: e.id })]);
    return tg.send(chatId, core.clip(`<b>Tuần ${h(week())} – ${h(user.staff_name)}</b>\nTải: <b>${n1(tot)}h / ${n1(st.cap)}h</b>${st.cap && tot > st.cap ? " ⚠️ quá tải" : ""}\n\n`
      + (lines.join("\n") || "<i>Chưa nhập việc nào.</i>") + (es.length ? "\n\n<i>Bấm ✏️ để sửa, 🗑 để xoá dòng tương ứng.</i>" : "")),
      [...rows(editBtns, 4), [{ text: "➕ Nhập việc", callback_data: "new" }]]);
  }

  /* Sửa 1 dòng: mở phiên /nhap nạp sẵn dòng đó. Dòng chưa có giờ (vừa chép từ tuần trước) thì hỏi tiếp từ số giờ. */
  async function editEntry(chatId, user, { id }) {
    if (!user.staff_name) return tg.send(chatId, NO_STAFF);
    const doc = await weekDoc(user.staff_name), e = doc && (doc.entries || []).find(x => x.id === id);
    if (!e) return tg.send(chatId, "Không còn dòng này trong tuần (có thể đã sửa/xoá trên web). Gõ /tuannay để xem lại.");
    const data = await core.loadData();
    if (!taskOf(data.pById.get(e.projectId), e.taskId)) return tg.send(chatId, "Đầu việc của dòng này không còn trong kế hoạch dự án – sửa trên web.");
    const fresh = e.hours == null;
    const s = core.startFlow(chatId, user, data, "week", {
      projectId: e.projectId, taskId: e.taskId, entryId: e.id, qm: e.qm, hours: e.hours ?? null, pt: fresh && e.pt == null ? undefined : (e.pt ?? null),
      status: e.status || undefined, ms: e.ms ?? (e.status && e.status !== "Đang vướng" ? null : undefined), nn: e.nn ?? "", note: e.note ?? "",
      work: fresh && !e.work ? undefined : (e.work || ""),
    });
    await core.goNext(chatId, s, "send");
  }
  async function delAsk(chatId, user, { id }, msgId) {
    const data = await core.loadData(), doc = user.staff_name && await weekDoc(user.staff_name);
    const e = doc && (doc.entries || []).find(x => x.id === id);
    if (!e) return tg.send(chatId, "Không còn dòng này trong tuần. Gõ /tuannay để xem lại.");
    const p = data.pById.get(e.projectId), t = taskOf(p, e.taskId);
    return tg.send(chatId, `Xoá dòng này khỏi tuần ${h(week())}?\n\n📁 <b>${h(p ? p.name : e.projectId)}</b>\n📌 ${h(t ? W.shortName(t.dv) : e.taskId)}\n⏱ ${e.hours != null ? n1(e.hours) + "h" : "chưa có giờ"} · ${h(e.status || "–")}`,
      [[rbtn("🗑 Xoá", "wdel", { id }), rbtn("Thôi", "noop")]]);
  }
  async function del(chatId, user, { id }, msgId) {
    const who = user.staff_name, wk = week(), doc = who && await weekDoc(who);
    if (!doc || !(doc.entries || []).some(x => x.id === id)) return tg.edit(chatId, msgId, "Dòng này đã không còn.");
    const list = doc.entries.filter(x => x.id !== id), docId = `${wk}__${core.slug(who)}`;
    const err = list.length ? await ctx.saveDoc(user, "weeks", docId, { week: wk, person: who, entries: list }) : await ctx.removeDoc(user, "weeks", docId);
    if (err) return tg.edit(chatId, msgId, `❌ Không xoá được: ${h(err.error)}`);
    return tg.edit(chatId, msgId, "🗑 Đã xoá dòng khỏi tuần này.", [[{ text: "📋 Xem tuần này", callback_data: "week" }]]);
  }

  /* Chép việc chưa xong tuần trước – khớp copyPrev() ở weekly-input.js */
  async function cmdCopy(chatId, user) {
    if (!user.staff_name) return tg.send(chatId, NO_STAFF);
    const who = user.staff_name, wk = week(), prevWk = W.mondayOf(new Date(new Date(wk + "T00:00:00").getTime() - 7 * 864e5));
    const prev = await weekDoc(who, prevWk);
    if (!prev) return tg.send(chatId, `Tuần trước (${h(prevWk)}) bạn chưa nhập việc nào nên không có gì để chép.`);
    const doc = await weekDoc(who), list = doc ? [...(doc.entries || [])] : [];
    const have = new Set(list.map(x => x.projectId + "|" + x.taskId));
    let n = 0;
    for (const e of prev.entries || []) {
      if (["Hoàn thành", "Hủy"].includes(e.status) || have.has(e.projectId + "|" + e.taskId)) continue;
      list.push({ id: uid("e"), projectId: e.projectId, taskId: e.taskId, work: "", hours: null, pt: e.pt || null, status: "", ms: null, nn: "", note: "" }); n++;
    }
    if (!n) return tg.send(chatId, "Không có việc nào cần chép (việc tuần trước đã xong hoặc đã có trong tuần này).");
    const err = await ctx.saveDoc(user, "weeks", `${wk}__${core.slug(who)}`, { week: wk, person: who, entries: list });
    if (err) return tg.send(chatId, `❌ Không chép được: ${h(err.error)}`);
    await tg.send(chatId, `✅ Đã chép <b>${n}</b> việc từ tuần trước – hãy điền số giờ và trạng thái (bấm ✏️ ở từng dòng).`);
    return cmdWeek(chatId, user);
  }

  /* ---------- AI: câu tự do → bản nháp → các bước còn thiếu → Xác nhận ---------- */
  async function freeText(chatId, user, text) {
    if (!ctx.ai || !ctx.ai.enabled) return tg.send(chatId, "Gõ /nhap để nhập việc trong tuần, /help để xem các lệnh.");
    if (!user.staff_name) return tg.send(chatId, NO_STAFF);
    const data = await core.loadData();
    const projects = allowedProjects(user, data).map(p => ({ id: p.id, name: p.name, tasks: allowedTasks(p, data).map(t => ({ id: t.id, name: W.shortName(t.dv) })) }));
    const wait = await tg.send(chatId, "⏳ Đang đọc tin nhắn…");
    let d;
    try { d = await ctx.ai.parse(text, { projects, statuses: W.C.ST_WEEK, causes: W.C.CAUSES, today: W.todayISO() }); }
    catch (e) { console.error("[bot/ai]", e.message); d = null; }
    // Chỉ giữ giá trị hợp lệ – AI không bao giờ được tự đặt ra dự án/đầu việc/giá trị ngoài danh sách
    const draft = {}, p = d && projects.find(x => x.id === d.projectId);
    if (p) { draft.projectId = p.id; if (p.tasks.some(t => t.id === d.taskId)) draft.taskId = d.taskId; }
    if (d && typeof d.hours === "number" && d.hours >= 0.5 && d.hours <= 32) draft.hours = Math.round(d.hours * 2) / 2;
    if (d && W.C.ST_WEEK.includes(d.status)) draft.status = d.status;
    if (d && [1, 2, 3, 4, 5].includes(d.ms)) draft.ms = d.ms;
    if (d && W.C.CAUSES.includes(d.nn)) draft.nn = d.nn;
    if (d && typeof d.work === "string" && d.work.trim()) draft.work = d.work.trim().slice(0, 1000);
    if (d && typeof d.note === "string" && d.note.trim()) draft.note = d.note.trim().slice(0, 1000);
    if (!draft.projectId) { await tg.edit(chatId, wait.message_id, "🤔 Chưa nhận ra dự án/đầu việc trong tin nhắn. Chọn bằng nút nhé:"); return cmdNhap(chatId, user); }
    const s = core.startFlow(chatId, user, data, "week", draft);
    if (draft.taskId) await pickTask(s, draft.taskId);
    s.msgId = wait.message_id;
    await core.goNext(chatId, s, "edit");
  }

  return {
    flows: { week: flow },
    commands: [
      { name: "nhap", desc: "Nhập việc trong tuần", run: cmdNhap },
      { name: "tuannay", desc: "Xem / sửa / xoá việc đã nhập tuần này", run: cmdWeek },
      { name: "cheptuan", desc: "Chép việc chưa xong của tuần trước", run: cmdCopy },
    ],
    handlers: { wedit: editEntry, wdelask: delAsk, wdel: del, nhapTask, noop: (chatId, u, a, msgId) => tg.edit(chatId, msgId, "Đã huỷ.") },
    statics: { new: cmdNhap, week: cmdWeek },
    freeText,
  };
};
