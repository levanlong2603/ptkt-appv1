"use strict";
/* Màn hình: weekly input */
/* ================= VIEW: weekly input ================= */
function viewInput(){
  const w = S.week;
  let h = `<div class="head"><div><h1>Nhập theo tuần</h1><div class="sub">Mỗi đầu việc làm trong tuần là một dòng · trạng thái cuối tuần tự cập nhật về kế hoạch dự án</div></div>${weekNav()}</div>`;
  if(S.me==="__all__") return h + viewInputAll(w);
  if(!S.me && S.user && S.user.role!=="admin") return h + `<section class="panel"><div class="empty"><b>Tài khoản chưa gắn với nhân sự</b>Nhờ trưởng phòng vào Cài đặt → Tài khoản đăng nhập để gắn tài khoản của bạn với tên nhân sự.</div></section>`;
  if(!S.me) return h + `<section class="panel"><div class="empty"><b>Chọn tên của bạn</b>Chọn tên ở mục “Tôi là” (góc dưới thanh bên) để nhập công việc của mình.</div>
    <div class="panel-b" style="text-align:center"><select class="inp" style="max-width:280px" data-act="pickme"><option value="__all__">— Tất cả —</option>${M.staff.map(s=>`<option>${esc(s.name)}</option>`).join("")}</select></div></section>`;
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
  return h + `<section class="panel tbl-wrap"><table style="table-layout:fixed"><thead><tr><th style="width:20%">Đầu việc</th><th style="width:20%">Việc đã làm</th><th style="width:8%; text-align:center">Quy mô</th><th style="width:10%; text-align:center">Workload</th><th style="width:14%">Trạng thái cuối tuần</th><th style="width:12%">Ma sát</th><th style="width:16%">Vướng / cần hỗ trợ</th></tr></thead><tbody>${inputTreeRows(L.es)}</tbody></table></section>
    <p class="small muted">Bấm vào một dòng để sửa hoặc xoá.</p>`;
}
/* "Tất cả" (chỉ trưởng phòng): liệt kê gộp việc đã nhập của mọi người trong tuần, gom theo người. Chỉ xem, không sửa ở đây –
   muốn sửa một dòng, chọn đúng tên người đó ở "Tôi là". */
