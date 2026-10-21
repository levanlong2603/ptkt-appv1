"use strict";
/* Quản lý dự án qua bot: /themduan, /themviec, /tinhhinh – ghi ĐÚNG như Kế hoạch dự án trên web (frontend/js/views/plan.js):
   - /themduan ↔ projectForm (onSave, isNew): id "p-<slug tên>" (+3 ký tự ngẫu nhiên nếu trùng), order = lớn nhất + 1, tự sinh
     toàn bộ đầu việc theo quy trình chuẩn của loại dự án (config/catalog, bỏ "Việc khác"), owner đầu việc = TM.
     Chỉ trưởng/phó phòng/admin (canWrite "own-project": dự án mới chỉ tài khoản toàn quyền tạo được).
   - /themviec ↔ taskForm (isNew): đầu việc chọn từ danh mục chuẩn theo loại dự án, id theo nextTaskId(), owner mặc định = TM.
   - /tinhhinh: sửa 1 trong 3 trường tường thuật của dự án – situation (Tình hình/vướng mắc), progress (Tiến độ hiện tại),
     proposal (Đề xuất) – như các ô cùng tên trong projectForm.
   /themviec và /tinhhinh: trưởng phòng, người tạo dự án, hoặc TM/SE (canManageProject ở plan.js). Mọi lần ghi qua saveDoc(). */
