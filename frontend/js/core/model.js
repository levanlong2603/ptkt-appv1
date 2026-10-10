"use strict";
/* Mô hình tính toán (M): workload, trạng thái hiện tại, tiến độ, cảnh báo – tính lại mỗi lần vẽ */
/* ================= derived model ================= */
let M = null;
function derive(){
  const today = todayISO(), thisMon = mondayOf(today);
  const staff = S.staff.map(s => ({...s, cap: Math.round((+s.hours||0)*(1-(+s.pct||0))*(+s.factor||1)*10)/10}));
  const capOf = new Map(staff.map(s => [s.name, s.cap]));
  const projects = [...S.projects].sort((a,b)=>(a.order??999)-(b.order??999) || a.name.localeCompare(b.name,"vi"));
  const pById = new Map(projects.map(p => [p.id, p]));
  const taskMap = new Map();
  for(const p of projects) for(const t of (p.tasks||[])) taskMap.set(p.id+"|"+t.id, {p, t});
  // weekly entries flat
  const entries = [];
  for(const w of S.weeks) for(const e of (w.entries||[])){
    const ref = taskMap.get(e.projectId+"|"+e.taskId);
    const pt = e.pt || (ref && ref.t.pt) || null;
    /* Từ bản cập nhật "nhập giờ trực tiếp": e.hours (số giờ thực tế đã làm trong tuần, người dùng tự gõ,
       xem entryForm() ở weekly-input.js) là nguồn chính cho workload của một lần nhập tuần – không nhân
       thêm hệ số Độ phức tạp nữa vì đây là giờ thật, không phải giờ quy đổi từ thang Quy mô 1–5.
       e.qm (thang 1–5 cũ) chỉ còn dùng để đọc lại các lượt nhập từ trước khi có e.hours, không hỏi thêm. */
    const wl = e.hours!=null ? e.hours : wlOf(e.qm, pt);
    entries.push({...e, week:w.week, person:w.person, docId:w._id, ref, wl, type: ref ? ref.p.type : (pById.get(e.projectId)||{}).type || "Nội bộ"});
  }
  // latest per task
  const latest = new Map(), doneWk = new Map();
  for(const e of entries){
    const k = e.projectId+"|"+e.taskId;
    if(e.status){ const cur = latest.get(k); if(!cur || e.week > cur.week) latest.set(k, e); }
    if(e.status==="Hoàn thành"){ const d=doneWk.get(k); if(!d || e.week<d) doneWk.set(k, e.week); }
  }
  const lastAny = new Map();
  for(const e of entries){ const k=e.projectId+"|"+e.taskId; const cur=lastAny.get(k); if(!cur || e.week>cur.week) lastAny.set(k,e); }
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
      /* Workload (giờ) = số giờ đại diện của Quy mô × hệ số thời gian của Độ phức tạp (xem wlOf() ở
         constants.js) — không chia cho Hệ số năng lực nữa, vì hệ số đó đã nhân vào Capacity (cap ở trên)
         rồi; chia thêm ở đây sẽ tính hệ số năng lực hai lần.
         "Độ khó dự án" (p.difficulty) chỉ là nhãn phân loại dự án, không tham gia công thức tính tải. */
      const wl = wlOf(qm, pt);
      const le = latest.get(k), la = lastAny.get(k);
      const status = le ? le.status : (t.init && t.init.status) || "Chưa bắt đầu";
      const src = le ? "Tuần "+isoWeek(le.week) : "";
      const ms = le ? (le.ms ?? null) : (t.init ? t.init.ms ?? null : null);
      const nn = le ? (le.nn||"") : (t.init ? t.init.nn||"" : "");
      const upd = la ? [la.work, la.note].filter(Boolean).join(" · ") : "";
      /* "Ngày cập nhật": tuần/ngày nhân viên lưu lần gần nhất, tách riêng khỏi nội dung "Cập nhật" ở trên */
      /* Ngày cập nhật = mốc gần nhất giữa lần nhập theo tuần và lần trưởng phòng/TM/SE sửa trực tiếp đầu việc ở Kế hoạch dự án */
      const weekDate = la ? parse(la.week) : null;
      const editDate = t.updatedAt ? new Date(t.updatedAt) : null;
      const latestDate = weekDate && editDate ? (weekDate >= editDate ? weekDate : editDate) : (weekDate || editDate);
      const updDate = latestDate ? dmy(iso(latestDate)) : "";
      const lastWeek = la ? la.week : null;
      const doerSet = new Set(doersByTask.get(k) || []);
      if(t.collab) doerSet.add(t.collab);
      const doers = [...doerSet].sort((a,b)=>a.localeCompare(b,"vi"));
      const done = status==="Hoàn thành" ? (doneWk.get(k) || null) : null;
      const ontime = done && t.deadline ? (done <= t.deadline) : null;
      const warns = [];
      if(p.type!=="Nội bộ"){
        if(!t.owner) warns.push(["bad","Chưa có người phụ trách"]);
        if(OPEN.has(status) && t.deadline && t.deadline < today) warns.push(["bad","Quá hạn"]);
        if(OPEN.has(status) && t.deadline && t.deadline >= today && days(today,t.deadline) <= 14) warns.push(["warn","Sắp đến hạn"]);
        if(OPEN.has(status) && (ms||0) >= 3) warns.push(["bad","Ma sát cao"]);
        if((status==="Đang làm"||status==="Đang vướng") && (!lastWeek || lastWeek < addDays(thisMon,-14))) warns.push(["warn","Không cập nhật >2 tuần"]);
      }
      const o = {...t, p, key:k, qmE:qm, ptE:pt, wl, status, src, ms, nn, upd, updDate, lastWeek, doers, done, ontime, warns, phase: phaseOf(t.dv)};
      tasks.push(o); return o;
    });
    const live = p._tasks.filter(t => t.status!=="Hủy");
    /* Đầu việc chưa chấm Quy mô (wl=null) vẫn phải có trọng số (mặc định 1) khi tính tiến độ, nếu không
       nó "biến mất" khỏi mẫu số — khiến % tiến độ có thể ra 100% dù đầu việc đó còn dang dở (chỉ cần các
       đầu việc có Quy mô đều đã xong). Áp dụng cùng cách tính này ở p._phases và planStat() (plan.js). */
    const tot = live.reduce((a,t)=>a+(t.wl??1),0), dn = live.filter(t=>t.status==="Hoàn thành").reduce((a,t)=>a+(t.wl??1),0);
    p._prog = tot ? dn/tot : null;
    /* "Đã hoàn thành cả dự án" (planIsDone) không được chỉ dựa vào p._prog===1 — nếu các đầu việc còn mở
       (quá hạn/đang vướng) thiếu Quy mô (wl=null→0), chúng không cộng vào tot, nên dn/tot có thể ra đúng
       1 dù dự án vẫn còn việc chưa xong. Dùng cờ riêng, đếm theo trạng thái từng đầu việc, không theo wl. */
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
      const tt = ts.reduce((a,t)=>a+(t.wl??1),0), d = ts.filter(t=>t.status==="Hoàn thành").reduce((a,t)=>a+(t.wl??1),0);
      return {...ph, n: ts.length, v: ts.length ? d/tt : null};
    });
  }
  return {today, thisMon, staff, capOf, projects, pById, taskMap, entries, tasks};
}
/* Số đầu việc quá hạn toàn phòng (không tính dự án Nội bộ) – dùng chung cho Dashboard và chuông thông báo ở header */
function lateTaskCount(){
  return M.tasks.filter(t=>t.p.type!=="Nội bộ" && t.warns.some(w=>w[1]==="Quá hạn")).length;
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
