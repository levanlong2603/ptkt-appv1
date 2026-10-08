"use strict";
/* Màn hình: plan */
/* ================= VIEW: plan ================= */
/* Trưởng phòng sửa mọi dự án. Nhân viên sửa dự án do mình tạo, hoặc dự án mình là TM (phụ trách)/SE – kể cả thêm/sửa/xoá đầu việc.
   Xoá cả dự án thì chặt hơn: chỉ người tạo hoặc trưởng phòng, xem canDeleteProject bên dưới. */
function canManageProject(p){ return !!p && (S.canEdit || (!!S.user && (p.created_by === S.user.username || projectAssigned(p, S.user.staff_name)))); }
function canDeleteProject(p){ return !!p && (S.canEdit || (!!S.user && p.created_by === S.user.username)); }
function viewPlan(){
  /* Góc nhìn theo "Tôi là": chọn một người (kể cả khi tài khoản là trưởng phòng) thì chỉ thấy dự án
     người đó là TM (phụ trách) hoặc SE. Chọn "Tất cả" (chỉ trưởng phòng chọn được) hoặc chưa gắn với
     ai thì thấy mọi dự án. Muốn xem toàn bộ dự án của phòng mà không đổi "Tôi là" thì vào Tổng quan dự án. */
  const ps = (!S.me || S.me==="__all__") ? M.projects : M.projects.filter(p=>projectAssigned(p, S.me));
  const filt = S.typeFilter || "Tất cả";
  const q = S.planQuery.toLowerCase();
  const pool = ps.filter(p=>planMatchFilter(p, filt) && (!q || p.name.toLowerCase().includes(q)))
    .sort((a,b)=>(b._stuck-a._stuck) || (b._late-a._late) || a.name.localeCompare(b.name,"vi"));
  /* Lọc "Đang triển khai": chỉ tự mở dự án vướng nhiều nhất một lần đầu tiên; sau đó tôn trọng việc đóng/mở thủ công,
     kể cả khi rời trang rồi quay lại (không tự mở lại mỗi lần vẽ lại trang) */
  S.planAutoOpened = S.planAutoOpened || {};
  if(filt==="Đang triển khai" && pool.length && !S.planAutoOpened[filt]){
    if(!pool.some(p=>p.id===S.planSel)) S.planSel = pool[0].id;
    S.planAutoOpened[filt] = true;
  }
  const chips = `<div class="chips" role="group" aria-label="Lọc dự án">${PLAN_FILTERS.map(f=>`<button class="chip-btn" data-act="tf" data-t="${esc(f.key)}" aria-pressed="${filt===f.key}">${esc(f.label)}</button>`).join("")}</div>`;
  let h = `<div class="head"><div><h1>Kế hoạch dự án</h1><div class="sub">Toàn bộ đầu việc theo quy trình và deadline hợp đồng · trạng thái tự lấy từ dữ liệu nhập theo tuần</div></div>
    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap">${chips}
      <input class="inp" type="search" placeholder="Tìm dự án" style="width:180px" data-act="pq" value="${esc(S.planQuery)}" aria-label="Tìm dự án">
      ${S.canEdit?'<button class="btn primary" data-act="newp">+ Dự án mới</button>':""}</div></div>`;
  let body = "";
  for(const t of TYPES){
    const g = pool.filter(p=>p.type===t);
    if(!g.length) continue;
    body += `<section class="panel" style="margin-bottom:18px"><div class="panel-h"><h2>${typeDot(t)}${t} <span class="muted small">· ${g.length}</span></h2></div>`;
    for(const p of g){
      const open = S.planSel===p.id;
      body += `<div class="prow" data-act="psel" data-id="${esc(p.id)}" role="button" tabindex="0" aria-expanded="${open}">
        <div><div class="nm">${esc(p.name)}</div><div class="ow">${esc(p.owner||"Chưa có người phụ trách")}</div></div>
        <div><div class="pct">${pct(p._prog)}</div><div class="pbar"><i style="width:${Math.round((p._prog||0)*100)}%"></i></div></div>
        <div class="next small"><div class="muted">Mốc tiếp theo</div><div style="font-weight:600">${p._next?dmy(p._next):"–"}</div></div>
        <div class="strip-cell">${strip(p)}</div>
        <div class="badges">${p._late?`<span class="pill bad">${p._late} quá hạn</span>`:""}${p._stuck?`<span class="pill warn">${p._stuck} vướng</span>`:""}${p._soon?`<span class="pill info">${p._soon} sắp hạn</span>`:""}${!(p.tasks||[]).length?'<span class="pill mute">Chưa có đầu việc</span>':!p._late&&!p._stuck&&!p._soon?'<span class="pill ok">Đúng tiến độ</span>':""}</div>
      </div>`;
      if(open) body += planDetail(p);
    }
    body += `</section>`;
  }
  if(!body) body = `<section class="panel"><div class="empty"><b>${ps.length?"Không có dự án nào trong bộ lọc này":"Chưa có dự án"}</b>${!ps.length ? (S.canEdit?`“${esc(S.me)}” chưa được gán làm TM hoặc SE của dự án nào. Đổi “Tôi là” thành “— Tất cả —” để xem hết, hoặc bấm “+ Dự án mới” để tạo.`:"Bạn chưa được gán làm TM hoặc SE của dự án nào. Xem toàn bộ dự án (chỉ xem) ở mục Tổng quan dự án.") : ""}</div></section>`;
  return h + body;
}
/* Bảng đầu việc đầy đủ, xổ ra ngay dưới dòng dự án khi bấm vào (giống cách mở rộng ở Tổng quan dự án) */
function planDetail(p){
  let out = `<div class="pdetail">
    <div class="row2" style="margin:12px 0 14px"><div><div class="small muted" style="margin-bottom:4px">Mốc hợp đồng</div><div class="note">${esc(p.milestones||"–")}</div></div>
      <div><div class="small muted" style="margin-bottom:4px">Tình hình / vướng mắc chung</div><div class="note">${esc(p.situation||"–")}</div></div></div>
    ${canManageProject(p)?`<div class="toolbar" style="margin-bottom:12px">${canDeleteProject(p)?`<button class="btn danger" data-act="delp" data-id="${esc(p.id)}">Xoá dự án</button>`:""}<button class="btn" data-act="editp" data-id="${esc(p.id)}">Sửa thông tin</button><button class="btn primary" data-act="addtask" data-id="${esc(p.id)}">+ Đầu việc</button></div>`:""}`;
  const rows = planTreeRows(p);
  out += `<div class="tbl-wrap panel"><table style="table-layout:fixed"><thead><tr><th style="width:26%">Đầu việc</th><th style="width:11%">Phụ trách</th><th style="width:9%">Deadline HĐ</th><th style="width:6%; text-align:center">WL</th><th style="width:8%; text-align:center">Ưu tiên</th><th style="width:12%">Trạng thái</th><th style="width:16%">Cập nhật mới nhất</th><th style="width:12%">Cảnh báo</th></tr></thead>
    <tbody>${rows||`<tr><td colspan="8"><div class="empty">Dự án chưa có đầu việc.${canManageProject(p)?" Bấm “+ Đầu việc”.":""}</div></td></tr>`}</tbody></table></div>
    <p class="small muted" style="margin:8px 0 0">Bấm vào một đầu việc để xem chi tiết${S.canEdit?", sửa hoặc đánh giá khi hoàn thành":""}.</p></div>`;
  return out;
}
/* ----- Cây đầu việc: hạng mục (theo mã đầu việc) → nhánh con (tuỳ chọn) → đầu việc ----- */
/* Trạng thái gấp/mở chỉ lưu trong bộ nhớ trang */
/* Mặc định đóng hết; bấm dòng để mở, trạng thái được nhớ trong phiên */
function planOpen(key, def=false){ const tg = S.planTog||{}; return key in tg ? tg[key] : def; }
function planStat(ts){
  const live = ts.filter(t=>t.status!=="Hủy"), done = live.filter(t=>t.status==="Hoàn thành");
  const tw = live.reduce((a,t)=>a+(t.wl||0),0), dw = done.reduce((a,t)=>a+(t.wl||0),0);
  return {n:live.length, d:done.length, v: tw ? dw/tw : (live.length ? done.length/live.length : null)};
}
/* Tên đầu việc trong cây bỏ phần "mã. hạng mục –" vì dòng cha đã hiện */
function planShortName(dv){ return (dv||"").replace(/^[0-9A-Z]{1,2}\d?\.\s*[^–]*–\s*/, ""); }
function planTaskRow(t, i, lvl=1){
  const idle = t.status==="Chưa bắt đầu";
  return `<tr class="click${idle?" tr-idle":""}" data-act="task" data-id="${esc(t.id)}" tabindex="0" title="${esc(t.dv)}">
      <td style="padding-left:${10+lvl*32}px"><div class="cell-main">${esc(planShortName(t.dv))}</div>${t.detail&&!idle?`<div class="cell-sub">${esc(t.detail)}</div>`:""}${t.note?`<div class="cell-sub" style="color:var(--teal)">Ghi chú TrP: ${esc(t.note)}</div>`:""}</td>
      <td>${esc(t.owner||"–")}${t.collab?`<div class="small muted">+ ${esc(t.collab)}</div>`:""}</td>
      <td>${t.deadline?dmy(t.deadline):"–"}</td>
      <td style="text-align:center">${t.wl??"–"}</td><td style="text-align:center">${t.pr?`<span class="pill ${t.pr==="P1"?"bad":"mute"}">${esc(t.pr)}</span>`:""}</td>
      <td>${stPill(t.status)}${t.done?`<div class="small muted">xong tuần ${isoWeek(t.done)}</div>`:""}</td>
      <td class="small">${t.upd?`<div class="cell-sub" style="margin:0">${esc(t.upd)}</div>`:""}${t.ms?`<span class="pill ${t.ms>=3?"bad":"warn"}">Ma sát ${t.ms}</span> `:""}${esc(t.nn||"")}</td>
      <td>${warnPills(t.warns)}${t.ontime===true?' <span class="pill ok">Đúng hạn</span>':t.ontime===false?' <span class="pill bad">Trễ hạn</span>':""}${t.status==="Hoàn thành"&&!(t.eval&&t.eval.dat)&&S.canEdit?' <span class="pill info">Chờ đánh giá</span>':""}</td></tr>`;
}
/* st: {n,d,v} để tính tiến độ, hoặc {meta} để ghi chú tuỳ ý (không có thanh tiến độ khi v=null) */
function planGroupRow(key, lvl, title, st, open, extra, cols=9){
  const meta = st.meta ?? `${st.d}/${st.n} hoàn thành · ${pct(st.v)}`;
  const bar = st.v==null ? "" : `<div class="pbar"><i style="width:${Math.round(st.v*100)}%"></i></div>`;
  return `<tr class="grp-row lvl${lvl}" data-act="tgl" data-key="${esc(key)}" tabindex="0" aria-expanded="${open}">
    <td colspan="${cols}"><div style="display:flex; align-items:center; gap:12px; padding-left:${lvl*22}px">
      <span aria-hidden="true" style="width:14px">${open?"▾":"▸"}</span>
      <div style="flex:1; min-width:0"><b>${esc(title)}</b> <span class="small muted">· ${esc(meta)}</span>${bar}</div>${extra}</div></td></tr>`;
}
/* Bảng cây đầu việc dùng chung: o.scope tách trạng thái gấp/mở, o.row dựng dòng, o.cols số cột, o.edit cho phép thêm nhánh con */
function planTreeRows(p, o={}){
  const scope = o.scope||"plan", cols = o.cols||8, rowFn = o.row||planTaskRow;
  const order = new Map(p._phases.map((ph,i)=>[ph.code,i]));
  const groups = new Map();
  const grp = code => { if(!groups.has(code)) groups.set(code, {code, name:"", tasks:[], subs:new Map()}); return groups.get(code); };
  for(const ph of p._phases) grp(ph.code).name = ph.name;
  for(const s of (p.subs||[])) grp(s.phase||"").subs.set(s.name, true);
  for(const t of p._tasks) grp(t.phase||"").tasks.push(t);
  const sorted = [...groups.values()].sort((a,b)=>(order.get(a.code)??999)-(order.get(b.code)??999) || a.code.localeCompare(b.code));
  let out = "", i = 0;
  for(const g of sorted){
    const gk = scope+"|grp:"+g.code, open = planOpen(gk);
    out += planGroupRow(gk, 0, (g.code?g.code+". ":"")+(g.name||"Khác"), planStat(g.tasks), open, "", cols);
    if(!open) continue;
    for(const t of g.tasks.filter(t=>!(t.sub && g.subs.has(t.sub)))) out += rowFn(t, ++i, 1);
    for(const name of g.subs.keys()){
      const ts = g.tasks.filter(t=>t.sub===name), key = scope+"|sub:"+g.code+"|"+name, o2 = planOpen(key);
      out += planGroupRow(key, 1, name, planStat(ts), o2, "", cols);
      if(o2) for(const t of ts) out += rowFn(t, ++i, 2);
    }
  }
  return out;
}
/* Bấm dòng hạng mục/nhánh: đảo trạng thái đang hiển thị (aria-expanded) và ghi nhớ trong phiên */
ACTIONS["tgl"] = el => { S.planTog = S.planTog || {}; S.planTog[el.dataset.key] = el.getAttribute("aria-expanded")!=="true"; render(); };
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
    onDelete: (isNew || !canDeleteProject(p)) ? null : async () => { if(!confirm(`Xoá dự án “${p.name}” và toàn bộ đầu việc?`)) return false; await remove("projects/"+p.id); S.planSel=null; toast("Đã xoá dự án"); }
  });
}
function taskForm(p, t){
  const isNew = !t;
  const raw = t ? (p.tasks||[]).find(x=>x.id===t.id) : null;
  const v = raw ? {...raw, st0:(raw.init||{}).status||"", ms0:(raw.init||{}).ms??null, nn0:(raw.init||{}).nn||"", dat:(raw.eval||{}).dat||"", cl:(raw.eval||{}).cl??null, tc:(raw.eval||{}).tc??null, nx:(raw.eval||{}).nx||""}
    : {id:"", dv:"", detail:"", owner:p.owner||"", collab:"", deadline:null, qm:null, pt:null, pr:"P2", st0:"", ms0:null, nn0:"", note:""};
  /* Gom theo hạng mục bằng optgroup, bỏ phần "mã. hạng mục –" lặp lại trong tên hiển thị – giống ô chọn ở Nhập theo tuần */
  const dvOpts = (() => {
    const items = S.catalog.filter(c=>c.type===p.type);
    const phs = phasesFor(p.type), order = new Map(phs.map((ph,i)=>[ph.code,i]));
    const groups = new Map();
    for(const c of items){
      const code = phaseOf(c.name);
      if(!groups.has(code)) groups.set(code, {code, name:(phs.find(ph=>ph.code===code)||{}).name||"", items:[]});
      groups.get(code).items.push(c);
    }
    return [...groups.values()].sort((a,b)=>(order.get(a.code)??999)-(order.get(b.code)??999) || a.code.localeCompare(b.code))
      .map(g => ({group:(g.code?g.code+". ":"")+(g.name||"Khác"), options:g.items.map(c=>[c.name, planShortName(c.name)])}));
  })();
  const staffOpts = [["",""],...M.staff.map(s=>[s.name,s.name])];
  if(!canManageProject(p)){ if(isNew){ toast("Chỉ trưởng phòng hoặc người tạo dự án mới thêm đầu việc."); return; } return openInfo(p, t); }
  const cOf = n => S.catalog.find(c=>c.name===n)||{};
  openForm({
    title: isNew ? "Thêm đầu việc" : "Đầu việc", subtitle: p.name, values:v,
    info: t ? `<div class="kv" style="margin-bottom:16px"><dt>Trạng thái hiện tại</dt><dd>${stPill(t.status)}</dd>
      <dt>Cập nhật mới nhất</dt><dd>${esc(t.upd||"–")}</dd><dt>Ngày cập nhật</dt><dd>${esc(t.updDate||"–")}</dd><dt>Kết quả đầu ra</dt><dd>${esc(cOf(t.dv).result||"–")}</dd><dt>Minh chứng</dt><dd>${esc(cOf(t.dv).evidence||"–")}</dd></div>` : "",
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
      /* Chỉ trưởng phòng đánh giá khi hoàn thành, không phải nhân viên (kể cả TM/SE/người tạo được sửa đầu việc) */
      ...(t && t.status==="Hoàn thành" && S.canEdit ? [
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
        init:{status:x.st0||"", ms:x.ms0??null, nn:x.nn0||""}, note:x.note||"", eval: raw&&raw.eval ? {...raw.eval} : {}, updatedAt:Date.now()};
      if(t && t.status==="Hoàn thành" && S.canEdit) body.eval = {dat:x.dat||"", cl:x.cl??null, tc:x.tc??null, nx:x.nx||""};
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
    <dt>Deadline HĐ</dt><dd>${dmy(t.deadline)}</dd><dt>Trạng thái</dt><dd>${stPill(t.status)}</dd><dt>Cập nhật</dt><dd>${esc(t.upd||"–")}</dd><dt>Ngày cập nhật</dt><dd>${esc(t.updDate||"–")}</dd>
    <dt>Kết quả đầu ra</dt><dd>${esc(c.result||"–")}</dd><dt>Workload</dt><dd>${t.wl??"–"}</dd>
    <dt>Ghi chú TrP</dt><dd>${esc(t.note||"–")}</dd></div>`});
}


VIEW_RENDER.plan = viewPlan;
