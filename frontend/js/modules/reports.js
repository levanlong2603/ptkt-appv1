"use strict";
/* Module mở rộng: Báo cáo – tạo, xem trước và xuất báo cáo ra Excel (.xlsx thật, qua ExcelJS) hoặc
   PDF (qua pdfmake, font Roboto có sẵn hỗ trợ tiếng Việt). Không có dashboard/biểu đồ riêng ở đây –
   chỉ đọc lại dữ liệu đã có sẵn trong M (model.js) và S (dữ liệu đồng bộ từ máy chủ), không tự tạo
   dữ liệu giả, không gọi API riêng (đọc đã mở cho mọi tài khoản đăng nhập, theo RULES trong server.js). */
/* Tải thư viện xuất file theo kiểu "lười" (chỉ khi thực sự bấm Xuất Excel/PDF) — tránh làm chậm toàn bộ
   ứng dụng ở mọi trang chỉ vì 2 thư viện khá nặng này, trong khi phần lớn người dùng không vào Báo cáo. */
function rpLoadScript(src){
  return new Promise((resolve, reject) => {
    if(document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script"); s.src = src;
    s.onload = () => resolve(); s.onerror = () => reject(new Error("Không tải được thư viện: "+src));
    document.head.appendChild(s);
  });
}
let rpExcelReady = null, rpPdfReady = null;
function rpEnsureExcel(){ return rpExcelReady || (rpExcelReady = rpLoadScript("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js")); }
function rpEnsurePdf(){ return rpPdfReady || (rpPdfReady = rpLoadScript("https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/pdfmake.min.js").then(()=>rpLoadScript("https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/vfs_fonts.js"))); }
const RP_TEMPLATES = [
  {type:"week", label:"Báo cáo tuần", hint:"Theo dữ liệu Tải tuần / Nhập theo tuần"},
  {type:"plan", label:"Kế hoạch dự án", hint:"Theo dữ liệu Kế hoạch dự án"},
  {type:"summary", label:"Tổng hợp dự án", hint:"Tiến độ & rủi ro toàn bộ dự án"}
];
function rpDefaults(type){
  if(type==="plan") return {project:"", status:"Tất cả"};
  if(type==="summary") return {ptype:"Tất cả"};
  return {project:"", staff:"__all__"};
}
function rpInit(){
  if(!S.rp) S.rp = {type:"week", draft:rpDefaults("week"), applied:rpDefaults("week"), busy:""};
}
function rpRisk(p){
  if(p._late>0 || p._maxms>=4) return "Cao";
  if(p._soon>0 || p._stuck>0 || p._maxms>=2) return "Trung bình";
  return "Thấp";
}
/* ----- xây dữ liệu báo cáo: dùng chung cho cả xem trước lẫn xuất file, để luôn khớp nhau ----- */
function rpBuildWeek(){
  const f = S.rp.applied, w = S.week;
  const projName = f.project ? ((M.pById.get(f.project)||{}).name || "(dự án đã xoá)") : "Tất cả dự án";
  const staffLabel = f.staff==="__all__" ? "Tất cả nhân sự" : f.staff;
  const es = M.entries.filter(e=>e.week===w && (!f.project||e.projectId===f.project) && (f.staff==="__all__"||e.person===f.staff))
    .sort((a,b)=>a.person.localeCompare(b.person,"vi") || (a.type||"").localeCompare(b.type||"","vi"));
  const cols1 = ["Người","Dự án","Loại","Đầu việc","Việc đã làm","Quy mô","Độ phức tạp","Workload","Trạng thái","Ma sát","Nguyên nhân","Vướng mắc"];
  const rows1 = es.map(e => ({
    "Người": e.person, "Dự án": (M.pById.get(e.projectId)||{}).name || "(đã xoá)", "Loại": e.type,
    "Đầu việc": e.ref ? planShortName(e.ref.t.dv) : "(đã xoá)", "Việc đã làm": e.work || "",
    "Quy mô": e.qm ?? "", "Độ phức tạp": e.pt ?? "", "Workload": e.wl ?? "",
    "Trạng thái": e.status || "", "Ma sát": e.ms ?? "", "Nguyên nhân": e.nn || "", "Vướng mắc": e.note || ""
  }));
  const staffList = f.staff==="__all__" ? M.staff : M.staff.filter(s=>s.name===f.staff);
  const cols2 = ["Nhân sự","Số đầu việc","Workload","Capacity","Mức sử dụng","Hoàn thành","Trạng thái"];
  const rows2 = staffList.map(s => {
    const L = loadFor(s.name, w), u = s.cap ? L.wl/s.cap : null, d = ratioOf(L.es);
    const st = !L.es.length ? "Chưa nhập tuần" : L.missing ? "Thiếu quy mô" : u>1 ? "Quá tải" : u>=.8 ? "Tải cao" : "Còn khả năng";
    return {"Nhân sự": s.name, "Số đầu việc": L.es.length, "Workload": fmt1(L.wl), "Capacity": fmt1(s.cap),
      "Mức sử dụng": pct(u), "Hoàn thành": L.es.length ? pct(d.ratio) : "–", "Trạng thái": st};
  });
  return {
    title:"Báo cáo tuần", scope:`${projName} · ${staffLabel}`,
    period:`Tuần ${isoWeek(w)} (${dm(w)} – ${dmy(addDays(w,6))})`,
    filename:`Bao-cao-tuan-${isoWeek(w)}-${w}`,
    sheets:[
      {name:"Chi tiết", cols:cols1.map(h=>({header:h,key:h})), rows:rows1},
      {name:"Tổng hợp theo người", cols:cols2.map(h=>({header:h,key:h})), rows:rows2}
    ]
  };
}
function rpBuildPlan(){
  const f = S.rp.applied;
  const empty = {title:"Báo cáo kế hoạch dự án", scope:"Chưa chọn dự án", period:"", filename:"Bao-cao-ke-hoach-du-an",
    sheets:[{name:"Đầu việc", cols:[], rows:[]}]};
  if(!f.project) return empty;
  const p = M.pById.get(f.project);
  if(!p) return {...empty, scope:"Dự án không còn tồn tại"};
  const tasks = p._tasks.filter(t => f.status==="Tất cả" || t.status===f.status);
  const cols = ["Hạng mục","Đầu việc","Phụ trách","Thực hiện","Deadline","Workload","Ưu tiên","Trạng thái","Cập nhật mới nhất","Cảnh báo"];
  const rows = tasks.map(t => ({
    "Hạng mục": t.phase || "", "Đầu việc": planShortName(t.dv), "Phụ trách": t.owner || "",
    "Thực hiện": (t.doers||[]).join(", "), "Deadline": t.deadline ? dmy(t.deadline) : "",
    "Workload": t.wl ?? "", "Ưu tiên": t.pr || "", "Trạng thái": t.status || "",
    "Cập nhật mới nhất": t.upd || "", "Cảnh báo": (t.warns||[]).map(w=>w[1]).join("; ")
  }));
  return {
    title:"Báo cáo kế hoạch dự án", scope:`${p.name} (${p.type})${f.status!=="Tất cả"?" · "+f.status:""}`,
    period:`Tình trạng hiện tại (${dmy(M.today)})`, filename:`Bao-cao-ke-hoach-${slug(p.name)}`,
    sheets:[{name:"Đầu việc", cols:cols.map(h=>({header:h,key:h})), rows}]
  };
}
function rpBuildSummary(){
  const f = S.rp.applied;
  const projects = M.projects.filter(p => p.type!=="Nội bộ" && planMatchFilter(p, f.ptype) && (p.tasks||[]).length);
  const cols = ["Dự án","Loại","Phụ trách (TM)","SE","Tiến độ","Mốc tiếp theo","Quá hạn","Sắp hạn","Đang vướng","Rủi ro"];
  const rows = projects.map(p => ({
    "Dự án": p.name, "Loại": p.type, "Phụ trách (TM)": p.owner || "", "SE": p.se || "",
    "Tiến độ": pct(p._prog), "Mốc tiếp theo": p._next ? dmy(p._next) : "",
    "Quá hạn": p._late, "Sắp hạn": p._soon, "Đang vướng": p._stuck, "Rủi ro": rpRisk(p)
  }));
  return {
    title:"Báo cáo tổng hợp dự án", scope:f.ptype,
    period:`Tình trạng hiện tại (${dmy(M.today)})`, filename:"Bao-cao-tong-hop-du-an",
    sheets:[{name:"Dự án", cols:cols.map(h=>({header:h,key:h})), rows}]
  };
}
function rpBuild(){
  rpInit();
  if(S.rp.type==="plan") return rpBuildPlan();
  if(S.rp.type==="summary") return rpBuildSummary();
  return rpBuildWeek();
}
/* ----- xuất file ----- */
async function rpExportExcel(report){
  const wb = new ExcelJS.Workbook();
  wb.creator = "NGSI · Phòng Kỹ thuật"; wb.created = new Date();
  for(const sh of report.sheets){
    const ws = wb.addWorksheet(sh.name.slice(0,31), {views:[{state:"frozen", ySplit:1}]});
    if(!sh.cols.length) continue;
    ws.columns = sh.cols.map(c => ({header:c.header, key:c.key, width: Math.min(42, Math.max(10, c.header.length*1.3))}));
    const head = ws.getRow(1);
    head.font = {bold:true, color:{argb:"FFFFFFFF"}};
    head.fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FF0E7C7B"}};
    head.alignment = {vertical:"middle"};
    for(const r of sh.rows) ws.addRow(r);
    if(sh.rows.length) ws.autoFilter = {from:{row:1,column:1}, to:{row:1,column:sh.cols.length}};
  }
  const buf = await wb.xlsx.writeBuffer();
  download(`${report.filename}.xlsx`, new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
}
function rpExportPdf(report){
  const content = [
    {text:"NGSI · Phòng Kỹ thuật", fontSize:9, color:"#888"},
    {text:report.title, fontSize:16, bold:true, margin:[0,2,0,2]},
    {text:report.scope||"–", fontSize:9.5, color:"#555"},
    {text:`${report.period||""} · Ngày xuất: ${dmy(todayISO())}`, fontSize:9.5, color:"#555", margin:[0,0,0,12]}
  ];
  let landscape = false;
  report.sheets.forEach((sh, i) => {
    if(!sh.cols.length) return;
    if(sh.cols.length > 6) landscape = true;
    if(report.sheets.length > 1) content.push({text:sh.name, fontSize:12, bold:true, margin:[0, i>0?14:0, 0, 6]});
    if(!sh.rows.length){ content.push({text:"Không có dữ liệu.", fontSize:9.5, color:"#888", italics:true}); return; }
    const body = [sh.cols.map(c => ({text:c.header, bold:true, fontSize:8, fillColor:"#eef3f2"}))]
      .concat(sh.rows.map(r => sh.cols.map(c => ({text:String(r[c.key] ?? ""), fontSize:7.5}))));
    content.push({table:{headerRows:1, widths:sh.cols.map(()=>"*"), body}, layout:"lightHorizontalLines"});
  });
  const dd = {
    pageSize:"A4", pageOrientation: landscape?"landscape":"portrait", pageMargins:[28,28,28,36],
    footer: (cur,total) => ({text:`Trang ${cur}/${total}`, alignment:"center", fontSize:8, color:"#999", margin:[0,6,0,0]}),
    content, defaultStyle:{font:"Roboto"}
  };
  pdfMake.createPdf(dd).download(`${report.filename}.pdf`);
}
/* ----- giao diện ----- */
function rpProjOptions(withAll, selected){
  const ph = `<option value="" ${!selected?"selected":""}>${withAll?"— Tất cả dự án —":"— chọn dự án —"}</option>`;
  return ph + M.projects.map(p => `<option value="${esc(p.id)}" ${p.id===selected?"selected":""}>${esc(p.name)}</option>`).join("");
}
function rpFiltersHtml(){
  const f = S.rp.draft, t = S.rp.type;
  if(t==="week") return `
    <div class="field"><label>Dự án</label><select class="inp" data-act="rpproj">${rpProjOptions(true, f.project)}</select></div>
    <div class="field"><label>Nhân sự</label><select class="inp" data-act="rpstaff"><option value="__all__" ${f.staff==="__all__"?"selected":""}>— Tất cả nhân sự —</option>${M.staff.map(s=>`<option ${s.name===f.staff?"selected":""}>${esc(s.name)}</option>`).join("")}</select></div>
    <div class="field"><label>Tuần</label>${weekNav()}</div>`;
  if(t==="plan") return `
    <div class="field"><label>Dự án <span style="color:var(--bad)">*</span></label><select class="inp" data-act="rpproj">${rpProjOptions(false, f.project)}</select></div>
    <div class="field"><label>Trạng thái đầu việc</label><select class="inp" data-act="rpstatus"><option ${f.status==="Tất cả"?"selected":""}>Tất cả</option>${ST_ALL.map(s=>`<option ${s===f.status?"selected":""}>${esc(s)}</option>`).join("")}</select></div>`;
  return `<div class="field"><label>Loại dự án</label><select class="inp" data-act="rpptype">${PLAN_FILTERS.map(pf=>`<option value="${esc(pf.key)}" ${pf.key===f.ptype?"selected":""}>${esc(pf.label)}</option>`).join("")}</select></div>`;
}
function rpPreviewHtml(report){
  if(!report.sheets.some(sh=>sh.rows.length))
    return `<div class="empty"><b>Chưa có dữ liệu</b>${S.rp.type==="plan" && !S.rp.applied.project ? "Chọn một dự án ở bên trái để xem trước." : "Không có dữ liệu phù hợp với điều kiện đã chọn."}</div>`;
  return report.sheets.filter(sh=>sh.cols.length).map(sh => `
    <div style="margin-bottom:14px"><div class="small muted" style="margin-bottom:6px">${esc(sh.name)} · ${sh.rows.length} dòng</div>
    <div class="tbl-wrap" style="max-height:360px; overflow:auto"><table><thead><tr>${sh.cols.map(c=>`<th>${esc(c.header)}</th>`).join("")}</tr></thead>
    <tbody>${sh.rows.length ? sh.rows.map(r=>`<tr>${sh.cols.map(c=>`<td>${esc(r[c.key])}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${sh.cols.length}" class="muted">Không có dữ liệu.</td></tr>`}</tbody></table></div></div>`).join("");
}
function viewReports(){
  rpInit();
  const report = rpBuild();
  let h = `<div class="head"><div><h1>Báo cáo</h1><div class="sub">Tạo, xem trước và xuất báo cáo Excel / PDF</div></div></div>`;
  h += `<section class="panel" style="margin-bottom:14px"><div class="panel-b" style="padding:12px 16px">
    <div class="chips" role="group" aria-label="Chọn mẫu báo cáo">${RP_TEMPLATES.map(t=>`<button class="chip-btn" data-act="rptpl" data-type="${t.type}" aria-pressed="${S.rp.type===t.type}" title="${esc(t.hint)}">${esc(t.label)}</button>`).join("")}</div>
    </div></section>`;
  h += `<div class="rp-cols">
    <section class="panel"><div class="panel-h"><h2>Thiết lập điều kiện</h2></div><div class="panel-b">
      ${rpFiltersHtml()}
      <div class="toolbar" style="margin-top:10px"><button class="btn primary" data-act="rpapply">Áp dụng</button><button class="btn" data-act="rpreset">Đặt lại</button></div>
    </div></section>
    <section class="panel"><div class="panel-h"><h2>Xem trước</h2><span class="muted small">${esc(report.period||"")}</span></div><div class="panel-b">
      ${rpPreviewHtml(report)}
    </div></section>
  </div>`;
  const canExport = report.sheets.some(sh=>sh.rows.length) && !S.rp.busy;
  h += `<section class="panel" style="margin-top:14px"><div class="panel-b" style="display:flex; align-items:center; gap:14px; flex-wrap:wrap">
    <div style="flex:1; min-width:220px"><div class="data-t">${esc(report.title)}</div><div class="small muted">${esc(report.scope||"–")}${report.period?" · "+esc(report.period):""}</div></div>
    <div class="toolbar">
      <button class="btn primary" data-act="rpexcel" ${canExport?"":"disabled"}>${S.rp.busy==="xlsx"?"Đang tạo…":"Xuất Excel"}</button>
      <button class="btn" data-act="rppdf" ${canExport?"":"disabled"}>${S.rp.busy==="pdf"?"Đang tạo…":"Xuất PDF"}</button>
    </div></div></section>`;
  return h;
}
ACTIONS["rptpl"] = el => { const type = el.dataset.type; S.rp.type = type; S.rp.draft = rpDefaults(type); S.rp.applied = {...S.rp.draft}; render(); };
ACTIONS["rpapply"] = () => { S.rp.applied = {...S.rp.draft}; render(); };
ACTIONS["rpreset"] = () => { S.rp.draft = rpDefaults(S.rp.type); S.rp.applied = {...S.rp.draft}; render(); };
ACTIONS["rpexcel"] = async () => {
  if(S.rp.busy) return; S.rp.busy = "xlsx"; render();
  try{ await rpEnsureExcel(); await rpExportExcel(rpBuild()); toast("Đã xuất file Excel"); }
  catch(e){ console.error(e); rpExcelReady = null; toast("Không tạo được file Excel. Kiểm tra kết nối mạng rồi thử lại."); }
  finally{ S.rp.busy = ""; render(); }
};
ACTIONS["rppdf"] = async () => {
  if(S.rp.busy) return; S.rp.busy = "pdf"; render();
  try{ await rpEnsurePdf(); rpExportPdf(rpBuild()); toast("Đã xuất file PDF"); }
  catch(e){ console.error(e); rpPdfReady = null; toast("Không tạo được file PDF. Kiểm tra kết nối mạng rồi thử lại."); }
  finally{ S.rp.busy = ""; render(); }
};
main.addEventListener("change", e => {
  const el = e.target, a = el.dataset.act; if(!a) return; rpInit();
  if(a==="rpproj") S.rp.draft.project = el.value;
  else if(a==="rpstaff") S.rp.draft.staff = el.value;
  else if(a==="rpstatus") S.rp.draft.status = el.value;
  else if(a==="rpptype") S.rp.draft.ptype = el.value;
  else return;
  render();
});
VIEW_RENDER.reports = viewReports;
ICONS.reports = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/><path d="m15 15 2 2 3-4" stroke="var(--teal)"/></svg>';
{
  const i = VIEWS.findIndex(v=>v.id==="dash");
  VIEWS.splice(i+1, 0, {id:"reports", label:"Báo cáo", icon:"reports"});
}