module.exports = core => {
  const { W, h, cut, dm, btn, rows, cancelRow, skipRow, pickList, rbtn, tg, isFull, canManage, assigned, getJSON, ctx } = core;
  const QM_HINT = W.C.QM_HINT;
  const FIELDS = { situation: "Tình hình / vướng mắc chung", progress: "Tiến độ hiện tại (Báo cáo)", proposal: "Đề xuất (Báo cáo)" };
  const phaseOf = dv => { const m = /^([0-9A-Z]{1,2}\d?)\./.exec(dv || ""); return m ? m[1] : ""; };
  const dvLabel = dv => (phaseOf(dv) ? phaseOf(dv) + ". " : "") + W.shortName(dv);
  const catalog = async () => ((await getJSON("config/catalog")) || {}).list || [];
  const staffItems = data => data.staff.map(s => [s.name, s.name]);
  const nextTaskId = p => { let n = (p.tasks || []).length + 1; const ids = new Set((p.tasks || []).map(t => t.id)); while (ids.has("t" + String(n).padStart(3, "0"))) n++; return "t" + String(n).padStart(3, "0"); };
  /* Ngày: dd/mm, dd/mm/yy, dd/mm/yyyy hoặc yyyy-mm-dd → YYYY-MM-DD; sai → null */
  function parseDate(t) {
    t = String(t).trim();
    let y, m, d, r;
    if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) [y, m, d] = [+r[1], +r[2], +r[3]];
    else if ((r = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(t))) { d = +r[1]; m = +r[2]; y = r[3] ? (r[3].length === 2 ? 2000 + +r[3] : +r[3]) : new Date().getFullYear(); }
    else return null;
    const x = new Date(y, m - 1, d);
    if (x.getFullYear() !== y || x.getMonth() !== m - 1 || x.getDate() !== d) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  /* Dự án người này quản lý được, dự án mình là TM/SE lên đầu */
  const manageable = (user, data) => data.projects.filter(p => canManage(user, p))
    .map((p, i) => [p, i]).sort((a, b) => (assigned(b[0], user.staff_name) - assigned(a[0], user.staff_name)) || a[1] - b[1]).map(x => x[0]);
  const viewBtns = id => [[rbtn("📁 Xem dự án", "duanp", { id }), rbtn("➕ Thêm đầu việc", "themviecP", { id })]];
  const pickStaff = (s, pre, label) => ({ text: pre + `Chọn <b>${label}</b>:`, kb: [...pickList(s, staffItems(s.data), "sf", 2), skipRow(s)] });

  /* ---------- /themduan ---------- */
  const projectFlow = {
    title: () => "Xác nhận tạo dự án mới",
    next: d => !d.name ? "name" : !d.type ? "type" : d.owner === undefined ? "owner" : d.se === undefined ? "se" : "confirm",
    card(s) {
      const d = s.d, n = d.type ? s.cat.filter(c => c.type === d.type && !/Việc khác/.test(c.name)).length : 0;
      return [d.name && `📁 <b>${h(d.name)}</b>`, d.type && `Loại: ${h(d.type)} – sẽ tạo sẵn <b>${n}</b> đầu việc theo quy trình chuẩn`,
        d.owner !== undefined && `TM (phụ trách): ${h(d.owner || "–")}`, d.se !== undefined && `SE: ${h(d.se || "–")}`].filter(Boolean).join("\n");
    },
    view(s, pre) {
      switch (s.step) {
        case "name": return { text: pre + "Gõ <b>tên dự án / gói thầu / tư vấn</b>:", kb: [cancelRow(s)] };
        case "type": return { text: pre + "Chọn <b>loại dự án</b> (quyết định quy trình đầu việc):", kb: [W.C.TYPES.map((t, i) => btn(s, t, "ty", i)), cancelRow(s)] };
        case "owner": return pickStaff(s, pre, "TM – người phụ trách");
        case "se": return pickStaff(s, pre, "SE");
      }
    },
    async onPick(chatId, s, act, arg) {
      if (act === "ty") s.d.type = W.C.TYPES[Number(arg)];
      else if (act === "sf") s.d[s.step] = s.opts[Number(arg)] || "";
      else return false;
      await core.goNext(chatId, s); return true;
    },
    onText(s, text) {
      if (s.step !== "name") return undefined;
      const v = text.trim();
      if (v.length < 2 || v.length > 200) return "Tên dự án 2–200 ký tự. Gõ lại:";
      s.d.name = v; return null;
    },
    editFields: () => [["Tên", "name"], ["Loại", "type"], ["TM", "owner"], ["SE", "se"]],
    async commit(s) {
      const d = s.d, projects = (await ctx.store.getDocs("projects")).map(r => JSON.parse(r.body));
      let id = "p-" + core.slug(d.name);
      if (await ctx.store.getDoc("projects/" + id)) id += "-" + Math.random().toString(36).slice(2, 5);
      const tasks = s.cat.filter(c => c.type === d.type && !/Việc khác/.test(c.name)).map((c, i) => ({ id: "t" + String(i + 1).padStart(3, "0"), dv: c.name, detail: "",
        owners: d.owner ? [d.owner] : [], collabs: [], deadline: null, qm: null, pt: null, pr: "P2", init: { status: "", ms: null, nn: "" }, note: "", eval: {} }));
      const order = Math.max(0, ...projects.map(q => q.order || 0)) + 1;
      const body = { id, name: d.name, type: d.type, owners: d.owner ? [d.owner] : [], ses: d.se ? [d.se] : [], milestones: "", progress: "", situation: "", proposal: "", difficulty: 1, order, tasks };
      const err = await ctx.saveDoc(s.user, "projects", id, body);
      if (err) return { error: err.error };
      return { text: `✅ <b>Đã tạo dự án</b> ${h(d.name)} với ${tasks.length} đầu việc – đã có trên web.\nNhập deadline, quy mô, người thực hiện cho từng đầu việc trên web (Kế hoạch dự án) hoặc thêm đầu việc bằng /themviec.`, kb: viewBtns(id) };
    },
  };
  async function cmdThemDuan(chatId, user) {
    if (!isFull(user)) return tg.send(chatId, "Chỉ trưởng phòng/phó phòng tạo được dự án mới (giống trên web).");
    const s = core.startFlow(chatId, user, await core.loadData(), "project");
    s.cat = await catalog();
    await core.goNext(chatId, s, "send");
  }

  /* ---------- /themviec ---------- */
  const taskFlow = {
    title: () => "Xác nhận thêm đầu việc",
    next: d => !d.projectId ? "project" : !d.dv ? "dv" : d.collab === undefined ? "collab" : d.deadline === undefined ? "deadline" : !d.qm ? "qm" : !d.pr ? "pr" : "confirm",
    card(s) {
      const d = s.d, p = d.projectId && s.data.pById.get(d.projectId);
      return [p && `📁 <b>${h(p.name)}</b>`, d.dv && `📌 ${h(dvLabel(d.dv))}`, p && d.dv && `Phụ trách (TM): ${h(W.pOwners(p).join(", ") || "–")}`,
        d.collab !== undefined && `Thực hiện: ${h(d.collab || "–")}`, d.deadline !== undefined && `Deadline: ${d.deadline ? dm(d.deadline) + "/" + d.deadline.slice(0, 4) : "–"}`,
        d.qm && `Quy mô: ${d.qm} (${QM_HINT[d.qm]})`, d.pr && `Ưu tiên: ${d.pr}`].filter(Boolean).join("\n");
    },
    view(s, pre) {
      const d = s.d;
      switch (s.step) {
        case "project": {
          const list = manageable(s.user, s.data);
          if (!list.length) return { text: "Bạn chưa quản lý dự án nào (cần là trưởng phòng, người tạo, hoặc TM/SE của dự án).", kb: [cancelRow(s)] };
          return { text: `<b>Thêm đầu việc</b>\nChọn <b>dự án</b> (${list.length}):`, kb: [...pickList(s, list.map(p => [p.name, p.id]), "p"), cancelRow(s)] };
        }
        case "dv": {
          const p = s.data.pById.get(d.projectId), items = s.cat.filter(c => c.type === p.type);
          if (!items.length) return { text: pre + `Chưa có đầu việc chuẩn nào cho loại “${h(p.type)}” (Cài đặt → Quy trình). Thêm trên web.`, kb: [cancelRow(s)] };
          return { text: pre + `Chọn <b>đầu việc</b> theo quy trình ${h(p.type)} (${items.length}):`, kb: [...pickList(s, items.map(c => [dvLabel(c.name), c.name]), "dv"), cancelRow(s)] };
        }
        case "collab": return pickStaff(s, pre, "người thực hiện (được giao làm)");
        case "deadline": return { text: pre + "Gõ <b>deadline theo HĐ</b> (vd <code>30/11</code> hoặc <code>30/11/2026</code>), hoặc Bỏ qua:", kb: [skipRow(s)] };
        case "qm": {
          const c = s.cat.find(x => x.name === d.dv) || {};
          return { text: pre + "Chọn <b>quy mô</b>:" + (c.qm ? `\n<i>Danh mục chuẩn gợi ý: ${c.qm}</i>` : ""), kb: [...[1, 2, 3, 4, 5].map(n => [btn(s, `${n === c.qm ? "✓ " : ""}${n} · ${QM_HINT[n]}`, "qm", n)]), cancelRow(s)] };
        }
        case "pr": return { text: pre + "Chọn <b>ưu tiên</b>:", kb: [["P1", "P2", "P3", "P4"].map(x => btn(s, x === "P2" ? "P2 (mặc định)" : x, "pr", x)), cancelRow(s)] };
      }
    },
    async onPick(chatId, s, act, arg) {
      const d = s.d, num = Number(arg);
      if (act === "p") { const id = s.opts[num]; if (!id) return true; if (id !== d.projectId) delete d.dv; d.projectId = id; }
      else if (act === "dv") d.dv = s.opts[num];
      else if (act === "sf") d.collab = s.opts[num] || "";
      else if (act === "qm") d.qm = num;
      else if (act === "pr") d.pr = arg;
      else return false;
      await core.goNext(chatId, s); return true;
    },
    onText(s, text) {
      if (s.step !== "deadline") return undefined;
      const v = parseDate(text);
      if (!v) return "Ngày không đúng. Gõ dạng 30/11 hoặc 30/11/2026:";
      s.d.deadline = v; return null;
    },
    editFields: s => [...(s.fixedProject ? [] : [["Dự án", "projectId"]]), ["Đầu việc", "dv"], ["Thực hiện", "collab"], ["Deadline", "deadline"], ["Quy mô", "qm"], ["Ưu tiên", "pr"]],
    clear(s, key) { if (key === "projectId") { delete s.d.projectId; delete s.d.dv; } else delete s.d[key]; },
    async commit(s) {
      const d = s.d, p = await getJSON("projects/" + d.projectId);
      if (!p) return { error: "Dự án không còn tồn tại." };
      if (!canManage(s.user, p)) return { error: "Bạn không có quyền thêm đầu việc vào dự án này." };
      const task = { id: nextTaskId(p), dv: d.dv, detail: "", owners: W.pOwners(p), collabs: d.collab ? [d.collab] : [], deadline: d.deadline || null, qm: d.qm, pt: null, pr: d.pr,
        init: { status: "", ms: null, nn: "" }, note: "", eval: {}, updatedAt: Date.now() };
      const err = await ctx.saveDoc(s.user, "projects", p.id, { ...p, tasks: [...(p.tasks || []), task] });
      if (err) return { error: err.error };
      return { text: `✅ <b>Đã thêm đầu việc</b> vào ${h(p.name)}:\n📌 ${h(dvLabel(d.dv))}` + (d.collab ? `\nĐã báo cho ${h(d.collab)} (nếu đã liên kết Telegram).` : ""), kb: viewBtns(p.id) };
    },
  };
  async function startTask(chatId, user, projectId) {
    const data = await core.loadData();
    if (projectId) { const p = data.pById.get(projectId); if (!p || !canManage(user, p)) return tg.send(chatId, "Bạn không có quyền thêm đầu việc vào dự án này."); }
    const s = core.startFlow(chatId, user, data, "task", projectId ? { projectId } : {});
    s.cat = await catalog(); s.fixedProject = !!projectId;
    await core.goNext(chatId, s, "send");
  }

  /* ---------- /tinhhinh ---------- */
  const situationFlow = {
    title: () => "Xác nhận cập nhật dự án",
    next: d => !d.projectId ? "project" : !d.field ? "field" : d.text === undefined ? "text" : "confirm",
    card(s) {
      const d = s.d, p = d.projectId && s.data.pById.get(d.projectId);
      return [p && `📁 <b>${h(p.name)}</b>`, d.field && `Mục: <b>${FIELDS[d.field]}</b>`, d.text !== undefined && `Nội dung mới:\n${h(d.text || "(để trống)")}`].filter(Boolean).join("\n");
    },
    view(s, pre) {
      const d = s.d;
      switch (s.step) {
        case "project": {
          const list = manageable(s.user, s.data);
          if (!list.length) return { text: "Bạn chưa quản lý dự án nào (cần là trưởng phòng, người tạo, hoặc TM/SE của dự án).", kb: [cancelRow(s)] };
          return { text: `<b>Cập nhật dự án</b>\nChọn <b>dự án</b> (${list.length}):`, kb: [...pickList(s, list.map(p => [p.name, p.id]), "p"), cancelRow(s)] };
        }
        case "field": return { text: pre + "Cập nhật mục nào?", kb: [...Object.entries(FIELDS).map(([k, v]) => [btn(s, v, "f", k)]), cancelRow(s)] };
        case "text": {
          const cur = s.data.pById.get(d.projectId)[d.field] || "";
          return { text: pre + `<b>Nội dung hiện tại:</b>\n${cur ? h(cut(cur, 2500)) : "<i>(trống)</i>"}\n\nGõ <b>nội dung mới</b> (sẽ thay thế toàn bộ – có thể copy nội dung cũ để sửa), hoặc “Để trống” để xoá:`,
            kb: [[btn(s, "Để trống", "skip"), btn(s, "✖ Huỷ", "cancel")]] };
        }
      }
    },
    async onPick(chatId, s, act, arg) {
      if (act === "p") { const id = s.opts[Number(arg)]; if (!id) return true; s.d.projectId = id; }
      else if (act === "f" && FIELDS[arg]) s.d.field = arg;
      else return false;
      await core.goNext(chatId, s); return true;
    },
    onText(s, text) { if (s.step !== "text") return undefined; s.d.text = text.slice(0, 4000); return null; },
    editFields: s => [...(s.fixedProject ? [] : [["Dự án", "projectId"]]), ["Mục", "field"], ["Nội dung", "text"]],
    async commit(s) {
      const d = s.d, p = await getJSON("projects/" + d.projectId);
      if (!p) return { error: "Dự án không còn tồn tại." };
      if (!canManage(s.user, p)) return { error: "Bạn không có quyền sửa dự án này." };
      const err = await ctx.saveDoc(s.user, "projects", p.id, { ...p, [d.field]: d.text || "" });
      if (err) return { error: err.error };
      return { text: `✅ <b>Đã cập nhật</b> “${FIELDS[d.field]}” của ${h(p.name)} – đã có trên web.`, kb: [[rbtn("📁 Xem dự án", "duanp", { id: p.id })]] };
    },
  };
  async function startSituation(chatId, user, projectId) {
    const data = await core.loadData();
    if (projectId) { const p = data.pById.get(projectId); if (!p || !canManage(user, p)) return tg.send(chatId, "Bạn không có quyền sửa dự án này."); }
    const s = core.startFlow(chatId, user, data, "situation", projectId ? { projectId } : {});
    s.fixedProject = !!projectId;
    await core.goNext(chatId, s, "send");
  }

  return {
    flows: { project: projectFlow, task: taskFlow, situation: situationFlow },
    commands: [
      { name: "themduan", desc: "Thêm dự án mới", full: true, run: cmdThemDuan },
      { name: "themviec", desc: "Thêm đầu việc vào dự án", run: (c, u) => startTask(c, u) },
      { name: "tinhhinh", desc: "Cập nhật tình hình / tiến độ dự án", run: (c, u) => startSituation(c, u) },
    ],
    handlers: { themviecP: (c, u, a) => startTask(c, u, a.id), tinhhinhP: (c, u, a) => startSituation(c, u, a.id) },
    statics: {},
    parseDate,
  };
};