function viewInputAll(w){
  const es = M.entries.filter(e=>e.week===w);
  if(!es.length) return `<section class="panel"><div class="empty"><b>Chưa có ai nhập việc trong tuần ${isoWeek(w)}</b></div></section>`;
  const byPerson = new Map();
  for(const e of es){ if(!byPerson.has(e.person)) byPerson.set(e.person, []); byPerson.get(e.person).push(e); }
  const people = [...byPerson.keys()].sort((a,b)=>a.localeCompare(b,"vi"));
  let rows = "";
  for(const person of people){
    const pes = byPerson.get(person), wl = pes.reduce((a,e)=>a+(e.wl||0),0);
    rows += inputGroupRow(0, person, `${pes.length} đầu việc · ${fmt1(wl)} điểm`, 6);
    for(const e of pes) rows += inputAllRow(e);
  }
  return `<section class="panel tbl-wrap"><table style="table-layout:fixed"><thead><tr><th style="width:30%">Đầu việc</th><th style="width:18%">Việc đã làm</th><th style="width:8%; text-align:center">Quy mô</th><th style="width:10%; text-align:center">Workload</th><th style="width:14%">Trạng thái cuối tuần</th><th style="width:20%">Ma sát / vướng mắc</th></tr></thead><tbody>${rows}</tbody></table></section>
    <p class="small muted">Chỉ xem. Muốn sửa một dòng, chọn đúng tên người đó ở “Tôi là”.</p>`;
}
function inputAllRow(e){
  const name = e.ref ? planShortName(e.ref.t.dv) : "(đầu việc đã xoá)";
  const proj = (M.pById.get(e.projectId)||{}).name || "(dự án đã xoá)";
  return `<tr title="${e.ref?esc(e.ref.t.dv):""}">
    <td style="padding-left:32px"><div class="small muted">${esc(proj)}</div><div class="cell-main">${esc(name)}</div></td>
    <td>${e.work?esc(e.work):'<span class="muted">–</span>'}</td>
    <td style="text-align:center">${e.qm?e.qm:"–"}</td><td style="text-align:center">${e.wl!=null?e.wl:"–"}</td>
    <td>${e.status?stPill(e.status):"–"}</td>
    <td>${e.ms!=null&&e.ms!==""?`<span class="pill ${e.ms>=3?"bad":e.ms>=1?"warn":"mute"}">${e.ms}</span> `:""}${esc(e.nn||"")}${e.note?` · ${esc(e.note)}`:""}</td></tr>`;
}
/* Nhóm các dòng đã nhập theo Dự án → hạng mục (giống cây ở Kế hoạch dự án), gấp/mở được */
/* Màu viền trái theo cấp: đậm dần khi lên cấp cha, để nhìn ra ngay phân cấp mà không cần gấp/mở */
const INPUT_LVL_BORDER = ["var(--teal)", "color-mix(in srgb, var(--teal) 45%, var(--line))", "var(--line)"];
function inputRow(e, lvl=1){
  const name = e.ref ? planShortName(e.ref.t.dv) : "(đầu việc đã xoá)";
  return `<tr class="click" data-act="editentry" data-id="${esc(e.id)}" tabindex="0" title="${e.ref?esc(e.ref.t.dv):""}">
    <td style="padding-left:${10+lvl*22}px; border-left:3px solid ${INPUT_LVL_BORDER[lvl]||INPUT_LVL_BORDER[2]}"><div class="cell-main">${esc(name)}</div></td>
    <td>${e.work?esc(e.work):'<span class="muted">–</span>'}</td>
    <td style="text-align:center">${e.qm?e.qm:'<span class="pill bad">Chấm quy mô</span>'}</td><td style="text-align:center">${e.wl!=null?e.wl:"–"}</td>
    <td>${e.status?stPill(e.status):'<span class="pill warn">Chọn trạng thái</span>'}</td>
    <td>${e.ms!=null&&e.ms!==""?`<span class="pill ${e.ms>=3?"bad":e.ms>=1?"warn":"mute"}">${e.ms}</span>`:""} ${esc(e.nn||"")}</td>
    <td class="small">${esc(e.note||"")}</td></tr>`;
}
/* Dòng nhóm tĩnh (không gấp/mở) cho cây ở Nhập theo tuần – luôn hiện hết vì mỗi tuần thường chỉ có ít việc.
   Dòng dự án chỉ ghi tên (không ghi số đầu việc); số đầu việc chỉ ghi ở dòng hạng mục. */
