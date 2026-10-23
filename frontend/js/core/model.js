"use strict";
/* Mô hình tính toán (M): workload, trạng thái hiện tại, tiến độ, cảnh báo – tính lại mỗi lần vẽ */
/* ================= derived model ================= */
let M = null;
function derive(){
  const today = todayISO(), thisMon = mondayOf(today);
  const staff = S.staff.map(s => ({...s, cap: 40}));
  const capOf = new Map(staff.map(s => [s.name, s.cap]));
  const projects = [...S.projects].sort((a,b)=>(a.order??999)-(b.order??999) || a.name.localeCompare(b.name,"vi"));
  const pById = new Map(projects.map(p => [p.id, p]));
  const taskMap = new Map();
  for(const p of projects) for(const t of (p.tasks||[])) taskMap.set(p.id+"|"+t.id, {p, t});
  // weekly entries flat
  const entries = [];
  for(const w of S.weeks) for(const e of (w.entries||[])){
    let ref = taskMap.get(e.projectId+"|"+e.taskId);
    const p = pById.get(e.projectId);
    // Việc chung do người nhập đặt tên, không cần tạo task trong kế hoạch/cài đặt.
    if(p?.type==="Nội bộ" && e.taskName) ref = {p, t:{id:e.taskId, dv:e.taskName, pt:e.pt}};
    /* Tải tuần bằng giờ thực hiện. Dòng cũ thiếu giờ dùng ước lượng Quy mô; độ phức tạp chỉ tham khảo. */
    const wl = e.hours!=null ? Math.round(e.hours*10)/10 : wlOf(e.qm, e.pt);
    entries.push({...e, week:w.week, person:w.person, docId:w._id, ref, wl, type: ref ? ref.p.type : (pById.get(e.projectId)||{}).type || "Nội bộ"});
  }
  // latest per task
  const latest = new Map(), doneWk = new Map();
  for(const e of entries){
    const k = e.projectId+"|"+e.taskId;
    if(e.status){ const cur = latest.get(k); if(statusEntryIsNewer(e,cur)) latest.set(k, e); }
    if(e.status==="Hoàn thành"){ const d=doneWk.get(k); if(!d || e.week<d) doneWk.set(k, e.week); }
  }
  const lastAny = new Map();
  for(const e of entries){ const k=e.projectId+"|"+e.taskId; const cur=lastAny.get(k); if(!cur || (e.updatedAt||statusUpdateTime(e))>(cur.updatedAt||statusUpdateTime(cur))) lastAny.set(k,e); }
  /* Những ai thực sự đang làm một đầu việc: gộp người được phân công sẵn (t.collab) với những người đã
     nhập việc đó trong "Nhập theo tuần" ở TUẦN GẦN NHẤT có dữ liệu (không tính mọi tuần từ trước tới giờ –
     nếu không, một người chỉ cần từng nhập 1 lần duy nhất trong quá khứ sẽ dính mãi vào cột này dù không
     còn liên quan). Nếu 2 người cùng nhập đầu việc đó trong cùng tuần gần nhất, cả 2 đều hiện ra. */
  const entriesByTask = new Map();
  for(const e of entries){ const k=e.projectId+"|"+e.taskId; if(!entriesByTask.has(k)) entriesByTask.set(k, []); entriesByTask.get(k).push(e); }
  const doersByTask = new Map();
  for(const [k, es] of entriesByTask){
    const lastWk = es.reduce((a,e)=>!a||e.week>a?e.week:a, null);
    doersByTask.set(k, new Set(es.filter(e=>e.week===lastWk).map(e=>e.person)));
  }
  // tasks enriched
  const tasks = [];
  for(const p of projects){
    p._tasks = (p.tasks||[]).map(t => {
      const k = p.id+"|"+t.id;
      const qm = t.qm, pt = t.pt;
      /* Ước lượng kế hoạch theo Quy mô, không nhân hệ số độ phức tạp. */
      const wl = wlOf(qm, pt);
      const le = latest.get(k), la = lastAny.get(k);
      const fromProject = projectStatusIsLatest(t,le);
      const status = fromProject ? (t.init?.status||"Chưa bắt đầu") : le.status;
      const src = fromProject ? (t.init?.source==="excel"?"Nhập Excel":"Cập nhật dự án") : "Tuần "+isoWeek(le.week);
      const ms = !fromProject ? (le.ms ?? null) : (t.init?.ms ?? null);
      const nn = !fromProject ? (le.nn||"") : (t.init?.nn||"");
      const upd = la ? [la.work, la.note].filter(Boolean).join(" · ") : "";
      /* Vướng mắc của NGƯỜI LÀM, tách riêng khỏi "Ghi chú của trưởng phòng" (t.note, trường gốc trên task) –
         lấy từ lượt nhập tuần gần nhất (la.note), dùng cho cột "Vướng mắc" ở Báo cáo dự án (reports.js),
         không lẫn với t.note ("Hướng giải quyết"). Chưa có lượt nhập tuần nào thì dùng vướng mắc ban đầu
         t.init.note (trường tuỳ chọn, chỉ có ở đầu việc nhập từ Excel – plan-import.js), cùng nguyên tắc
         với t.init.status/ms/nn ngay phía trên. */
      const lastNote = la ? (la.note||"") : ((t.init && t.init.note) || "");
      /* "Ngày cập nhật": tuần/ngày nhân viên lưu lần gần nhất, tách riêng khỏi nội dung "Cập nhật" ở trên */
      /* Ngày cập nhật = mốc gần nhất giữa lần nhập theo tuần và lần trưởng phòng/TM/SE sửa trực tiếp đầu việc ở Kế hoạch dự án */
      const weekDate = la ? new Date(la.updatedAt||statusUpdateTime(la)) : null;
      const editDate = t.updatedAt ? new Date(t.updatedAt) : null;
      const latestDate = weekDate && editDate ? (weekDate >= editDate ? weekDate : editDate) : (weekDate || editDate);
      const updDate = latestDate ? dmy(iso(latestDate)) : "";
      const lastWeek = la ? la.week : null;
      const doerSet = new Set(doersByTask.get(k) || []);
      for(const n of tCollabs(t)) doerSet.add(n);
      const doers = [...doerSet].sort((a,b)=>a.localeCompare(b,"vi"));
      const projectStatusDate = t.init?.statusUpdatedAt ? iso(new Date(t.init.statusUpdatedAt)) : null;
      const completedOn = status==="Hoàn thành" ? ((fromProject?t.init?.completedOn:le.completedOn)||null) : null;
      const done = status==="Hoàn thành" ? (completedOn?mondayOf(completedOn):fromProject && projectStatusDate ? mondayOf(projectStatusDate) : (doneWk.get(k)||null)) : null;
      const completion = status==="Hoàn thành" ? completionTiming(completedOn,t.deadline) : null;
      const ontime = completion?.days!=null ? completion.days>=0 : null;
      const warns = [];
      if(p.type!=="Nội bộ"){
        if(!tOwners(t).length) warns.push(["bad","Chưa có người phụ trách"]);
        if(OPEN.has(status) && t.deadline && t.deadline < today) warns.push(["bad","Quá hạn"]);
        if(OPEN.has(status) && t.deadline && t.deadline >= today && days(today,t.deadline) <= 14) warns.push(["warn","Sắp đến hạn"]);
        if(OPEN.has(status) && (ms||0) >= 3) warns.push(["bad","Ma sát cao"]);
        const activityDay = fromProject && projectStatusDate ? projectStatusDate : (la?.updatedAt ? iso(new Date(la.updatedAt)) : lastWeek);
        if((status==="Đang làm"||status==="Đang vướng") && (!activityDay || activityDay < addDays(thisMon,-14))) warns.push(["warn","Không cập nhật >2 tuần"]);
      }
      const o = {...t, p, key:k, qmE:qm, ptE:pt, wl, status, src, ms, nn, upd, lastNote, updDate, lastWeek, doers, done, completedOn, completion, ontime, warns, phase: phaseOf(t.dv)};
      tasks.push(o); return o;
    });
    const live = p._tasks.filter(t => t.status!=="Hủy");
    /* Mỗi đầu việc có trọng số bằng nhau, bỏ đầu việc Hủy; Quy mô cũ không ảnh hưởng tiến độ. */
    const tot = live.length, dn = live.filter(t=>t.status==="Hoàn thành").length;
    p._prog = tot ? dn/tot : null;
    /* Cờ hoàn thành dựa vào trạng thái, không phụ thuộc giá trị làm tròn của thanh tiến độ. */
    p._allDone = live.length>0 && live.every(t=>t.status==="Hoàn thành");
    const nexts = p._tasks.filter(t=>OPEN.has(t.status) && t.deadline && t.deadline>=today).map(t=>t.deadline).sort();
    p._next = nexts[0] || null;
    p._late = p._tasks.filter(t=>t.warns.some(w=>w[1]==="Quá hạn")).length;
    p._soon = p._tasks.filter(t=>t.warns.some(w=>w[1]==="Sắp đến hạn")).length;
    p._stuck = p._tasks.filter(t=>OPEN.has(t.status) && (t.status==="Đang vướng" || (t.ms||0)>=1)).length;
    p._maxms = Math.max(0, ...p._tasks.filter(t=>OPEN.has(t.status)).map(t=>t.ms||0));
    // phases
    const phs = phasesFor(p.type);
    p._phases = phs.map(ph => {
      const ts = live.filter(t => t.phase===ph.code);
      const tt = ts.length, d = ts.filter(t=>t.status==="Hoàn thành").length;
      return {...ph, n: ts.length, v: ts.length ? d/tt : null};
    });
  }
  return {today, thisMon, staff, capOf, projects, pById, taskMap, entries, tasks};
}
/* Đầu việc quá hạn toàn phòng (không tính dự án Nội bộ) – dùng chung cho Dashboard và chuông thông báo ở
   header. lateTasks() sắp theo độ gấp: Ưu tiên (P1 trước) rồi tới hạn chót (quá hạn lâu nhất lên đầu). */
