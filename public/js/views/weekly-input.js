"use strict";
/* Màn hình: weekly input */
/* ================= VIEW: weekly input ================= */
function viewInput(){
  const w = S.week;
  let h = `<div class="head"><div><h1>Nhập theo tuần</h1><div class="sub">Mỗi đầu việc làm trong tuần là một dòng · trạng thái cuối tuần tự cập nhật về kế hoạch dự án</div></div>${weekNav()}</div>`;
  if(!S.me && S.user && S.user.role!=="admin") return h + `<section class="panel"><div class="empty"><b>Tài khoản chưa gắn với nhân sự</b>Nhờ trưởng phòng vào Cài đặt → Tài khoản đăng nhập để gắn tài khoản của bạn với tên nhân sự.</div></section>`;
  if(!S.me) return h + `<section class="panel"><div class="empty"><b>Chọn tên của bạn</b>Chọn tên ở mục “Tôi là” (góc dưới thanh bên) để nhập công việc của mình.</div>
    <div class="panel-b" style="text-align:center"><select class="inp" style="max-width:280px" data-act="pickme"><option value="">— chọn tên —</option>${M.staff.map(s=>`<option>${esc(s.name)}</option>`).join("")}</select></div></section>`;
  const st = M.staff.find(s=>s.name===S.me) || {cap:0};
  const L = loadFor(S.me, w); const u = st.cap ? L.wl/st.cap : null;
  const prev = weekDoc(addDays(w,-7), S.me);
  const canCopy = prev && (prev.entries||[]).some(e=>!["Hoàn thành","Hủy"].includes(e.status));
  h += `<section class="panel" style="margin-bottom:18px"><div class="panel-b me-sum">
    <div><div class="small muted">Người nhập</div><div style="font-weight:700; font-size:17px">${esc(S.me)}</div></div>
    <div><div class="small muted">Workload tuần</div><div style="font-weight:700; font-size:17px">${fmt1(L.wl)} <span class="muted small">/ ${fmt1(st.cap)} điểm</span></div></div>
    <div><div class="small muted">Mức sử dụng</div><div style="font-weight:700; font-size:17px; color:${u>1?"var(--bad)":u>=.8?"var(--warn)":"var(--ok)"}">${L.es.length?pct(u):"–"}</div></div>
    <div class="toolbar" style="margin-left:auto"><button class="btn" data-act="copyprev" ${canCopy?"":"disabled"} title="${canCopy?"Chép các việc chưa xong của tuần trước":"Tuần trước không có việc dở dang"}">Chép việc dở dang từ tuần trước</button>
    <button class="btn primary" data-act="addentry">+ Thêm việc</button></div></div></section>`;
  if(!L.es.length) return h + `<section class="panel"><div class="empty"><b>Chưa có việc nào trong tuần ${isoWeek(w)}</b>Thêm việc bạn làm trong tuần, hoặc chép các việc dở dang từ tuần trước.</div></section>`;
  const rows = L.es.map(e => `<tr class="click" data-act="editentry" data-id="${esc(e.id)}" tabindex="0">
    <td><div class="small muted">${esc((M.pById.get(e.projectId)||{}).name||"(dự án đã xoá)")}</div><div class="cell-main">${esc(e.ref?e.ref.t.dv:"(đầu việc đã xoá)")}</div></td>
    <td>${e.work?esc(e.work):'<span class="muted">–</span>'}</td>
    <td class="num">${e.qm?e.qm:'<span class="pill bad">Chấm quy mô</span>'}</td><td class="num">${e.wl!=null?e.wl:"–"}</td>
    <td>${e.status?stPill(e.status):'<span class="pill warn">Chọn trạng thái</span>'}</td>
    <td>${e.ms!=null&&e.ms!==""?`<span class="pill ${e.ms>=3?"bad":e.ms>=1?"warn":"mute"}">${e.ms}</span>`:""} ${esc(e.nn||"")}</td>
    <td class="small">${esc(e.note||"")}</td></tr>`).join("");
  return h + `<section class="panel tbl-wrap"><table><thead><tr><th>Dự án / đầu việc</th><th>Việc đã làm</th><th class="num">Quy mô</th><th class="num">Workload</th><th>Trạng thái cuối tuần</th><th>Ma sát</th><th>Vướng / cần hỗ trợ</th></tr></thead><tbody>${rows}</tbody></table></section>
    <p class="small muted">Bấm vào một dòng để sửa hoặc xoá.</p>`;
}
function entryForm(entry){
  const isNew = !entry;
  const e = entry ? {...entry} : {id:uid("e"), projectId:"", taskId:"", work:"", qm:null, pt:null, status:"", ms:null, nn:"", note:""};
  const projOpts = M.projects.filter(p=>(p.tasks||[]).length).map(p=>[p.id, p.name]);
  const taskOpts = pid => { const p=M.pById.get(pid); return p ? p._tasks.filter(t=>t.status!=="Hủy").map(t=>[t.id, t.dv + (t.status==="Hoàn thành"?" (đã xong)":"")]) : []; };
  openForm({
    title: isNew ? "Thêm việc trong tuần" : "Sửa việc trong tuần",
    subtitle: `${S.me} · tuần ${isoWeek(S.week)} (${dm(S.week)} – ${dm(addDays(S.week,6))})`,
    values: e,
    fields: [
      {key:"projectId", label:"Dự án", type:"select", options:projOpts, required:true, onChange:(v,f)=>{ f.setOptions("taskId", taskOpts(v)); }},
      {key:"taskId", label:"Đầu việc (theo kế hoạch của dự án)", type:"select", options:taskOpts(e.projectId), required:true},
      {key:"work", label:"Việc đã làm trong tuần", type:"textarea"},
      {key:"qm", label:"Quy mô phần việc trong tuần", type:"seg", options:[1,2,3,4,5].map(n=>[n,String(n)]), hint:v=>v?QM_HINT[v]:"1 = 0,5–2h · 2 = 2–8h · 3 = 8–24h · 4 = trên 24h · 5 = cả tuần", required:true},
      {key:"pt", label:"Độ phức tạp (để trống = theo kế hoạch)", type:"seg", options:[[null,"Theo kế hoạch"],...[1,2,3,4,5].map(n=>[n,String(n)])], hint:v=>v?PT_HINT[v]:""},
      {key:"status", label:"Trạng thái cuối tuần", type:"seg", options:ST_WEEK.map(s=>[s,s])},
      {key:"ms", label:"Ma sát (chỉ khi bị vướng)", type:"seg", options:[[null,"Không"],...[1,2,3,4,5].map(n=>[n,String(n)])], hint:v=>({1:"Vướng nhẹ",2:"Vướng vừa",3:"Vướng nhiều",4:"Phụ thuộc nghiêm trọng",5:"Bị đình trệ"}[v]||"")},
      {key:"nn", label:"Nguyên nhân", type:"select", options:[["",""],...CAUSES.map(c=>[c,c])]},
      {key:"note", label:"Vướng mắc / cần ai hỗ trợ", type:"textarea"}
    ],
    saveLabel: isNew ? "Thêm việc" : "Lưu thay đổi",
    onSave: async v => {
      const doc = weekDoc(S.week, S.me); const list = doc ? [...(doc.entries||[])] : [];
      const i = list.findIndex(x=>x.id===v.id); const clean = {id:v.id, projectId:v.projectId, taskId:v.taskId, work:v.work||"", qm:v.qm||null, pt:v.pt||null, status:v.status||"", ms:v.ms??null, nn:v.nn||"", note:v.note||""};
      if(i>=0) list[i]=clean; else list.push(clean);
      await saveWeek(S.week, S.me, list); toast(isNew?"Đã thêm việc":"Đã lưu thay đổi");
    },
    onDelete: isNew ? null : async () => {
      const doc = weekDoc(S.week, S.me); const list = (doc.entries||[]).filter(x=>x.id!==e.id);
      await saveWeek(S.week, S.me, list); toast("Đã xoá việc");
    }
  });
}
async function copyPrev(){
  const prev = weekDoc(addDays(S.week,-7), S.me); if(!prev) return;
  const doc = weekDoc(S.week, S.me); const list = doc ? [...(doc.entries||[])] : [];
  const have = new Set(list.map(x=>x.projectId+"|"+x.taskId));
  let n=0;
  for(const e of prev.entries||[]){
    if(["Hoàn thành","Hủy"].includes(e.status) || have.has(e.projectId+"|"+e.taskId)) continue;
    list.push({id:uid("e"), projectId:e.projectId, taskId:e.taskId, work:"", qm:e.qm||null, pt:e.pt||null, status:"", ms:null, nn:"", note:""}); n++;
  }
  if(!n){ toast("Không có việc nào cần chép."); return; }
  await saveWeek(S.week, S.me, list); toast(`Đã chép ${n} việc – hãy cập nhật quy mô và trạng thái.`);
}


VIEW_RENDER.input = viewInput;
