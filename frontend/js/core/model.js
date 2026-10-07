"use strict";
/* Mô hình tính toán (M): workload, trạng thái hiện tại, tiến độ, cảnh báo – tính lại mỗi lần vẽ */
/* ================= derived model ================= */
let M = null;
function derive(){
  const today = todayISO(), thisMon = mondayOf(today);
  const cat = new Map(S.catalog.map(c => [c.name, c]));
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
    const c = ref ? cat.get(ref.t.dv) : null;
    const pt = e.pt || (ref && ref.t.pt) || (c && c.pt) || null;
    const wl = e.qm && pt ? e.qm*pt : null;
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
  // tasks enriched
  const tasks = [];
  for(const p of projects){
    p._tasks = (p.tasks||[]).map(t => {
      const k = p.id+"|"+t.id, c = cat.get(t.dv)||{};
      const qm = t.qm || c.qm, pt = t.pt || c.pt;
      const wl = qm && pt ? qm*pt : null;
      const le = latest.get(k), la = lastAny.get(k);
      const status = le ? le.status : (t.init && t.init.status) || "Chưa bắt đầu";
      const src = le ? "Tuần "+isoWeek(le.week) : "";
      const ms = le ? (le.ms ?? null) : (t.init ? t.init.ms ?? null : null);
      const nn = le ? (le.nn||"") : (t.init ? t.init.nn||"" : "");
      const upd = la ? [la.work, la.note].filter(Boolean).join(" · ") : "";
      const lastWeek = la ? la.week : null;
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
      const o = {...t, p, key:k, qmE:qm, ptE:pt, wl, status, src, ms, nn, upd, lastWeek, done, ontime, warns, phase: phaseOf(t.dv)};
      tasks.push(o); return o;
    });
    const live = p._tasks.filter(t => t.status!=="Hủy");
    const tot = live.reduce((a,t)=>a+(t.wl||0),0), dn = live.filter(t=>t.status==="Hoàn thành").reduce((a,t)=>a+(t.wl||0),0);
    p._prog = tot ? dn/tot : null;
    const nexts = p._tasks.filter(t=>OPEN.has(t.status) && t.deadline && t.deadline>=today).map(t=>t.deadline).sort();
    p._next = nexts[0] || null;
    p._late = p._tasks.filter(t=>t.warns.some(w=>w[1]==="Quá hạn")).length;
    p._soon = p._tasks.filter(t=>t.warns.some(w=>w[1]==="Sắp đến hạn")).length;
    p._stuck = p._tasks.filter(t=>OPEN.has(t.status) && (t.status==="Đang vướng" || (t.ms||0)>=1)).length;
    p._maxms = Math.max(0, ...p._tasks.filter(t=>OPEN.has(t.status)).map(t=>t.ms||0));
    // phases
    const phs = phasesFor(p.type, cat);
    p._phases = phs.map(ph => {
      const ts = live.filter(t => t.phase===ph.code);
      const tt = ts.reduce((a,t)=>a+(t.wl||0),0), d = ts.filter(t=>t.status==="Hoàn thành").reduce((a,t)=>a+(t.wl||0),0);
      return {...ph, n: ts.length, v: ts.length ? (tt? d/tt : (ts.every(t=>t.status==="Hoàn thành")?1:0)) : null};
    });
  }
  return {today, thisMon, cat, staff, capOf, projects, pById, taskMap, entries, tasks};
}
function phasesFor(type, cat){
  const seen = new Map();
  for(const c of S.catalog){
    if(c.type!==type) continue;
    const code = phaseOf(c.name); if(!code) continue;
    if(/^(10|T9|V9|N1)$/.test(code)) continue;
    if(!seen.has(code)){ const nm = (c.name.split("–")[0]||"").replace(/^[0-9A-Z]{1,2}\d?\.\s*/,"").trim(); seen.set(code, {code, name:nm}); }
  }
  return [...seen.values()];
}
