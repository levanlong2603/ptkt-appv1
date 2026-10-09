"use strict";
/* Module mở rộng: KPI & Năng lực – GIAI ĐOẠN 1 (đã thống nhất với trưởng phòng: làm trước phần tính KPI
   từ dữ liệu thật + danh sách/chi tiết nhân viên; ma trận năng lực đầy đủ, quy trình phê duyệt nhiều cấp
   và đề xuất khen thưởng chính thức để ở giai đoạn sau, vì cần dữ liệu hoàn toàn mới chưa tồn tại).
   Phân quyền dùng đúng 2 vai trò sẵn có (Trưởng phòng/Nhân viên) — không thêm vai trò "quản lý"/"người
   phê duyệt" riêng, theo yêu cầu (hệ thống chỉ có 1 trưởng phòng).

   Nguồn dữ liệu cho từng tiêu chí (không bịa số liệu — xem rpBuild-style ở modules/reports.js):
     - Khối lượng công việc   : M.entries (Nhập theo tuần) của người đó trong kỳ, so với Capacity.
     - Độ khó & đóng góp      : độ phức tạp (pt) trung bình có trọng số workload của các dòng nhập trong kỳ.
       "Mức đóng góp" khi nhiều người cùng làm 1 đầu việc KHÔNG có dữ liệu % chia tỷ lệ trong hệ thống —
       tạm dùng chính workload tự nhập của từng người (đã là phần việc riêng họ tự chấm), không chia đều.
     - Chất lượng công việc   : task.eval.cl ("Đánh giá khi hoàn thành" ở Kế hoạch dự án) của đầu việc họ
       Phụ trách, hoàn thành trong kỳ.
     - Tiến độ & cam kết      : t.ontime của đầu việc họ Phụ trách, hoàn thành trong kỳ.
     - Năng lực & phát triển  : CHƯA CÓ NGUỒN DỮ LIỆU — luôn để trống (null), không tự chấm. Cần dựng ma
       trận năng lực theo chức danh ở giai đoạn 2 (đã thêm sẵn trường "Chức danh" tuỳ chọn cho nhân sự).
   KPI tổng chỉ cộng trọng số của các tiêu chí CÓ dữ liệu trong kỳ (không coi thiếu dữ liệu = 0 điểm). */
const KPI_DEFAULT = {
  weights: {volume:20, difficulty:20, quality:25, progress:20, capability:15},
  thresholds: [{min:90,label:"Xuất sắc",cls:"ok"},{min:80,label:"Tốt",cls:"info"},{min:65,label:"Đạt yêu cầu",cls:"warn"},{min:0,label:"Cần cải thiện",cls:"bad"}]
};
const KPI_CRIT = [
  {key:"volume", label:"Khối lượng công việc"},
  {key:"difficulty", label:"Độ khó & đóng góp"},
  {key:"quality", label:"Chất lượng công việc"},
  {key:"progress", label:"Tiến độ & cam kết"},
  {key:"capability", label:"Năng lực & phát triển"}
];
ON_SESSION.push(db => {
  db.collection("config").onSnapshot(snap => {
    const doc = snap.docs.find(d=>d.id==="kpiCriteria");
    S.kpiCriteria = (doc && doc.data()) || KPI_DEFAULT;
    schedule();
  });
  db.collection("kpiNote").onSnapshot(snap => {
    S.kpiNotes = snap.docs.map(d=>({...d.data(), id:d.id}));
    schedule();
  });
});
function kpiInit(){
  if(!S.kpi) S.kpi = {kind:"month", anchor: mondayOf(todayISO()), q:"", sort:"kpi", dir:-1, sel:null};
  if(!S.kpiNotes) S.kpiNotes = [];
}
/* periodInfo()/shiftAnchor() (exec-dashboard.js) đã hỗ trợ week/month/quarter – bổ sung "year" riêng ở
   đây thay vì sửa file gốc, giữ đúng tinh thần "ưu tiên mở rộng, không sửa lõi". */
