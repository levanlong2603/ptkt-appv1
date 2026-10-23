"use strict";
/* Màn hình: plan */
/* ================= VIEW: plan ================= */
/* Trưởng phòng sửa mọi dự án. Nhân viên sửa dự án do mình tạo, hoặc dự án mình là TM (phụ trách)/SE – kể cả thêm/sửa/xoá đầu việc.
   Xoá cả dự án thì chặt hơn: chỉ người tạo hoặc trưởng phòng, xem canDeleteProject bên dưới. */
function canManageProject(p){ return !!p && (S.canEdit || (!!S.user && (p.created_by === S.user.username || projectAssigned(p, S.user.staff_name)))); }
function canDeleteProject(p){ return !!p && (S.canEdit || (!!S.user && p.created_by === S.user.username)); }
/* "Kế hoạch dự án" không còn là tab/màn riêng: đã gộp vào trang "Dự án" (project-overview.js) – danh sách ở viewProject(),
   còn phần kế hoạch là trang riêng của từng dự án (projectPage()) với bảng đầu việc dưới đây. */
/* Bảng đầu việc đầy đủ của 1 dự án – hiện ở trang riêng của dự án (full=true, xem projectPage() ở project-overview.js;
   khung bảng cao gần hết màn hình thay vì 520px – .pdetail.full ở plan.css).
   Khung bảng khoá chiều cao + cuộn riêng cả ngang lẫn dọc (giống bảng Excel/Báo cáo đóng băng tiêu đề),
   không đẩy giãn cả trang nữa; kèm nút thu/phóng (S.planZoom, %) qua CSS zoom – phóng to để đọc dễ hơn ở
   màn hình lớn, thu nhỏ để nhìn được nhiều cột hơn mà không phải cuộn ngang liên tục. */
function planDetail(p, full){
  const zoom = S.planZoom || 100;
  /* 2 ô Mốc hợp đồng + Tình hình chung mặc định ẩn sau nút "Mốc HĐ & tình hình" (S.planNotes, nhớ trong
     phiên) để nhường chiều cao cho bảng – bấm nút mới xổ ra ngay dưới hàng nút. */
  const notesOpen = !!S.planNotes;
  let out = `<div class="pdetail${full?" full":""}">
    <div class="toolbar" style="margin:12px 0; justify-content:space-between">
      <div class="toolbar" style="gap:8px"><button class="btn" type="button" data-act="plannotes" aria-expanded="${notesOpen}" title="Mốc hợp đồng và tình hình / vướng mắc chung của dự án">Mốc HĐ &amp; tình hình ${notesOpen?"▴":"▾"}</button>${canManageProject(p)?`${canDeleteProject(p)?`<button class="btn danger" data-act="delp" data-id="${esc(p.id)}">Xoá dự án</button>`:""}<button class="btn" data-act="editp" data-id="${esc(p.id)}">Sửa thông tin</button><button class="btn primary" data-act="addtask" data-id="${esc(p.id)}">+ Đầu việc</button>`:""}</div>
      <div class="plan-zoom">
        <button type="button" data-act="planzoom" data-d="-10" title="Thu nhỏ" aria-label="Thu nhỏ">−</button>
        <span class="plan-zoom-lb">${zoom}%</span>
        <button type="button" data-act="planzoom" data-d="10" title="Phóng to" aria-label="Phóng to">+</button>
      </div>
    </div>
    ${notesOpen?`<div class="row2" style="margin:0 0 14px"><div><div class="small muted" style="margin-bottom:4px">Mốc hợp đồng</div><div class="note">${esc(p.milestones||"–")}</div></div>
      <div><div class="small muted" style="margin-bottom:4px">Tình hình / vướng mắc chung</div><div class="note">${esc(p.situation||"–")}</div></div></div>`:""}`;
  const rows = planReportRows(p);
  out += `<div class="plan-tbl-scroll"><div class="rp-sec rp-sec-grn" style="zoom:${zoom}%"><div class="tbl-wrap"><table class="plan-report-tbl" style="table-layout:fixed">
      <thead><tr><th style="width:7%">Hạng mục</th><th style="width:11%">Đầu việc</th><th style="width:5%; text-align:center">Ưu tiên</th><th style="width:8%">Phụ trách</th><th style="width:8%">Thực hiện</th><th style="width:16%">Chi tiết thực hiện</th>
        <th style="width:8%">Deadline theo HĐ</th><th style="width:8%">Trạng thái thực hiện</th><th style="width:11%">Vướng mắc</th><th style="width:10%">Hướng giải quyết</th>
        <th style="width:8%">Cảnh báo</th></tr></thead>
      <tbody>${rows||`<tr><td colspan="11"><div class="empty">Dự án chưa có đầu việc.${canManageProject(p)?" Bấm “+ Đầu việc”.":""}</div></td></tr>`}</tbody>
    </table></div></div></div>
    <p class="small muted" style="margin:8px 0 0">Bấm vào một đầu việc để xem chi tiết${S.canEdit?", sửa hoặc đánh giá khi hoàn thành":""}.</p></div>`;
  return out;
}
/* Bảng đầu việc đúng khuôn Báo cáo dự án (reports.js: rpProjectContent()) – STT/Hạng mục gộp ô theo nhóm,
   luôn hiện phẳng hết (không gấp/mở theo nhánh), hợp với khung cuộn cố định ở trên.
   "Vướng mắc" = t.lastNote (ghi chú người làm ở lượt nhập tuần gần nhất); "Hướng giải quyết" = t.note (ghi
   chú của trưởng phòng) – đúng 2 nguồn dữ liệu CLAUDE.md đã quy định, không lẫn nhau. Mỗi dòng
   data-act="task" kèm data-pid để bấm mở form sửa/đánh giá (events.js) – phải mang theo mã dự án vì bảng
   này hiện ở cả tab Kế hoạch (S.planSel) lẫn trang riêng của dự án (S.openProject). */
