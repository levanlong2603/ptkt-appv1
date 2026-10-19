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
  if(a==="exrefresh"){ render(); toast("Đã làm mới"); return; }
  if(a==="expr"){ S.exPr = t.dataset.p; render(); return; }
  if(a==="golo"){ S.view="input"; S.weekTab="load"; store("view","input"); render(); return; }
  if(a==="godash"){ S.view="dash"; S.openProject=null; store("view","dash"); render(); return; }
  if(a==="wk"){ const d=+t.dataset.d; S.week = d===0 ? mondayOf(todayISO()) : addDays(S.week, d); render(); }
  else if(a==="tf"){ S.typeFilter=t.dataset.t; render(); }
  else if(a==="openp"){ S.openProject = t.dataset.id; render(); main.scrollTop = 0; }
  else if(a==="addentry") entryForm(null);
  else if(a==="editentry"){ const person=t.dataset.person||S.me; const doc=weekDoc(S.week,person); const en=doc&&(doc.entries||[]).find(x=>x.id===t.dataset.id); if(en) entryForm(en, person); }
  else if(a==="copyprev") copyPrev();
  else if(a==="psel"){ S.planSel = S.planSel===t.dataset.id ? null : t.dataset.id; render(); }
  else if(a==="newp") projectForm(null);
  /* editp/addtask/delp/task lấy dự án từ chính phần tử được bấm (data-id / data-pid), không đọc S.planSel:
     khối planDetail() hiện ở cả tab Kế hoạch dự án lẫn trang riêng của dự án (S.openProject). */
  else if(a==="editp") projectForm(M.pById.get(t.dataset.id));
  else if(a==="addtask") taskForm(M.pById.get(t.dataset.id), null);
  else if(a==="delp"){
    const p = M.pById.get(t.dataset.id);
    if(p && canDeleteProject(p) && confirm(`Xoá dự án “${p.name}” và toàn bộ đầu việc?`)){
      remove("projects/"+p.id); S.planSel=null; S.openProject=null; toast("Đã xoá dự án");
    }
  }
  else if(a==="task"){ const p=M.pById.get(t.dataset.pid); const tk=p&&p._tasks.find(x=>x.id===t.dataset.id); if(tk) taskForm(p, tk); }
  else if(a==="addstaff") staffForm(null);
  else if(a==="editstaff") staffForm(+t.dataset.i);
  else if(a==="addcat") catForm(null, t.dataset.t);
  else if(a==="editcat") catForm(+t.dataset.i);
  else if(a==="adduser") userForm(null);
  else if(a==="edituser"){ const u=(S.users||[]).find(x=>String(x.id)===t.dataset.id); if(u) userForm(u); }
  else if(a==="exp-json") exportBackup();
  else if(a==="imp-json") document.getElementById("impFile").click();
});
main.addEventListener("keydown", e => { if((e.key==="Enter"||e.key===" ") && e.target.matches("[data-act][tabindex]")){ e.preventDefault(); e.target.click(); } });
main.addEventListener("change", e => { if(e.target.id==="impFile" && e.target.files[0]){ importBackup(e.target.files[0]); e.target.value=""; return; } if(e.target.dataset.act==="pickme"){ S.me=e.target.value; store("me",S.me);
    /* Đổi "Tôi là" thì đồng bộ luôn ô "Nhân sự" ở Báo cáo tuần (nếu đã từng mở Báo cáo trong phiên này) –
       giống đúng cách Dashboard/Tổng quan dự án/Tải tuần tự thu hẹp theo "Tôi là" (effectiveSimAs()), tránh
       phải tự chọn lại 2 nơi. Chỉ set khi S.rp đã có (rpInit() đã chạy) – reports.js nạp sau nên không gọi
       rpInit() thẳng ở đây được. */
    if(S.rp) S.rp.wkStaff = (S.me && S.me!=="__all__") ? S.me : "__all__";
    render(); } else if(e.target.dataset.act==="scopemode"){ S.scopeMode=e.target.value; render(); } });
main.addEventListener("input", e => {
  const a = e.target.dataset.act;
  if(a==="pq"){ S.planQuery=e.target.value; const pos=e.target.selectionStart; render(); const el=main.querySelector('[data-act="pq"]'); if(el){ el.focus(); el.setSelectionRange(pos,pos); } }
  else if(a==="exq"){ S.exQ=e.target.value; const pos=e.target.selectionStart; render(); const el=main.querySelector('[data-act="exq"]'); if(el){ el.focus(); el.setSelectionRange(pos,pos); } }
  else if(a==="dashq"){ S.dashQuery=e.target.value; const pos=e.target.selectionStart; render(); const el=main.querySelector('[data-act="dashq"]'); if(el){ el.focus(); el.setSelectionRange(pos,pos); } }
});