function kpiPeriodInfo(anchor, kind){
  if(kind!=="year") return periodInfo(anchor, kind);
  const y = parse(anchor).getFullYear();
  const weeks = []; let w = mondayOf(iso(new Date(y,0,1)));
  if(parse(w).getFullYear()!==y) w = addDays(w,7);
  while(true){ const wd = parse(w); if(wd.getFullYear()!==y) break; weeks.push(w); w = addDays(w,7); }
  return {weeks, label:`Năm ${y}`, short:"năm"};
}
function kpiShiftAnchor(anchor, kind, dir){
  if(kind!=="year") return shiftAnchor(anchor, kind, dir);
  const nd = new Date(parse(anchor).getFullYear()+dir, 0, 1);
  const w = mondayOf(iso(nd)); return parse(w).getFullYear()===nd.getFullYear() ? w : addDays(w,7);
}
function kpiLabel(score){
  if(score==null) return null;
  const th = (S.kpiCriteria||KPI_DEFAULT).thresholds;
  for(const t of th) if(score>=t.min) return t;
  return th[th.length-1];
}
/* ----- tính điểm 1 nhân viên trong 1 kỳ (mảng các tuần thuộc kỳ đó) ----- */
function kpiCompute(name, weeks){
  const wset = new Set(weeks);
  const cap = M.capOf.get(name) || 0;
  const myEntries = M.entries.filter(e => e.person===name && wset.has(e.week) && e.status!=="Hủy");
  const wl = myEntries.reduce((a,e)=>a+(e.wl||0),0);
  const capPeriod = cap * weeks.length;
  const volume = myEntries.length ? Math.min(100, Math.round(capPeriod ? wl/capPeriod*100 : 0)) : null;
  let ptWlSum=0, ptSum=0;
  for(const e of myEntries){
    const pt = e.pt || (e.ref && e.ref.t.ptE) || null;
    if(pt && e.wl){ ptWlSum += pt*e.wl; ptSum += e.wl; }
  }
  const difficulty = ptSum ? Math.round((ptWlSum/ptSum - 1)/4*100) : null;
  const myTasks = M.tasks.filter(t => t.owner===name && t.done && wset.has(t.done));
  const withEval = myTasks.filter(t => t.eval && t.eval.cl!=null);
  const quality = withEval.length ? Math.round(withEval.reduce((a,t)=>a+(t.eval.cl-1)/4*100,0)/withEval.length) : null;
  const withOntime = myTasks.filter(t => t.ontime!=null);
  const progress = withOntime.length ? Math.round(withOntime.filter(t=>t.ontime).length/withOntime.length*100) : null;
  const scores = {volume, difficulty, quality, progress, capability:null};
  const weights = (S.kpiCriteria||KPI_DEFAULT).weights;
  let wsum=0, ssum=0;
  for(const k of Object.keys(scores)) if(scores[k]!=null){ wsum += weights[k]||0; ssum += scores[k]*(weights[k]||0); }
  const kpi = wsum ? Math.round(ssum/wsum) : null;
  return {scores, kpi, wsum, nEntries: myEntries.length, nTasks: myTasks.length, tasks: myTasks};
}
/* ----- giao diện ----- */
function kpiPeriodNav(){
  const k = S.kpi.kind, info = kpiPeriodInfo(S.kpi.anchor, k);
  return `<div class="toolbar">
    <div class="seg-in" role="group" aria-label="Kỳ đánh giá">${[["month","Tháng"],["quarter","Quý"],["year","Năm"]].map(([v,l])=>`<button type="button" data-act="kpikind" data-v="${v}" aria-pressed="${k===v}">${l}</button>`).join("")}</div>
    <div class="weeknav"><button class="btn ghost icon" data-act="kpinav" data-d="-1" aria-label="Kỳ trước">‹</button>
      <div class="lbl">${esc(info.label)}</div>
      <button class="btn ghost icon" data-act="kpinav" data-d="1" aria-label="Kỳ sau">›</button></div></div>`;
}
function viewKpi(){
  kpiInit();
  if(S.kpi.sel) return kpiDetailView();
  const info = kpiPeriodInfo(S.kpi.anchor, S.kpi.kind);
  const rows = M.staff.map(s => ({s, r: kpiCompute(s.name, info.weeks)}));
  const evaluated = rows.filter(x=>x.r.kpi!=null);
  const avg = evaluated.length ? Math.round(evaluated.reduce((a,x)=>a+x.r.kpi,0)/evaluated.length) : null;
  const excellent = evaluated.filter(x=>(kpiLabel(x.r.kpi)||{}).label==="Xuất sắc").length;
  const improve = evaluated.filter(x=>(kpiLabel(x.r.kpi)||{}).label==="Cần cải thiện").length;
  let h = `<div class="head"><div><h1>KPI &amp; Năng lực</h1><div class="sub">Đánh giá hiệu quả công việc theo kỳ — tự tính từ Tải tuần &amp; Kế hoạch dự án</div></div>
    ${S.canEdit?`<button class="btn" data-act="kpicfg">Cấu hình tiêu chí</button>`:""}</div>`;
  h += `<section class="panel" style="margin-bottom:14px"><div class="panel-b">${kpiPeriodNav()}</div></section>`;
  h += `<div class="band">
    <div class="stat"><div class="v">${evaluated.length}/${M.staff.length}</div><div class="l">Nhân viên được đánh giá</div></div>
    <div class="stat ${avg==null?"":avg>=80?"ok":avg>=65?"warn":"bad"}"><div class="v">${avg==null?"–":avg}</div><div class="l">KPI trung bình</div></div>
    <div class="stat ok"><div class="v">${excellent}</div><div class="l">Đề xuất khen thưởng (Xuất sắc)</div></div>
    <div class="stat ${improve?"bad":""}"><div class="v">${improve}</div><div class="l">Cần cải thiện</div></div></div>`;
  const q = (S.kpi.q||"").toLowerCase();
  let filtered = rows.filter(x=>!q || x.s.name.toLowerCase().includes(q));
  const sortKey = S.kpi.sort, dir = S.kpi.dir;
  filtered = [...filtered].sort((a,b) => {
    if(sortKey==="name") return dir*a.s.name.localeCompare(b.s.name,"vi");
    return dir*((a.r.kpi??-1)-(b.r.kpi??-1));
  });
  const sortIcon = k => sortKey===k ? (dir>0?" ▲":" ▼") : "";
  h += `<section class="panel"><div class="panel-h"><h2>Bảng đánh giá nhân viên</h2>
    <input class="inp" style="max-width:220px" type="search" placeholder="Tìm nhân viên…" data-act="kpisearch" value="${esc(S.kpi.q||"")}"></div>
    <div class="tbl-wrap"><table style="table-layout:fixed"><thead><tr>
      <th data-act="kpisorth" data-k="name" style="cursor:pointer; width:19%">Nhân sự${sortIcon("name")}</th>
      ${KPI_CRIT.map(c=>`<th style="width:13%; text-align:center">${c.label}</th>`).join("")}
      <th data-act="kpisorth" data-k="kpi" style="cursor:pointer; width:8%; text-align:center">KPI${sortIcon("kpi")}</th>
      <th style="width:14%">Xếp loại</th></tr></thead><tbody>
    ${filtered.length ? filtered.map(x=>{
      const lb = kpiLabel(x.r.kpi);
      return `<tr class="click" data-act="kpisel" data-name="${esc(x.s.name)}" tabindex="0">
        <td class="cell-main">${esc(x.s.name)}${x.s.title?`<div class="small muted">${esc(x.s.title)}</div>`:""}</td>
        ${KPI_CRIT.map(c=>`<td style="text-align:center">${x.r.scores[c.key]==null?"–":x.r.scores[c.key]}</td>`).join("")}
        <td style="text-align:center; font-weight:700">${x.r.kpi??"–"}</td>
        <td>${lb?`<span class="pill ${lb.cls}">${esc(lb.label)}</span>`:'<span class="pill mute">Chưa có dữ liệu</span>'}</td></tr>`;
    }).join("") : `<tr><td colspan="${3+KPI_CRIT.length}" class="muted">Không tìm thấy nhân sự phù hợp.</td></tr>`}
    </tbody></table></div>
    <div class="panel-b small muted">"Năng lực & phát triển" (${(S.kpiCriteria||KPI_DEFAULT).weights.capability}%) hiện chưa có nguồn dữ liệu (chờ Giai đoạn 2 — ma trận năng lực) nên không tính vào KPI; trọng số các tiêu chí còn lại tự quy đổi lại theo đúng phần có dữ liệu.</div></section>`;
  return h;
}
function kpiDetailView(){
  const name = S.kpi.sel;
  const s = M.staff.find(x=>x.name===name);
  if(!s){ S.kpi.sel = null; return viewKpi(); }
  const info = kpiPeriodInfo(S.kpi.anchor, S.kpi.kind);
  const r = kpiCompute(name, info.weeks);
  const lb = kpiLabel(r.kpi);
  const noteId = `${S.kpi.kind}-${S.kpi.anchor}__${slug(name)}`;
  const note = (S.kpiNotes||[]).find(n=>n.id===noteId);
  let h = `<div class="head"><div><button class="btn ghost" data-act="kpiback">‹ Quay lại danh sách</button><h1 style="margin-top:8px">${esc(name)}</h1><div class="sub">${esc(s.title||"Chưa có chức danh")} · ${esc(info.label)}</div></div></div>`;
  h += `<div class="band">
    <div class="stat ${lb?lb.cls:""}"><div class="v">${r.kpi??"–"}</div><div class="l">KPI tổng${lb?" · "+esc(lb.label):""}</div></div>
    ${KPI_CRIT.map(c=>`<div class="stat"><div class="v">${r.scores[c.key]??"–"}</div><div class="l">${c.label}</div></div>`).join("")}
  </div>`;
  h += `<section class="panel" style="margin-bottom:14px"><div class="panel-h"><h2>Chi tiết từng tiêu chí</h2></div><div class="panel-b">
    ${KPI_CRIT.map(c=>{ const v = r.scores[c.key];
      return `<div class="hbar"><span>${c.label} <span class="muted small">· trọng số ${(S.kpiCriteria||KPI_DEFAULT).weights[c.key]}%</span></span>
        <div class="t"><i style="width:${v??0}%; background:${v==null?"var(--line-2)":"var(--teal)"}"></i></div>
        <span style="text-align:right">${v==null?"Chưa có dữ liệu":v}</span></div>`; }).join("")}
  </div></section>`;
  h += `<section class="panel" style="margin-bottom:14px"><div class="panel-h"><h2>Đầu việc phụ trách, hoàn thành trong kỳ</h2><span class="muted small">${r.nTasks} đầu việc</span></div>
    <div class="tbl-wrap"><table style="table-layout:fixed"><thead><tr><th>Dự án</th><th>Đầu việc</th><th style="text-align:center">Độ phức tạp</th><th style="text-align:center">Đúng hạn</th><th style="text-align:center">Chất lượng</th></tr></thead><tbody>
    ${r.tasks.length ? r.tasks.map(t=>`<tr><td class="small muted">${esc(t.p.name)}</td><td class="cell-main">${esc(planShortName(t.dv))}</td>
      <td style="text-align:center">${t.ptE??"–"}</td>
      <td style="text-align:center">${t.ontime===true?'<span class="pill ok">Đúng hạn</span>':t.ontime===false?'<span class="pill bad">Trễ hạn</span>':"–"}</td>
      <td style="text-align:center">${t.eval&&t.eval.cl!=null?t.eval.cl:"–"}</td></tr>`).join("") : `<tr><td colspan="5" class="muted">Không có đầu việc nào hoàn thành trong kỳ này.</td></tr>`}
    </tbody></table></div></section>`;
  const hist = []; let a = S.kpi.anchor;
  for(let i=0;i<6;i++){ const inf = kpiPeriodInfo(a, S.kpi.kind); const rr = kpiCompute(name, inf.weeks); hist.unshift({label:inf.label, kpi:rr.kpi}); a = kpiShiftAnchor(a, S.kpi.kind, -1); }
  h += `<section class="panel" style="margin-bottom:14px"><div class="panel-h"><h2>Lịch sử KPI</h2><span class="muted small">6 kỳ gần nhất, tính lại theo cấu hình tiêu chí hiện hành</span></div><div class="panel-b">
    ${hist.map(x=>`<div class="hbar"><span>${esc(x.label)}</span><div class="t"><i style="width:${x.kpi??0}%; background:${x.kpi==null?"var(--line-2)":"var(--indigo)"}"></i></div><span style="text-align:right">${x.kpi??"–"}</span></div>`).join("")}
  </div></section>`;
  h += `<section class="panel" style="margin-bottom:14px"><div class="panel-h"><h2>Ma trận năng lực</h2></div><div class="panel-b"><div class="empty"><b>Chưa có dữ liệu</b>Ma trận năng lực theo chức danh sẽ được xây dựng ở Giai đoạn 2 (cần cấu hình nhóm kỹ năng &amp; cấp độ mục tiêu theo từng chức danh trước khi nhập minh chứng).</div></div></section>`;
  h += `<section class="panel"><div class="panel-h"><h2>Nhận xét của trưởng phòng</h2>${S.canEdit?`<button class="btn" data-act="kpinote" data-id="${esc(noteId)}" data-name="${esc(name)}">${note?"Sửa":"Thêm"} nhận xét</button>`:""}</div>
    <div class="panel-b">${note&&note.text?`<p style="white-space:pre-wrap; margin:0">${esc(note.text)}</p>${note.updatedAt?`<div class="small muted" style="margin-top:6px">Cập nhật ${dmy(note.updatedAt.slice(0,10))}</div>`:""}`:'<div class="muted small">Chưa có nhận xét cho kỳ này.</div>'}</div></section>`;
  return h;
}
function kpiCriteriaForm(){
  const c = S.kpiCriteria || KPI_DEFAULT;
  openForm({title:"Cấu hình tiêu chí KPI", subtitle:"Áp dụng cho mọi kỳ kể từ khi lưu — các kỳ trước không bị tính lại âm thầm theo trọng số cũ vì KPI luôn tính theo cấu hình hiện hành khi xem",
    values:{...c.weights, thExcellent:c.thresholds[0].min, thGood:c.thresholds[1].min, thOk:c.thresholds[2].min},
    fields:[
      ...KPI_CRIT.map(k=>({key:k.key, label:`${k.label} (%)`, type:"number", half:true})),
      {heading:"Ngưỡng xếp loại (điểm KPI tối thiểu)"},
      {key:"thExcellent", label:"Xuất sắc, từ", type:"number", half:true},
      {key:"thGood", label:"Tốt, từ", type:"number", half:true},
      {key:"thOk", label:"Đạt yêu cầu, từ", type:"number", half:true}
    ],
    onSave: async v => {
      const weights = {}; let sum=0;
      for(const k of KPI_CRIT){ weights[k.key] = +v[k.key]||0; sum += weights[k.key]; }
      if(sum!==100) throw new Error(`Tổng trọng số phải bằng 100% (hiện đang là ${sum}%).`);
      const thresholds = [
        {min:+v.thExcellent||90, label:"Xuất sắc", cls:"ok"},
        {min:+v.thGood||80, label:"Tốt", cls:"info"},
        {min:+v.thOk||65, label:"Đạt yêu cầu", cls:"warn"},
        {min:0, label:"Cần cải thiện", cls:"bad"}
      ];
      await write("config/kpiCriteria", {weights, thresholds});
      toast("Đã lưu cấu hình tiêu chí KPI");
    }
  });
}
function kpiNoteForm(id, name){
  const note = (S.kpiNotes||[]).find(n=>n.id===id);
  openForm({title:"Nhận xét của trưởng phòng", subtitle:name,
    values:{text: note?note.text:""},
    fields:[{key:"text", label:"Nội dung nhận xét", type:"textarea", required:true}],
    saveLabel:"Lưu nhận xét",
    onSave: async v => { await write("kpiNote/"+id, {person:name, text:v.text.trim(), updatedAt:new Date().toISOString()}); toast("Đã lưu nhận xét"); },
    onDelete: note ? async()=>{ if(!confirm("Xoá nhận xét này?")) return false; await remove("kpiNote/"+id); toast("Đã xoá"); } : null
  });
}
ACTIONS["kpikind"] = el => { kpiInit(); S.kpi.kind = el.dataset.v; render(); };
ACTIONS["kpinav"] = el => { kpiInit(); S.kpi.anchor = kpiShiftAnchor(S.kpi.anchor, S.kpi.kind, +el.dataset.d); render(); };
ACTIONS["kpisel"] = el => { kpiInit(); S.kpi.sel = el.dataset.name; render(); };
ACTIONS["kpiback"] = () => { S.kpi.sel = null; render(); };
ACTIONS["kpisorth"] = el => { kpiInit(); const k=el.dataset.k; if(S.kpi.sort===k) S.kpi.dir*=-1; else { S.kpi.sort=k; S.kpi.dir = k==="name"?1:-1; } render(); };
ACTIONS["kpicfg"] = () => kpiCriteriaForm();
ACTIONS["kpinote"] = el => kpiNoteForm(el.dataset.id, el.dataset.name);
main.addEventListener("input", e => {
  if(e.target.dataset.act!=="kpisearch") return;
  kpiInit(); S.kpi.q = e.target.value;
  const pos = e.target.selectionStart; render();
  const el = main.querySelector('[data-act="kpisearch"]'); if(el){ el.focus(); el.setSelectionRange(pos,pos); }
});
VIEW_RENDER.kpi = viewKpi;
ICONS.kpi = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/><circle cx="12" cy="8" r="7"/></svg>';
{
  const i = VIEWS.findIndex(v=>v.id==="reports");
  VIEWS.splice((i<0?VIEWS.length-1:i)+1, 0, {id:"kpi", label:"KPI & Năng lực", icon:"kpi"});
}