function lateTaskCount(){ return lateTasks().length; }
function lateTasks(){
  const prRank = {P1:1, P2:2, P3:3, P4:4};
  return M.tasks.filter(t=>t.p.type!=="Nội bộ" && t.warns.some(w=>w[1]==="Quá hạn"))
    .sort((a,b)=>(prRank[a.pr]||9)-(prRank[b.pr]||9) || String(a.deadline||"9999").localeCompare(String(b.deadline||"9999")));
}
/* Vướng mắc TRONG TUẦN HIỆN TẠI (dùng riêng cho chuông thông báo ở header) – lấy thẳng từ lượt nhập
   "Nhập theo tuần" của đúng tuần này (M.entries, e.ms), KHÔNG lấy theo t.ms/t.nn của đầu việc (giá trị
   "mới nhất tính tới hiện tại" dùng chung cho Kế hoạch dự án/Tổng quan dự án – có thể đến từ một tuần cũ
   hơn nhiều). Sắp theo cấp độ ma sát cao nhất lên đầu. Nhân viên chỉ thấy vướng mắc của chính mình
   (so theo S.me, gắn với tài khoản); trưởng phòng/phó phòng/admin (S.canEdit) thấy của mọi người. */
function weekIssues(){
  const w = mondayOf(todayISO());
  let list = M.entries.filter(e=>e.week===w && e.ref && e.ref.p.type!=="Nội bộ" && (e.ms||0)>=1);
  if(!S.canEdit) list = list.filter(e=>e.person===S.me);
  return list.sort((a,b)=>(b.ms||0)-(a.ms||0));
}
function phasesFor(type){
  const seen = new Map();
  for(const c of S.catalog){
    if(c.type!==type) continue;
    const code = phaseOf(c.name); if(!code) continue;
    if(/^(10|T9|V9|N1)$/.test(code)) continue;
    if(!seen.has(code)){ const nm = (c.name.split("–")[0]||"").replace(/^[0-9A-Z]{1,2}\d?\.\s*/,"").trim(); seen.set(code, {code, name:nm}); }
  }
  return [...seen.values()];
}