function inputGroupRow(lvl, title, meta, cols=7){
  const bg = lvl===0 ? "color-mix(in srgb, var(--teal) 14%, var(--surface))" : "color-mix(in srgb, var(--teal) 6%, var(--surface))";
  const text = lvl===0 ? `<span style="font-weight:700; font-size:14.5px">${esc(title)}</span>`
    : `<span style="font-weight:650; color:var(--ink); font-size:13.5px">${esc(title)}</span> <span class="small muted">· ${esc(meta)}</span>`;
  return `<tr><td colspan="${cols}" style="background:${bg}; border-left:4px solid ${INPUT_LVL_BORDER[lvl]}; padding:${lvl?6:10}px 10px ${lvl?6:10}px ${10+lvl*22}px">${text}</td></tr>`;
}
function inputTreeRows(es){
  const byProj = new Map();
  for(const e of es){
    const pid = e.projectId;
    if(!byProj.has(pid)) byProj.set(pid, {pid, name:(M.pById.get(pid)||{}).name||"(dự án đã xoá)", items:[]});
    byProj.get(pid).items.push(e);
  }
  const projects = [...byProj.values()].sort((a,b)=>a.name.localeCompare(b.name,"vi"));
  let out = "";
  for(const g of projects){
    const p = M.pById.get(g.pid);
    out += inputGroupRow(0, g.name, `${g.items.length} đầu việc`);
    const order = p ? new Map(p._phases.map((ph,i)=>[ph.code,i])) : new Map();
    const byPhase = new Map();
    for(const e of g.items){
      const code = e.ref ? phaseOf(e.ref.t.dv) : "";
      if(!byPhase.has(code)) byPhase.set(code, {code, name: p ? ((p._phases.find(ph=>ph.code===code)||{}).name||"") : "", items:[]});
      byPhase.get(code).items.push(e);
    }
    const phases = [...byPhase.values()].sort((a,b)=>(order.get(a.code)??999)-(order.get(b.code)??999) || a.code.localeCompare(b.code));
    for(const ph of phases){
      if(!ph.code){ for(const e of ph.items) out += inputRow(e, 1); continue; } // không rõ hạng mục: hiện thẳng dưới dự án, không bọc "Khác"
      out += inputGroupRow(1, ph.code+". "+(ph.name||"Khác"), `${ph.items.length} đầu việc`);
      for(const e of ph.items) out += inputRow(e, 2);
    }
  }
  return out;
}
function entryForm(entry){
  const isNew = !entry;
  const e = entry ? {...entry} : {id:uid("e"), projectId:"", taskId:"", work:"", qm:null, pt:null, status:"", ms:null, nn:"", note:""};
  /* Nhân viên chỉ chọn được dự án mình là TM/SE, hoặc có đầu việc được giao/phối hợp; trưởng phòng không giới hạn.
     Ẩn dự án đã hoàn thành 100%, trừ khi đó là dự án của dòng đang sửa (giữ lại để không mất dữ liệu) */
  const assigned = p => S.canEdit || projectAssigned(p, S.me) || (p.tasks||[]).some(t=>t.owner===S.me || t.collab===S.me);
  const projOpts = M.projects.filter(p=>(p.tasks||[]).length && (assigned(p) || p.id===e.projectId) && (!planIsDone(p) || p.id===e.projectId)).map(p=>[p.id, p.name+(planIsDone(p)?" (đã hoàn thành)":"")]);
  /* Xem được tất cả đầu việc của dự án (kể cả đã xong/huỷ), gom theo hạng mục */
  const taskOpts = (pid, keepId) => {
    const p = M.pById.get(pid); if(!p) return [];
    const order = new Map(p._phases.map((ph,i)=>[ph.code,i]));
    const groups = new Map();
    for(const t of p._tasks){
      const code = t.phase||"";
      if(!groups.has(code)) groups.set(code, {code, name:(p._phases.find(ph=>ph.code===code)||{}).name||"", items:[]});
      groups.get(code).items.push(t);
    }
    return [...groups.values()].sort((a,b)=>(order.get(a.code)??999)-(order.get(b.code)??999) || a.code.localeCompare(b.code))
      .map(g => ({group:(g.code?g.code+". ":"")+(g.name||"Khác"), options:g.items.map(t=>[t.id, planShortName(t.dv)+(OPEN.has(t.status)?"":" ("+t.status+")")])}));
  };
  openForm({
    title: isNew ? "Thêm việc trong tuần" : "Sửa việc trong tuần",
    subtitle: `${S.me} · tuần ${isoWeek(S.week)} (${dm(S.week)} – ${dm(addDays(S.week,6))})`,
    values: e,
    fields: [
      {key:"projectId", label:"Dự án", type:"select", options:projOpts, required:true, onChange:(v,f)=>{ f.setOptions("taskId", taskOpts(v)); }},
      {key:"taskId", label:"Đầu việc (theo kế hoạch của dự án)", type:"select", options:taskOpts(e.projectId, e.taskId), required:true},
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
      if(list.some(x=>x.id!==v.id && x.projectId===v.projectId && x.taskId===v.taskId))
        throw new Error("Đầu việc này đã có trong tuần. Bấm vào dòng đó trong bảng để sửa thay vì thêm mới.");
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