function planReportRows(p){
  const order = new Map(p._phases.map((ph,i)=>[ph.code,i]));
  /* t.phase (model.js, phaseOf(t.dv)) là MÃ hạng mục ("01","02"...), không phải tên hiển thị – tra lại
     đúng tên qua p._phases (giống cách reports.js/rpBuildWeek() đang làm), không hiện thẳng mã. */
  const nameOf = new Map(p._phases.map(ph=>[ph.code, ph.name]));
  const tasks = [...p._tasks].sort((a,b)=>(order.get(a.phase)??999)-(order.get(b.phase)??999));
  let out = "", i = 0;
  while(i<tasks.length){
    const phase = tasks[i].phase;
    let span = 1; while(i+span<tasks.length && tasks[i+span].phase===phase) span++;
    const phaseName = nameOf.get(phase) || phase || "Khác";
    for(let j=0;j<span;j++){
      const t = tasks[i+j], idle = t.status==="Chưa bắt đầu";
      out += `<tr class="click${idle?" tr-idle":""}" data-act="task" data-pid="${esc(p.id)}" data-id="${esc(t.id)}" tabindex="0" title="${esc(t.dv)}">
        ${j===0?`<td class="cell-main" rowspan="${span}" style="vertical-align:top">${esc(phaseName)}</td>`:""}
        <td class="cell-main" style="vertical-align:top">${esc(planShortName(t.dv))}</td>
        <td style="vertical-align:top; text-align:center">${t.pr?`<span class="pill ${t.pr==="P1"?"bad":"mute"}">${esc(t.pr)}</span>`:"–"}</td>
        <td class="small" style="vertical-align:top">${esc(peopleText(tOwners(t)))}</td>
        <td class="small" style="vertical-align:top">${t.doers.length?t.doers.map(esc).join(", "):"–"}</td>
        <td class="small" style="white-space:pre-wrap; vertical-align:top">${t.detail?esc(t.detail):'<span class="muted">–</span>'}</td>
        <td style="vertical-align:top">${t.deadline?dmy(t.deadline):"–"}</td>
        <td style="vertical-align:top">${stPill(t.status)}</td>
        <td class="small" style="white-space:pre-wrap; vertical-align:top">${t.lastNote?esc(t.lastNote):'<span class="muted">–</span>'}</td>
        <td class="small" style="white-space:pre-wrap; vertical-align:top">${t.note?esc(t.note):'<span class="muted">–</span>'}</td>
        <td style="vertical-align:top">${warnPills(t.warns)}${t.ontime===true?' <span class="pill ok">Đúng hạn</span>':t.ontime===false?' <span class="pill bad">Trễ hạn</span>':""}${t.status==="Hoàn thành"&&!(t.eval&&t.eval.dat)&&S.canEdit?' <span class="pill info">Chờ đánh giá</span>':""}</td></tr>`;
    }
    i += span;
  }
  return out;
}
ACTIONS["plannotes"] = () => { S.planNotes = !S.planNotes; render(); };
/* Thu/phóng bảng đầu việc: bước 10%, giới hạn 60–150%. */
ACTIONS["planzoom"] = el => {
  S.planZoom = Math.min(150, Math.max(60, (S.planZoom||100)+(+el.dataset.d)));
  render();
};
/* ----- Dòng nhóm gấp/mở (hạng mục) – hiện chỉ còn Cài đặt → Quy trình dùng (catTreeRows, settings.js) ----- */
/* Mặc định đóng hết; bấm dòng để mở, trạng thái chỉ nhớ trong phiên (S.planTog) */
function planOpen(key, def=false){ const tg = S.planTog||{}; return key in tg ? tg[key] : def; }
function planStat(ts){
  const live = ts.filter(t=>t.status!=="Hủy"), done = live.filter(t=>t.status==="Hoàn thành");
  /* Đầu việc thiếu Quy mô vẫn có trọng số mặc định 1, không để "biến mất" khỏi mẫu số (xem model.js) */
  const tw = live.reduce((a,t)=>a+(t.wl??1),0), dw = done.reduce((a,t)=>a+(t.wl??1),0);
  return {n:live.length, d:done.length, v: live.length ? dw/tw : null};
}
/* Tên đầu việc bỏ phần "mã. hạng mục –" vì cột/dòng Hạng mục đã hiện */
function planShortName(dv){ return (dv||"").replace(/^[0-9A-Z]{1,2}\d?\.\s*[^–]*–\s*/, ""); }
/* st: {n,d,v} để tính tiến độ, hoặc {meta} để ghi chú tuỳ ý (không có thanh tiến độ khi v=null) */
function planGroupRow(key, lvl, title, st, open, extra, cols=9){
  const meta = st.meta ?? `${st.d}/${st.n} hoàn thành · ${pct(st.v)}`;
  const bar = st.v==null ? "" : `<div class="pbar"><i style="width:${Math.round(st.v*100)}%"></i></div>`;
  return `<tr class="grp-row lvl${lvl}" data-act="tgl" data-key="${esc(key)}" tabindex="0" aria-expanded="${open}">
    <td colspan="${cols}"><div style="display:flex; align-items:center; gap:12px; padding-left:${lvl*22}px">
      <span aria-hidden="true" style="width:14px">${open?"▾":"▸"}</span>
      <div style="flex:1; min-width:0"><b>${esc(title)}</b> <span class="small muted">· ${esc(meta)}</span>${bar}</div>${extra}</div></td></tr>`;
}
/* Bấm dòng hạng mục/nhánh: đảo trạng thái đang hiển thị (aria-expanded) và ghi nhớ trong phiên */
ACTIONS["tgl"] = el => { S.planTog = S.planTog || {}; S.planTog[el.dataset.key] = el.getAttribute("aria-expanded")!=="true"; render(); };
function projectForm(p){
  const isNew = !p;
  const v = p ? {...clean(p), owners:pOwners(p), ses:pSes(p)} : {id:"", name:"", type:"Triển khai", owners:[], ses:[], milestones:"", progress:"", situation:"", proposal:"", difficulty:1};
  const staffOpts = [["",""],...M.staff.map(s=>[s.name,s.name])];
  openForm({
    title: isNew ? "Dự án mới" : "Sửa thông tin dự án", values:v,
    fields:[
      {key:"name", label:"Tên dự án / gói thầu / tư vấn", type:"text", required:true},
      {key:"type", label:"Loại", type:"seg", options:TYPES.map(t=>[t,t]), disabled:!isNew && (p.tasks||[]).length>0, hint:()=>!isNew&&(p.tasks||[]).length?"Không đổi loại khi dự án đã có đầu việc.":"Quyết định quy trình đầu việc áp dụng."},
      {key:"owners", label:"Người phụ trách (TM) – chọn một hoặc nhiều người", type:"multi", listStyle:true, selectionHint:"Bấm vào tên để chọn; bấm lại để bỏ chọn.", options:staffOpts},
      {key:"ses", label:"SE – chọn một hoặc nhiều người", type:"multi", listStyle:true, selectionHint:"Bấm vào tên để chọn; bấm lại để bỏ chọn.", options:staffOpts},
      {key:"milestones", label:"Mốc hợp đồng / hạn nộp", type:"textarea"},
      {key:"situation", label:"Tình hình / vướng mắc chung", type:"textarea"},
      /* progress/proposal: chỉ dùng cho 2 cột "Tiến độ hiện tại"/"Đề xuất" ở Báo cáo → Báo cáo tổng hợp
         dự án (xem rpBuildOverview() ở reports.js) – KHÔNG hiện lại ở thẻ dự án tại Kế hoạch dự án/Tổng
         quan dự án (planDetail() cố tình chỉ giữ 2 ô Mốc hợp đồng + Tình hình chung). */
      {key:"progress", label:"Tiến độ hiện tại (chỉ hiện ở Báo cáo)", type:"textarea"},
      {key:"proposal", label:"Đề xuất (chỉ hiện ở Báo cáo)", type:"textarea"},
      {key:"difficulty", label:"Độ khó dự án", type:"seg", options:[[0.8,"Dễ"],[1,"Trung bình"],[1.3,"Khó"],[1.6,"Cực khó"]],
        hint:v=>({0.8:"Dự án mở rộng, chỉ giao hàng, không cần triển khai.",1:"Đã triển khai công nghệ này trước đây.",1.3:"Triển khai mới.",1.6:"Công nghệ mới, cần chuyên gia hỗ trợ."}[v]||"")}
    ],
    saveLabel: isNew ? "Tạo dự án" : "Lưu thay đổi",
    onSave: async x => {
      if(!x.name.trim()) throw new Error("Nhập tên dự án.");
      if(isNew){
        let id = "p-"+slug(x.name); if(M.pById.get(id)) id += "-"+Math.random().toString(36).slice(2,5);
        /* Luôn tạo sẵn toàn bộ đầu việc theo quy trình chuẩn của loại dự án vừa chọn, không còn tuỳ
           chọn bật/tắt — tránh trường hợp quên tích ô mà tạo ra dự án trống không có đầu việc nào. */
        const tasks = S.catalog.filter(c=>c.type===x.type && !/Việc khác/.test(c.name)).map((c,i)=>({id:"t"+String(i+1).padStart(3,"0"), dv:c.name, detail:"", owners:[...(x.owners||[])], collabs:[], deadline:null, qm:null, pt:null, pr:"P2", init:{status:"",ms:null,nn:""}, note:"", eval:{}}));
        const order = Math.max(0,...M.projects.map(q=>q.order||0))+1;
        await saveProject({id, name:x.name.trim(), type:x.type, owners:x.owners||[], ses:x.ses||[], milestones:x.milestones||"", progress:x.progress||"", situation:x.situation||"", proposal:x.proposal||"", difficulty:x.difficulty||1, order, tasks});
        S.planSel = id; S.openProject = id; toast(`Đã tạo dự án${tasks.length?" với "+tasks.length+" đầu việc":""}`);
      } else {
        await saveProject({...p, name:x.name.trim(), type:x.type, owners:x.owners||[], ses:x.ses||[], milestones:x.milestones||"", progress:x.progress||"", situation:x.situation||"", proposal:x.proposal||"", difficulty:x.difficulty||1}); toast("Đã lưu thông tin dự án");
      }
    },
    onDelete: (isNew || !canDeleteProject(p)) ? null : async () => { if(!confirm(`Xoá dự án “${p.name}” và toàn bộ đầu việc?`)) return false; await remove("projects/"+p.id); S.planSel=null; S.openProject=null; toast("Đã xoá dự án"); }
  });
}
function taskForm(p, t){
  const isNew = !t;
  const raw = t ? (p.tasks||[]).find(x=>x.id===t.id) : null;
  const v = raw ? {...raw, owners:tOwners(raw), collabs:tCollabs(raw), st0:(raw.init||{}).status||"", ms0:(raw.init||{}).ms??null, nn0:(raw.init||{}).nn||"", dat:(raw.eval||{}).dat||"", cl:(raw.eval||{}).cl??null, tc:(raw.eval||{}).tc??null, nx:(raw.eval||{}).nx||""}
    : {id:"", dv:"", detail:"", owners:pOwners(p), collabs:[], deadline:null, qm:null, pt:null, pr:"P2", st0:"", ms0:null, nn0:"", note:""};
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
    const out = [...groups.values()].sort((a,b)=>(order.get(a.code)??999)-(order.get(b.code)??999) || a.code.localeCompare(b.code))
      .map(g => ({group:(g.code?g.code+". ":"")+(g.name||"Khác"), options:g.items.map(c=>[c.name, planShortName(c.name)])}));
    /* Đầu việc đang sửa có tên không còn/không có trong quy trình chuẩn (nhập từ Excel giữ tên riêng –
       plan-import.js, hoặc tên chuẩn đã bị đổi ở Cài đặt): vẫn phải có trong ô chọn, nếu không ô chọn rỗng
       và không lưu được bất cứ thay đổi nào của đầu việc đó. */
    if(raw && raw.dv && !items.some(c=>c.name===raw.dv)) out.push({group:"Ngoài quy trình chuẩn (giữ tên hiện có)", options:[[raw.dv, planShortName(raw.dv)]]});
    return out;
  })();
  const staffOpts = [["",""],...M.staff.map(s=>[s.name,s.name])];
  if(!canManageProject(p)){ if(isNew){ toast("Chỉ trưởng phòng hoặc người tạo dự án mới thêm đầu việc."); return; } return openInfo(p, t); }
  const cOf = n => S.catalog.find(c=>c.name===n)||{};
  openForm({
    title: isNew ? "Thêm đầu việc" : "Đầu việc", subtitle: p.name, values:v,
    info: t ? `<div class="kv" style="margin-bottom:16px"><dt>Trạng thái hiện tại</dt><dd>${stPill(t.status)}</dd>
      <dt>Cập nhật mới nhất</dt><dd>${esc(t.upd||"–")}</dd><dt>Ngày cập nhật</dt><dd>${esc(t.updDate||"–")}</dd><dt>Kết quả đầu ra</dt><dd>${esc(cOf(t.dv).result||"–")}</dd><dt>Chú thích</dt><dd>${esc(cOf(t.dv).evidence||"–")}</dd></div>` : "",
    fields:[
      {key:"dv", label:"Đầu việc (quy trình "+p.type+")", type:"select", options:dvOpts, required:true},
      {key:"detail", label:"Nội dung chi tiết", type:"textarea"},
      /* Chọn nhiều người; đầu việc mới mặc định = toàn bộ TM của dự án, chỉnh riêng từng đầu việc được (sửa TM dự án KHÔNG đổi đầu việc cũ) */
      {key:"owners", label:"Phụ trách (TM)", type:"multi", listStyle:true, selectionHint:"Bấm vào tên để chọn; bấm lại để bỏ chọn.", options:staffOpts},
      {key:"collabs", label:"Thực hiện (được giao làm)", type:"multi", listStyle:true, selectionHint:"Bấm vào tên để chọn; bấm lại để bỏ chọn.", options:staffOpts},
      {key:"deadline", label:"Deadline theo HĐ", type:"date", half:true},
      {key:"pr", label:"Ưu tiên", type:"seg", options:["P1","P2","P3","P4"].map(x=>[x,x]), half:true},
      {key:"pt", label:"Độ phức tạp", type:"seg", half:true, options:[[null,"Mặc định"],...[1,2,3,4,5].map(n=>[n,String(n)])], hint:v=>v?PT_HINT[v]:""},
      {key:"st0", label:"Trạng thái", type:"select", half:true, options:[["",""],...ST_ALL.map(s=>[s,s])]},
      /* "Ghi chú của trưởng phòng" (task.note) không còn sửa được ở đây nữa – đã có "Đánh giá khi hoàn
         thành" bên dưới cho nhận xét sau khi xong; ghi chú vướng mắc/định hướng xử lý giờ chỉ sửa ở Nhập
         theo tuần (weekly-input.js, field "mgrNote" – cùng ghi vào task.note qua route task-note). Vẫn
         đọc lại t.note để hiển thị (xem planDetail/dashRow), chỉ bỏ ô sửa ở form này. */
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
      const body = {id: x.id || nextTaskId(p), dv:x.dv, detail:x.detail||"", owners:x.owners||[], collabs:x.collabs||[], deadline:x.deadline||null, qm:x.qm||null, pt:x.pt||null, pr:x.pr||"",
        /* init.note = vướng mắc ban đầu (chỉ có ở đầu việc nhập từ Excel) – không có ô sửa ở đây, giữ nguyên */
        init:{status:x.st0||"", ms:x.ms0??null, nn:x.nn0||"", ...(raw && raw.init && raw.init.note ? {note:raw.init.note} : {})}, note:x.note||"", eval: raw&&raw.eval ? {...raw.eval} : {}, updatedAt:Date.now()};
      if(t && t.status==="Hoàn thành" && S.canEdit) body.eval = {dat:x.dat||"", cl:x.cl??null, tc:x.tc??null, nx:x.nx||""};
      const i = tasks.findIndex(q=>q.id===body.id); if(i>=0) tasks[i]=body; else tasks.push(body);
      await saveProject({...p, tasks}); toast(isNew?"Đã thêm đầu việc":"Đã lưu đầu việc");
    },
    onDelete: isNew ? null : async () => { if(!confirm("Xoá đầu việc này?")) return false; await saveProject({...p, tasks:(p.tasks||[]).filter(q=>q.id!==t.id)}); toast("Đã xoá đầu việc"); }
  });
}
function nextTaskId(p){ let n=(p.tasks||[]).length+1; const ids=new Set((p.tasks||[]).map(t=>t.id)); while(ids.has("t"+String(n).padStart(3,"0"))) n++; return "t"+String(n).padStart(3,"0"); }
/* extraBtn tuỳ chọn (vd {label, onClick}) – thêm nút đi tới nơi xử lý bên cạnh "Đóng", dùng cho chỗ gọi
   cần điều hướng tiếp (xem ACTIONS["exinfo"] ở exec-dashboard.js). Gọi không kèm tham số (taskForm() khi
   người bấm không có quyền sửa dự án) thì chỉ xem thuần, không có nút thêm. */
function openInfo(p, t, extraBtn){
  const c = S.catalog.find(x=>x.name===t.dv)||{};
  openForm({title:"Đầu việc", subtitle:p.name, values:{}, fields:[], readOnly:true, extraBtn,
    info:`<h3 style="margin-bottom:12px">${esc(t.dv)}</h3><div class="kv"><dt>Nội dung</dt><dd>${esc(t.detail||"–")}</dd><dt>Phụ trách</dt><dd>${esc(peopleText(tOwners(t)))}</dd>
    <dt>Deadline HĐ</dt><dd>${dmy(t.deadline)}</dd><dt>Trạng thái</dt><dd>${stPill(t.status)}</dd><dt>Cập nhật</dt><dd>${esc(t.upd||"–")}</dd><dt>Ngày cập nhật</dt><dd>${esc(t.updDate||"–")}</dd>
    <dt>Kết quả đầu ra</dt><dd>${esc(c.result||"–")}</dd><dt>Workload</dt><dd>${t.wl??"–"}</dd>
    <dt>Ghi chú TrP</dt><dd>${esc(t.note||"–")}</dd></div>`});
}

