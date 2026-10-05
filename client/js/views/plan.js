"use strict";
/* Màn hình: plan */
/* ================= VIEW: plan ================= */
function viewPlan(){
  const ps = M.projects;
  if(!S.planSel || !M.pById.get(S.planSel)) S.planSel = ps[0] ? ps[0].id : null;
  const q = S.planQuery.toLowerCase();
  let list = "";
  for(const t of TYPES){
    const g = ps.filter(p=>p.type===t && (!q || p.name.toLowerCase().includes(q)));
    if(!g.length) continue;
    list += `<div class="grp">${typeDot(t)}${t}</div>` + g.map(p=>`<button data-act="psel" data-id="${esc(p.id)}" aria-current="${S.planSel===p.id}"><div class="cell-main">${esc(p.name)}</div><div class="small muted">${pct(p._prog)} · ${(p.tasks||[]).length} đầu việc</div></button>`).join("");
  }
  let h = `<div class="head"><div><h1>Kế hoạch dự án</h1><div class="sub">Toàn bộ đầu việc theo quy trình và deadline hợp đồng · trạng thái tự lấy từ dữ liệu nhập theo tuần</div></div>
    ${S.canEdit?'<button class="btn primary" data-act="newp">+ Dự án mới</button>':""}</div>`;
  const p = M.pById.get(S.planSel);
  let right = "";
  if(!p) right = `<section class="panel"><div class="empty"><b>Chưa có dự án</b>${S.canEdit?"Bấm “+ Dự án mới” để tạo dự án và các đầu việc theo quy trình.":"Trưởng phòng sẽ tạo dự án ở đây."}</div></section>`;
  else {
    right = `<section class="panel" style="margin-bottom:18px"><div class="panel-h"><div><h2>${esc(p.name)}</h2><div class="small muted" style="margin-top:3px">${typeDot(p.type)}${esc(p.type)} · Phụ trách: ${esc(p.owner||"–")}${p.se?" · SE: "+esc(p.se):""}</div></div>
      ${S.canEdit?`<div class="toolbar"><button class="btn" data-act="editp">Sửa thông tin</button><button class="btn primary" data-act="addtask">+ Đầu việc</button></div>`:""}</div>
      <div class="panel-b"><div style="display:grid; grid-template-columns:110px 1fr; gap:18px; align-items:center; margin-bottom:14px">
        <div><div class="pct" style="font-size:26px">${pct(p._prog)}</div><div class="small muted">tiến độ</div></div><div>${strip(p)}<div class="legend" style="margin-top:6px">${p._phases.map(ph=>`<span><b>${esc(ph.code)}</b>${esc(ph.name)}</span>`).join("")}</div></div></div>
        <div class="row2"><div><div class="small muted" style="margin-bottom:4px">Mốc hợp đồng</div><div class="note">${esc(p.milestones||"–")}</div></div>
        <div><div class="small muted" style="margin-bottom:4px">Tình hình / vướng mắc chung</div><div class="note">${esc(p.situation||"–")}</div></div></div></div></section>`;
    const rows = p._tasks.map((t,i)=>`<tr class="click" data-act="task" data-id="${esc(t.id)}" tabindex="0">
      <td class="muted">${i+1}</td>
      <td><div class="cell-main">${esc(t.dv)}</div>${t.detail?`<div class="cell-sub">${esc(t.detail)}</div>`:""}</td>
      <td>${esc(t.owner||"–")}${t.collab?`<div class="small muted">+ ${esc(t.collab)}</div>`:""}</td>
      <td>${t.deadline?dmy(t.deadline):"–"}</td>
      <td class="num">${t.wl??"–"}</td><td>${t.pr?`<span class="pill ${t.pr==="P1"?"bad":"mute"}">${esc(t.pr)}</span>`:""}</td>
      <td>${stPill(t.status)}<div class="small muted">${esc(t.src)}${t.done?" · xong tuần "+isoWeek(t.done):""}</div></td>
      <td class="small">${t.upd?`<div class="cell-sub" style="margin:0">${esc(t.upd)}</div>`:""}${t.ms?`<span class="pill ${t.ms>=3?"bad":"warn"}">Ma sát ${t.ms}</span> `:""}${esc(t.nn||"")}</td>
      <td>${warnPills(t.warns)}${t.ontime===true?' <span class="pill ok">Đúng hạn</span>':t.ontime===false?' <span class="pill bad">Trễ hạn</span>':""}${t.status==="Hoàn thành"&&!(t.eval&&t.eval.dat)&&S.canEdit?' <span class="pill info">Chờ đánh giá</span>':""}</td></tr>`).join("");
    right += `<section class="panel tbl-wrap"><table><thead><tr><th>#</th><th style="min-width:260px">Đầu việc</th><th>Phụ trách</th><th>Deadline HĐ</th><th class="num">WL</th><th>Ưu tiên</th><th>Trạng thái</th><th>Cập nhật mới nhất</th><th>Cảnh báo</th></tr></thead>
      <tbody>${rows||`<tr><td colspan="9"><div class="empty">Dự án chưa có đầu việc.${S.canEdit?" Bấm “+ Đầu việc”.":""}</div></td></tr>`}</tbody></table></section>
      <p class="small muted">Bấm vào một đầu việc để xem chi tiết${S.canEdit?", sửa hoặc đánh giá khi hoàn thành":""}.</p>`;
  }
  return h + `<div class="split"><section class="panel"><div class="panel-b" style="padding-bottom:6px"><input class="inp" type="search" placeholder="Tìm dự án" data-act="pq" value="${esc(S.planQuery)}" aria-label="Tìm dự án"></div><div class="plist">${list||'<div class="empty">Không tìm thấy.</div>'}</div></section><div>${right}</div></div>`;
}
function projectForm(p){
  const isNew = !p;
  const v = p ? {...clean(p)} : {id:"", name:"", type:"Triển khai", owner:"", se:"", milestones:"", situation:"", gen:true};
  const staffOpts = [["",""],...M.staff.map(s=>[s.name,s.name])];
  openForm({
    title: isNew ? "Dự án mới" : "Sửa thông tin dự án", values:v,
    fields:[
      {key:"name", label:"Tên dự án / gói thầu / tư vấn", type:"text", required:true},
      {key:"type", label:"Loại", type:"seg", options:TYPES.map(t=>[t,t]), disabled:!isNew && (p.tasks||[]).length>0, hint:()=>!isNew&&(p.tasks||[]).length?"Không đổi loại khi dự án đã có đầu việc.":"Quyết định quy trình đầu việc áp dụng."},
      {key:"owner", label:"Người phụ trách", type:"select", options:staffOpts},
      {key:"se", label:"SE", type:"select", options:staffOpts},
      {key:"milestones", label:"Mốc hợp đồng / hạn nộp", type:"textarea"},
      {key:"situation", label:"Tình hình / vướng mắc chung", type:"textarea"},
      ...(isNew?[{key:"gen", label:"Tạo sẵn toàn bộ đầu việc theo quy trình của loại này", type:"check"}]:[])
    ],
    saveLabel: isNew ? "Tạo dự án" : "Lưu thay đổi",
    onSave: async x => {
      if(!x.name.trim()) throw new Error("Nhập tên dự án.");
      if(isNew){
        let id = "p-"+slug(x.name); if(M.pById.get(id)) id += "-"+Math.random().toString(36).slice(2,5);
        const tasks = x.gen ? S.catalog.filter(c=>c.type===x.type && !/Việc khác/.test(c.name)).map((c,i)=>({id:"t"+String(i+1).padStart(3,"0"), dv:c.name, detail:"", owner:x.owner||"", collab:"", deadline:null, qm:null, pt:null, pr:"P2", init:{status:"",ms:null,nn:""}, note:"", eval:{}})) : [];
        const order = Math.max(0,...M.projects.map(q=>q.order||0))+1;
        await saveProject({id, name:x.name.trim(), type:x.type, owner:x.owner||"", se:x.se||"", milestones:x.milestones||"", situation:x.situation||"", order, tasks});
        S.planSel = id; toast(`Đã tạo dự án${tasks.length?" với "+tasks.length+" đầu việc":""}`);
      } else {
        await saveProject({...p, name:x.name.trim(), type:x.type, owner:x.owner||"", se:x.se||"", milestones:x.milestones||"", situation:x.situation||""}); toast("Đã lưu thông tin dự án");
      }
    },
    onDelete: isNew ? null : async () => { if(!confirm(`Xoá dự án “${p.name}” và toàn bộ đầu việc?`)) return false; await remove("projects/"+p.id); S.planSel=null; toast("Đã xoá dự án"); }
  });
}
function taskForm(p, t){
  const isNew = !t;
  const raw = t ? (p.tasks||[]).find(x=>x.id===t.id) : null;
  const v = raw ? {...raw, st0:(raw.init||{}).status||"", ms0:(raw.init||{}).ms??null, nn0:(raw.init||{}).nn||"", dat:(raw.eval||{}).dat||"", cl:(raw.eval||{}).cl??null, tc:(raw.eval||{}).tc??null, nx:(raw.eval||{}).nx||""}
    : {id:"", dv:"", detail:"", owner:p.owner||"", collab:"", deadline:null, qm:null, pt:null, pr:"P2", st0:"", ms0:null, nn0:"", note:""};
  const dvOpts = S.catalog.filter(c=>c.type===p.type).map(c=>[c.name,c.name]);
  const staffOpts = [["",""],...M.staff.map(s=>[s.name,s.name])];
  if(!S.canEdit){ return openInfo(p, t); }
  const cOf = n => S.catalog.find(c=>c.name===n)||{};
  openForm({
    title: isNew ? "Thêm đầu việc" : "Đầu việc", subtitle: p.name, values:v,
    info: t ? `<div class="kv" style="margin-bottom:16px"><dt>Trạng thái hiện tại</dt><dd>${stPill(t.status)} <span class="muted small">${esc(t.src)}</span></dd>
      <dt>Cập nhật mới nhất</dt><dd>${esc(t.upd||"–")}</dd><dt>Kết quả cần đạt</dt><dd>${esc(cOf(t.dv).result||"–")}</dd><dt>Minh chứng</dt><dd>${esc(cOf(t.dv).evidence||"–")}</dd></div>` : "",
    fields:[
      {key:"dv", label:"Đầu việc (quy trình "+p.type+")", type:"select", options:dvOpts, required:true},
      {key:"detail", label:"Nội dung chi tiết", type:"textarea"},
      {key:"owner", label:"Người phụ trách", type:"select", options:staffOpts, half:true},
      {key:"collab", label:"Người phối hợp", type:"select", options:staffOpts, half:true},
      {key:"deadline", label:"Deadline theo HĐ", type:"date", half:true},
      {key:"pr", label:"Ưu tiên", type:"seg", options:["P1","P2","P3","P4"].map(x=>[x,x]), half:true},
      {key:"qm", label:"Quy mô (trống = chuẩn)", type:"seg", options:[[null,"Chuẩn"],...[1,2,3,4,5].map(n=>[n,String(n)])], hint:(val,vals)=>"Chuẩn: "+(cOf(vals.dv).qm??"–")},
      {key:"pt", label:"Độ phức tạp (trống = chuẩn)", type:"seg", options:[[null,"Chuẩn"],...[1,2,3,4,5].map(n=>[n,String(n)])], hint:(val,vals)=>"Chuẩn: "+(cOf(vals.dv).pt??"–")},
      {key:"st0", label:"Trạng thái ban đầu (chỉ dùng khi chưa có dữ liệu tuần)", type:"select", options:[["",""],...ST_ALL.map(s=>[s,s])]},
      {key:"note", label:"Ghi chú của trưởng phòng", type:"textarea"},
      ...(t && t.status==="Hoàn thành" ? [
        {heading:"Đánh giá khi hoàn thành"},
        {key:"dat", label:"Đạt yêu cầu?", type:"seg", options:[["Đạt","Đạt"],["Đạt một phần","Đạt một phần"],["Không đạt","Không đạt"]]},
        {key:"cl", label:"Chất lượng (1–5)", type:"seg", options:[1,2,3,4,5].map(n=>[n,String(n)]), half:true},
        {key:"tc", label:"Mức độ tự chủ (1–5)", type:"seg", options:[1,2,3,4,5].map(n=>[n,String(n)]), half:true},
        {key:"nx", label:"Nhận xét / đóng góp", type:"textarea"}] : [])
    ],
    saveLabel: isNew ? "Thêm đầu việc" : "Lưu thay đổi",
    onSave: async x => {
      const tasks = [...(p.tasks||[])];
      const body = {id: x.id || nextTaskId(p), dv:x.dv, detail:x.detail||"", owner:x.owner||"", collab:x.collab||"", deadline:x.deadline||null, qm:x.qm||null, pt:x.pt||null, pr:x.pr||"",
        init:{status:x.st0||"", ms:x.ms0??null, nn:x.nn0||""}, note:x.note||"", eval: raw&&raw.eval ? {...raw.eval} : {}};
      if(t && t.status==="Hoàn thành") body.eval = {dat:x.dat||"", cl:x.cl??null, tc:x.tc??null, nx:x.nx||""};
      const i = tasks.findIndex(q=>q.id===body.id); if(i>=0) tasks[i]=body; else tasks.push(body);
      await saveProject({...p, tasks}); toast(isNew?"Đã thêm đầu việc":"Đã lưu đầu việc");
    },
    onDelete: isNew ? null : async () => { if(!confirm("Xoá đầu việc này?")) return false; await saveProject({...p, tasks:(p.tasks||[]).filter(q=>q.id!==t.id)}); toast("Đã xoá đầu việc"); }
  });
}
function nextTaskId(p){ let n=(p.tasks||[]).length+1; const ids=new Set((p.tasks||[]).map(t=>t.id)); while(ids.has("t"+String(n).padStart(3,"0"))) n++; return "t"+String(n).padStart(3,"0"); }
function openInfo(p, t){
  const c = S.catalog.find(x=>x.name===t.dv)||{};
  openForm({title:"Đầu việc", subtitle:p.name, values:{}, fields:[], readOnly:true,
    info:`<h3 style="margin-bottom:12px">${esc(t.dv)}</h3><div class="kv"><dt>Nội dung</dt><dd>${esc(t.detail||"–")}</dd><dt>Phụ trách</dt><dd>${esc(t.owner||"–")}</dd>
    <dt>Deadline HĐ</dt><dd>${dmy(t.deadline)}</dd><dt>Trạng thái</dt><dd>${stPill(t.status)} <span class="small muted">${esc(t.src)}</span></dd><dt>Cập nhật</dt><dd>${esc(t.upd||"–")}</dd>
    <dt>Kết quả cần đạt</dt><dd>${esc(c.result||"–")}</dd><dt>Minh chứng</dt><dd>${esc(c.evidence||"–")}</dd><dt>Workload</dt><dd>${t.wl??"–"}</dd></div>`});
}


VIEW_RENDER.plan = viewPlan;
