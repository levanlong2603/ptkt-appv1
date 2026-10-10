"use strict";
/* Xử lý bấm nút chung (data-act) – module mới nên dùng ACTIONS thay vì sửa file này */
/* ================= events ================= */
const main = document.getElementById("main");
main.addEventListener("click", e => {
  const t = e.target.closest("[data-act]"); if(!t) return;
  const a = t.dataset.act;
  if(ACTIONS[a]){ ACTIONS[a](t, e); return; }
  if(a==="exnav"){ S.week = shiftAnchor(S.week, S.period||"week", +t.dataset.d); render(); return; }
  if(a==="exper"){ S.period = t.dataset.k; render(); return; }
  if(a==="expr"){ S.exPr = t.dataset.p; render(); return; }
  if(a==="golo"){ S.view="load"; store("view","load"); render(); return; }
  if(a==="godash"){ S.view="dash"; store("view","dash"); render(); return; }
  if(a==="exgo"){
    const g = t.dataset.go;
    let pid = null, tid = null;
    if(g.startsWith("load:")){ S.me = decodeURIComponent(g.slice(5)); store("me", S.me); S.view = "load"; }
    else if(g==="load"){ S.view = "load"; }
    else if(g.startsWith("task:")){ [pid, tid] = g.slice(5).split("|"); S.view = "plan"; S.planSel = pid; S.typeFilter = "Tất cả"; }
    else { S.view = "plan"; S.planSel = g.slice(2); S.typeFilter = "Tất cả"; }
    store("view", S.view); document.body.classList.remove("present");
    if(document.fullscreenElement) document.exitFullscreen().catch(()=>{});
    render();
    /* "task:" → mở thẳng đầu việc cần can thiệp, không chỉ mở dự án rồi để tự tìm (taskForm tự chuyển
       sang xem-only nếu tài khoản không có quyền sửa, xem canManageProject() trong plan.js) */
    if(pid && tid){ const p = M.pById.get(pid); const tk = p && p._tasks.find(x=>x.id===tid); if(p && tk) taskForm(p, tk); }
    return;
  }
  if(a==="present"){ const on = !document.body.classList.contains("present"); document.body.classList.toggle("present", on);
    try{ if(on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(()=>{}); else if(!on && document.fullscreenElement) document.exitFullscreen().catch(()=>{}); }catch(e){}
    render(); return; }
  if(a==="wk"){ const d=+t.dataset.d; S.week = d===0 ? mondayOf(todayISO()) : addDays(S.week, d); render(); }
  else if(a==="tf"){ S.typeFilter=t.dataset.t; render(); }
  else if(a==="openp"){ S.openProject = S.openProject===t.dataset.id ? null : t.dataset.id; render(); }
  else if(a==="goplan"){ S.planSel=t.dataset.id; S.typeFilter="Tất cả"; S.view="plan"; store("view","plan"); render(); }
  else if(a==="dashtask"){ const p=M.pById.get(t.dataset.pid); const tk=p&&p._tasks.find(x=>x.id===t.dataset.id); if(p&&tk) openInfo(p, tk); }
  else if(a==="addentry") entryForm(null);
  else if(a==="editentry"){ const person=t.dataset.person||S.me; const doc=weekDoc(S.week,person); const en=doc&&(doc.entries||[]).find(x=>x.id===t.dataset.id); if(en) entryForm(en, person); }
  else if(a==="copyprev") copyPrev();
  else if(a==="psel"){ S.planSel = S.planSel===t.dataset.id ? null : t.dataset.id; render(); }
  else if(a==="newp") projectForm(null);
  else if(a==="editp") projectForm(M.pById.get(S.planSel));
  else if(a==="addtask") taskForm(M.pById.get(S.planSel), null);
  else if(a==="delp"){
    const p = M.pById.get(S.planSel);
    if(p && canDeleteProject(p) && confirm(`Xoá dự án “${p.name}” và toàn bộ đầu việc?`)){
      remove("projects/"+p.id); S.planSel=null; toast("Đã xoá dự án");
    }
  }
  else if(a==="task"){ const p=M.pById.get(S.planSel); const tk=p._tasks.find(x=>x.id===t.dataset.id); taskForm(p, tk); }
  else if(a==="addstaff") staffForm(null);
  else if(a==="editstaff") staffForm(+t.dataset.i);
  else if(a==="addcat") catForm(null, t.dataset.t);
  else if(a==="editcat") catForm(+t.dataset.i);
  else if(a==="adduser") userForm(null);
  else if(a==="edituser"){ const u=(S.users||[]).find(x=>String(x.id)===t.dataset.id); if(u) userForm(u); }
  else if(a==="exp-json") exportBackup();
  else if(a==="imp-json") document.getElementById("impFile").click();
});
document.addEventListener("fullscreenchange", () => { if(!document.fullscreenElement && document.body.classList.contains("present")){ document.body.classList.remove("present"); render(); } });
document.addEventListener("keydown", e => { if(e.key==="Escape" && document.body.classList.contains("present") && !document.querySelector(".drawer")){ document.body.classList.remove("present"); render(); } });
main.addEventListener("keydown", e => { if((e.key==="Enter"||e.key===" ") && e.target.matches("[data-act][tabindex]")){ e.preventDefault(); e.target.click(); } });
main.addEventListener("change", e => { if(e.target.id==="impFile" && e.target.files[0]){ importBackup(e.target.files[0]); e.target.value=""; return; } if(e.target.dataset.act==="pickme"){ S.me=e.target.value; store("me",S.me); render(); } });
main.addEventListener("input", e => { if(e.target.dataset.act==="pq"){ S.planQuery=e.target.value; const pos=e.target.selectionStart; render(); const el=main.querySelector('[data-act="pq"]'); if(el){ el.focus(); el.setSelectionRange(pos,pos); } } });
