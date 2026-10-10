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
/* 3 tab ngang hàng: Báo cáo tuần (dữ liệu Nhập theo tuần/Tải tuần) · Báo cáo dự án (1 dự án theo kỳ,
   không có phần nhân sự) · Báo cáo tổng hợp (toàn phòng theo kỳ). Không còn "mẫu báo cáo" lồng trong tab
   nữa – mỗi tab chỉ có đúng 1 nội dung. */
function rpInit(){
  if(!S.rp) S.rp = {tab:"week", busy:"", exportOpen:false,
    wkProject:"", wkStaff:"__all__",
    pjProject:"", pjKind:"week", pjAnchor:S.week,
    ovKind:"week", ovAnchor:S.week, ovPtype:"Tất cả"};
}
/* ----- xây dữ liệu báo cáo: dùng chung cho cả xem trước lẫn xuất file, để luôn khớp nhau ----- */
function rpBuildWeek(){
  const w = S.week, project = S.rp.wkProject, staff = S.rp.wkStaff;
  const projName = project ? ((M.pById.get(project)||{}).name || "(dự án đã xoá)") : "Tất cả dự án";
  const staffLabel = staff==="__all__" ? "Tất cả nhân sự" : staff;
  const es = M.entries.filter(e=>e.week===w && (!project||e.projectId===project) && (staff==="__all__"||e.person===staff))
    .sort((a,b)=>a.person.localeCompare(b.person,"vi") || (a.type||"").localeCompare(b.type||"","vi"));
  const cols1 = ["Người","Dự án","Loại","Đầu việc","Việc đã làm","Quy mô","Số giờ","Độ phức tạp","Workload","Trạng thái","Ma sát","Nguyên nhân","Vướng mắc"];
  const rows1 = es.map(e => ({
    "Người": e.person, "Dự án": (M.pById.get(e.projectId)||{}).name || "(đã xoá)", "Loại": e.type,
    "Đầu việc": e.ref ? planShortName(e.ref.t.dv) : "(đã xoá)", "Việc đã làm": e.work || "",
    "Quy mô": e.qm ?? "", "Số giờ": e.hours ?? "", "Độ phức tạp": e.pt ?? "", "Workload": e.wl ?? "",
    "Trạng thái": e.status || "", "Ma sát": e.ms ?? "", "Nguyên nhân": e.nn || "", "Vướng mắc": e.note || ""
  }));
  const staffList = staff==="__all__" ? M.staff : M.staff.filter(s=>s.name===staff);
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
/* ----- Báo cáo dự án: 1 dự án cụ thể theo kỳ (tuần/tháng), kiểu KPI + bảng giống Báo cáo tổng hợp
   nhưng không có phần nhân sự (chỉ 1 dự án thì không cần tải nhân sự toàn phòng). Quá hạn/Sắp hạn/Rủi ro
   tính theo tình trạng hiện tại; chỉ "Xong trong kỳ" lọc thật theo kỳ đã chọn (giống rpBuildOverview()). */
function rpBuildProject(){
  const pid = S.rp.pjProject, kind = S.rp.pjKind||"week", anchor = S.rp.pjAnchor||S.week;
  const P = periodInfo(anchor, kind);
  const p = pid ? M.pById.get(pid) : null;
  if(!p) return {empty:true, kind, anchor, P};
  const weekSet = new Set(P.weeks);
  const tasks = p._tasks;
  const late = tasks.filter(t=>t.warns.some(w=>w[1]==="Quá hạn")).length;
  const soonN = tasks.filter(t=>t.warns.some(w=>w[1]==="Sắp đến hạn")).length;
  const stuckN = tasks.filter(t=>t.status==="Đang vướng").length;
  const doneN = tasks.filter(t=>t.done && weekSet.has(t.done)).length;
  const maxMs = tasks.reduce((a,t)=>Math.max(a,t.ms||0),0);
  const risk = (late>0 || maxMs>=4) ? "Cao" : (soonN>0 || stuckN>0 || maxMs>=2) ? "Trung bình" : "Thấp";
  const stats = [
    {v:pct(p._prog), l:"Tiến độ"},
    {v:tasks.length, l:"Tổng đầu việc"},
    {v:late, l:"Quá hạn", bad:late>0},
    {v:soonN, l:"Sắp hạn"},
    {v:stuckN, l:"Đang vướng", bad:stuckN>0},
    {v:doneN, l:"Xong trong kỳ"},
    {v:risk, l:"Rủi ro", bad:risk==="Cao"}
  ];
  const rows = tasks.map(t => ({
    phase:t.phase||"", name:planShortName(t.dv), owner:t.owner||"–", doers:(t.doers||[]).join(", ")||"–",
    deadline:t.deadline, wl:t.wl, pr:t.pr, status:t.status, upd:t.upd||"", warns:(t.warns||[]).map(w=>w[1]).join(", ")
  }));
  return {empty:false, p, kind, anchor, P, stats, rows, risk};
}
function rpBuildProjectExport(){
  const pr = rpBuildProject();
  if(pr.empty) return {title:"Báo cáo dự án", scope:"Chưa chọn dự án", period:"", filename:"Bao-cao-du-an", sheets:[{name:"Đầu việc", cols:[], rows:[]}]};
  const colsSum = ["Chỉ số","Giá trị"], rowsSum = pr.stats.map(s=>({"Chỉ số":s.l, "Giá trị":String(s.v)}));
  const cols = ["Hạng mục","Đầu việc","Phụ trách","Thực hiện","Deadline","Workload","Ưu tiên","Trạng thái","Cập nhật mới nhất","Cảnh báo"];
  const rows = pr.rows.map(t => ({"Hạng mục":t.phase, "Đầu việc":t.name, "Phụ trách":t.owner, "Thực hiện":t.doers,
    "Deadline":t.deadline?dmy(t.deadline):"", "Workload":t.wl ?? "", "Ưu tiên":t.pr||"", "Trạng thái":t.status||"",
    "Cập nhật mới nhất":t.upd, "Cảnh báo":t.warns}));
  return {
    title:`Báo cáo dự án – ${pr.p.name} – ${pr.P.label}`, scope:`${pr.p.name} (${pr.p.type})`,
    period:rpRangeText(pr), filename:`Bao-cao-du-an-${slug(pr.p.name)}-${pr.kind}-${pr.anchor}`,
    sheets:[
      {name:"Tổng quan", cols:colsSum.map(h=>({header:h,key:h})), rows:rowsSum},
      {name:"Đầu việc", cols:cols.map(h=>({header:h,key:h})), rows}
    ]
  };
}
/* ----- Báo cáo tổng hợp phòng QLDA: tình hình dự án + tải nhân sự toàn phòng theo kỳ (tuần/tháng) -----
   Quá hạn/Sắp hạn/Rủi ro tính theo tình trạng HIỆN TẠI (M.today), không truy hồi lại đúng thời điểm cuối
   kỳ đã chọn – vì hệ thống không lưu ảnh chụp tiến độ ở các mốc trước, đúng như dòng "Số liệu tính tại
   thời điểm xuất" đã nói rõ ở đầu trang. Chỉ "Xong trong kỳ" là thật sự lọc theo kỳ (t.done nằm trong
   period.weeks). */
function rpRangeText(ov){
  const w0 = ov.P.weeks[0], w1 = ov.P.weeks[ov.P.weeks.length-1];
  return w0 ? `Từ ${dmy(w0)} đến ${dmy(addDays(w1,6))}` : "";
}
function rpBuildOverview(){
  const kind = S.rp.ovKind || "week", anchor = S.rp.ovAnchor || S.week, ptype = S.rp.ovPtype || "Tất cả";
  const P = periodInfo(anchor, kind);
  const weekSet = new Set(P.weeks);
  const all = M.projects.filter(p => p.type!=="Nội bộ" && planMatchFilter(p, ptype) && (p.tasks||[]).length);
  const running = all.filter(p => !p._allDone);
  const avgProg = running.length ? running.reduce((a,p)=>a+(p._prog||0),0)/running.length : 0;
  const lateProjectsN = running.filter(p=>p._late>0).length;
  const lateTasksN = running.reduce((a,p)=>a+(p._late||0),0);
  const doneInPeriod = p => p._tasks.filter(t=>t.done && weekSet.has(t.done)).length;
  const doneAllN = running.reduce((a,p)=>a+doneInPeriod(p),0);
  const riskOf = p => (p._late>0 || p._maxms>=4) ? "Cao" : (p._soon>0 || p._stuck>0 || p._maxms>=2) ? "Trung bình" : "Thấp";
  const riskOpenN = running.filter(p=>riskOf(p)!=="Thấp").length, riskHighN = running.filter(p=>riskOf(p)==="Cao").length;
  const staffRows = M.staff.map(s => {
    const es = M.entries.filter(e=>e.person===s.name && weekSet.has(e.week) && e.status!=="Hủy" && e.wl!=null);
    const wl = es.reduce((a,e)=>a+e.wl,0), cap = s.cap*P.weeks.length, u = cap ? wl/cap : null;
    return {name:s.name, n:es.length, wl, cap, u};
  });
  const overloadedN = staffRows.filter(s=>s.u!=null && s.u>1).length;
  const stats = [
    {v:running.length, l:"Dự án đang chạy"},
    {v:pct(avgProg), l:"% HT trung bình"},
    {v:lateProjectsN, l:"Chậm tiến độ", bad:lateProjectsN>0},
    {v:lateTasksN, l:"Việc quá hạn", bad:lateTasksN>0},
    {v:doneAllN, l:"Xong trong kỳ"},
    {v:`${riskOpenN}/${riskHighN}`, l:"Rủi ro mở / Cao+", bad:riskHighN>0},
    {v:overloadedN, l:"Nhân sự quá tải", bad:overloadedN>0}
  ];
  const statusOf = p => p._allDone ? "Hoàn thành" : (p._prog>0 ? "Đang thực hiện" : "Chưa bắt đầu");
  const assessOf = p => {
    if(p._late>0) return {bad:true, text:`Chậm: ${p._late} việc quá hạn`};
    if(p._stuck>0) return {bad:true, text:`${p._stuck} việc đang vướng`};
    if(p._soon>0) return {bad:false, text:`${p._soon} việc sắp đến hạn`};
    return {bad:false, text:"Đúng tiến độ"};
  };
  /* Rủi ro lớn nhất: đầu việc đang mở có ma sát cao nhất mà có ghi chú vướng mắc thật (không bịa) – nếu
     không có ghi chú nào thì nêu đầu việc quá hạn ưu tiên P1 gấp nhất, không có nữa thì để trống. */
  const biggestRisk = p => {
    const open = p._tasks.filter(t=>OPEN.has(t.status));
    const noted = open.filter(t=>t.note).sort((a,b)=>(b.ms||0)-(a.ms||0))[0];
    if(noted) return `[${noted.id}] ${noted.nn?noted.nn+": ":""}${noted.note}`;
    const lateP1 = open.filter(t=>t.pr==="P1" && t.warns.some(w=>w[1]==="Quá hạn")).sort((a,b)=>String(a.deadline||"9").localeCompare(String(b.deadline||"9")))[0];
    if(lateP1) return `[${lateP1.id}] ${planShortName(lateP1.dv)} – quá hạn ${dm(lateP1.deadline)}, ưu tiên P1`;
    return "";
  };
  const projRows = running.map(p => ({
    name:p.name, type:p.type, owner:p.owner||"–", status:statusOf(p), prog:p._prog,
    late:p._late, soon:p._soon, done:doneInPeriod(p), assess:assessOf(p), riskText:biggestRisk(p)
  })).sort((a,b)=>(b.assess.bad-a.assess.bad) || b.late-a.late);
  return {kind, anchor, P, ptype, stats, projRows, staffRows};
}
function rpBuildOverviewExport(){
  const ov = rpBuildOverview();
  const colsSum = ["Chỉ số","Giá trị"], rowsSum = ov.stats.map(s=>({"Chỉ số":s.l, "Giá trị":String(s.v)}));
  const colsProj = ["Dự án","Loại","PM","Trạng thái","Tiến độ","Quá hạn","Sắp hạn","Xong kỳ","Đánh giá","Rủi ro lớn nhất"];
  const rowsProj = ov.projRows.map(p => ({"Dự án":p.name,"Loại":p.type,"PM":p.owner,"Trạng thái":p.status,"Tiến độ":pct(p.prog),
    "Quá hạn":p.late,"Sắp hạn":p.soon,"Xong kỳ":p.done,"Đánh giá":p.assess.text,"Rủi ro lớn nhất":p.riskText||""}));
  const colsStaff = ["Nhân sự","Số đầu việc","Workload","Capacity","Mức sử dụng","Trạng thái"];
  const rowsStaff = ov.staffRows.map(s => ({"Nhân sự":s.name,"Số đầu việc":s.n,"Workload":fmt1(s.wl),"Capacity":fmt1(s.cap),
    "Mức sử dụng":s.u!=null?pct(s.u):"", "Trạng thái": !s.n?"Chưa nhập":s.u>1?"Quá tải":s.u!=null&&s.u>=.8?"Tải cao":"Bình thường"}));
  return {
    title:`Báo cáo tổng hợp phòng QLDA – ${ov.P.label}`, scope:ov.ptype,
    period:rpRangeText(ov), filename:`Bao-cao-tong-hop-${ov.kind}-${ov.anchor}`,
    sheets:[
      {name:"Tổng quan", cols:colsSum.map(h=>({header:h,key:h})), rows:rowsSum},
      {name:"Tình hình dự án", cols:colsProj.map(h=>({header:h,key:h})), rows:rowsProj},
      {name:"Tải nhân sự", cols:colsStaff.map(h=>({header:h,key:h})), rows:rowsStaff}
    ]
  };
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
function rpWeekToolbarHtml(){
  const fieldW = `style="margin:0; min-width:190px"`;
  return `
    <div class="field" ${fieldW}><label>Dự án</label><select class="inp" data-act="rpproj">${rpProjOptions(true, S.rp.wkProject)}</select></div>
    <div class="field" ${fieldW}><label>Nhân sự</label><select class="inp" data-act="rpstaff"><option value="__all__" ${S.rp.wkStaff==="__all__"?"selected":""}>— Tất cả nhân sự —</option>${M.staff.map(s=>`<option ${s.name===S.rp.wkStaff?"selected":""}>${esc(s.name)}</option>`).join("")}</select></div>
    <div class="field" style="margin:0"><label>Tuần</label>
      <div class="rp-weekbox">
        <button type="button" data-act="wk" data-d="-7" aria-label="Tuần trước">‹</button>
        <span class="rp-weekbox-lbl">Tuần ${isoWeek(S.week)} · ${dm(S.week)} – ${dmy(addDays(S.week,6))}</span>
        <button type="button" data-act="wk" data-d="7" aria-label="Tuần sau">›</button>
        <span class="rp-weekbox-ico">${ICONS.calendar}</span>
      </div></div>`;
}
function rpPreviewHtml(report){
  if(!report.sheets.some(sh=>sh.rows.length))
    return `<div class="empty"><b>Chưa có dữ liệu</b>Không có dữ liệu phù hợp với điều kiện đã chọn.</div>`;
  return report.sheets.filter(sh=>sh.cols.length).map(sh => `
    <div style="margin-bottom:14px"><div class="small muted" style="margin-bottom:6px">${esc(sh.name)} · ${sh.rows.length} dòng</div>
    <div class="tbl-wrap" style="max-height:360px; overflow:auto"><table><thead><tr>${sh.cols.map(c=>`<th>${esc(c.header)}</th>`).join("")}</tr></thead>
    <tbody>${sh.rows.length ? sh.rows.map(r=>`<tr>${sh.cols.map(c=>`<td>${esc(r[c.key])}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${sh.cols.length}" class="muted">Không có dữ liệu.</td></tr>`}</tbody></table></div></div>`).join("");
}
/* Nút "Xuất báo cáo ▾" dùng chung cho cả 2 tab – trạng thái mở/đóng lưu ở S.rp.exportOpen (không dùng
   DOM state vì #main bị vẽ lại toàn bộ mỗi lần render(), sẽ mất trạng thái nếu lưu ở ngoài S). */
function rpExportBtnHtml(canExport){
  const busy = S.rp.busy;
  return `<div class="rp-export">
    <button class="btn primary" type="button" data-act="rpexportmenu" ${canExport?"":"disabled"} aria-haspopup="true" aria-expanded="${!!S.rp.exportOpen}">${busy?(busy==="xlsx"?"Đang tạo Excel…":"Đang tạo PDF…"):"Xuất báo cáo"} ${ICONS.chevronDown}</button>
    ${S.rp.exportOpen ? `<div class="tb-dropdown tb-dropdown-r">
      <button class="tb-item" type="button" data-act="rpexcel"><b>Xuất Excel (.xlsx)</b></button>
      <button class="tb-item" type="button" data-act="rppdf"><b>Xuất PDF (.pdf)</b></button>
    </div>` : ""}</div>`;
}
function rpOverviewHtml(){
  const ov = rpBuildOverview();
  const canExport = !S.rp.busy && (ov.projRows.length || ov.staffRows.length);
  let h = `<section class="panel" style="margin-bottom:14px"><div class="panel-b" style="display:flex; align-items:center; gap:14px; flex-wrap:nowrap; overflow-x:auto">
    <div class="seg-in" role="group" aria-label="Kỳ báo cáo" style="flex:none">${[["week","Theo tuần"],["month","Theo tháng"]].map(([k,l])=>`<button type="button" data-act="rpovkind" data-k="${k}" aria-pressed="${ov.kind===k}">${l}</button>`).join("")}</div>
    <div class="rp-weekbox" role="group" aria-label="${ov.kind==="week"?"Chọn tuần":"Chọn tháng"}" style="flex:none">
      <button type="button" data-act="rpovnav" data-d="-1" aria-label="Kỳ trước">‹</button>
      <span class="rp-weekbox-lbl">${esc(ov.P.label)}</span>
      <button type="button" data-act="rpovnav" data-d="1" aria-label="Kỳ sau">›</button>
      <span class="rp-weekbox-ico">${ICONS.calendar}</span>
    </div>
    <div style="flex:1; min-width:8px"></div>
    <div style="flex:none">${rpExportBtnHtml(canExport)}</div>
  </div></section>`;
  h += `<section class="panel"><div class="panel-b">
    <div style="text-align:center; margin-bottom:18px">
      <div style="font-size:18px; font-weight:800; letter-spacing:.01em">BÁO CÁO TỔNG HỢP PHÒNG QLDA – ${esc(ov.P.label.toUpperCase())}</div>
      <div class="small muted" style="margin-top:4px">${esc(rpRangeText(ov))} · lập ngày ${dmy(todayISO())}</div>
    </div>
    <div class="band" style="margin-bottom:20px">${ov.stats.map(s=>`<div class="stat ${s.bad?"bad":""}"><div class="v">${esc(String(s.v))}</div><div class="l">${esc(s.l)}</div></div>`).join("")}</div>
    <div class="rp-sec"><div class="rp-sec-h">1. Tình hình các dự án</div>
      <div class="tbl-wrap"><table><thead><tr><th>Dự án</th><th>PM</th><th>Trạng thái</th><th>Tiến độ</th><th class="num">Quá hạn</th><th class="num">Sắp hạn</th><th class="num">Xong kỳ</th><th>Đánh giá</th><th>Rủi ro lớn nhất</th></tr></thead>
      <tbody>${ov.projRows.length ? ov.projRows.map(p=>`<tr>
        <td class="cell-main">${esc(p.name)}<div class="cell-sub">${esc(p.type)}</div></td>
        <td>${esc(p.owner)}</td><td>${esc(p.status)}</td><td>${pct(p.prog)}</td>
        <td class="num" style="${p.late?'color:var(--bad); font-weight:700':''}">${p.late}</td>
        <td class="num">${p.soon}</td><td class="num">${p.done}</td>
        <td style="${p.assess.bad?'color:var(--bad)':''}">${esc(p.assess.text)}</td>
        <td class="small">${p.riskText?esc(p.riskText):'<span class="muted">–</span>'}</td></tr>`).join("") : `<tr><td colspan="9" class="muted" style="padding:14px">Không có dự án đang chạy phù hợp.</td></tr>`}</tbody></table></div></div>
    <div class="rp-sec" style="margin-top:20px"><div class="rp-sec-h">2. Tải công việc nhân sự</div>
      <div class="tbl-wrap"><table><thead><tr><th>Nhân sự</th><th class="num">Số đầu việc</th><th class="num">Workload</th><th class="num">Capacity</th><th>Mức sử dụng</th><th>Trạng thái</th></tr></thead>
      <tbody>${ov.staffRows.map(s=>{ const st = !s.n?["mute","Chưa nhập"]:s.u>1?["bad","Quá tải"]:s.u>=.8?["warn","Tải cao"]:["ok","Bình thường"];
        return `<tr><td class="cell-main">${esc(s.name)}</td><td class="num">${s.n}</td><td class="num">${fmt1(s.wl)}</td><td class="num">${fmt1(s.cap)}</td>
        <td>${s.u!=null?pct(s.u):"–"}</td><td><span class="pill ${st[0]}">${st[1]}</span></td></tr>`; }).join("")}</tbody></table></div></div>
  </div></section>`;
  return h;
}
function rpWeekHtml(){
  const report = rpBuildWeek();
  const canExport = report.sheets.some(sh=>sh.rows.length) && !S.rp.busy;
  let h = `<section class="panel" style="margin-bottom:14px"><div class="panel-b" style="display:flex; align-items:center; gap:16px; flex-wrap:wrap">
    ${rpWeekToolbarHtml()}
    <div style="flex:1"></div>
    ${rpExportBtnHtml(canExport)}
  </div></section>`;
  h += `<section class="panel"><div class="panel-h"><h2>Xem trước</h2><span class="muted small">${esc(report.period||"")}</span></div><div class="panel-b">
    <div style="margin-bottom:10px"><div class="data-t">${esc(report.title)}</div><div class="small muted">${esc(report.scope||"–")}</div></div>
    ${rpPreviewHtml(report)}
  </div></section>`;
  return h;
}
function rpProjectHtml(){
  const pr = rpBuildProject();
  const canExport = !pr.empty && pr.rows.length && !S.rp.busy;
  let h = `<section class="panel" style="margin-bottom:14px"><div class="panel-b" style="display:flex; align-items:center; gap:14px; flex-wrap:nowrap; overflow-x:auto">
    <select class="inp" data-act="rppjproj" style="flex:none; min-width:220px">${rpProjOptions(false, S.rp.pjProject)}</select>
    <div class="seg-in" role="group" aria-label="Kỳ báo cáo" style="flex:none">${[["week","Theo tuần"],["month","Theo tháng"]].map(([k,l])=>`<button type="button" data-act="rppjkind" data-k="${k}" aria-pressed="${pr.kind===k}">${l}</button>`).join("")}</div>
    <div class="rp-weekbox" role="group" aria-label="${pr.kind==="week"?"Chọn tuần":"Chọn tháng"}" style="flex:none">
      <button type="button" data-act="rppjnav" data-d="-1" aria-label="Kỳ trước">‹</button>
      <span class="rp-weekbox-lbl">${esc(pr.P.label)}</span>
      <button type="button" data-act="rppjnav" data-d="1" aria-label="Kỳ sau">›</button>
      <span class="rp-weekbox-ico">${ICONS.calendar}</span>
    </div>
    <div style="flex:1; min-width:8px"></div>
    <div style="flex:none">${rpExportBtnHtml(canExport)}</div>
  </div></section>`;
  if(pr.empty){
    h += `<section class="panel"><div class="panel-b"><div class="empty"><b>Chưa chọn dự án</b>Chọn một dự án ở trên để xem báo cáo.</div></div></section>`;
    return h;
  }
  const riskTone = pr.risk==="Cao" ? "bad" : pr.risk==="Trung bình" ? "warn" : "ok";
  h += `<section class="panel"><div class="panel-b">
    <div style="text-align:center; margin-bottom:18px">
      <div style="font-size:18px; font-weight:800; letter-spacing:.01em">BÁO CÁO DỰ ÁN – ${esc(pr.p.name.toUpperCase())} – ${esc(pr.P.label.toUpperCase())}</div>
      <div class="small muted" style="margin-top:4px">${esc(pr.p.type)}${pr.p.owner?" · PM: "+esc(pr.p.owner):""} · ${esc(rpRangeText(pr))} · lập ngày ${dmy(todayISO())}</div>
    </div>
    <div class="band" style="margin-bottom:20px">${pr.stats.map(s=>`<div class="stat ${s.bad?"bad":""}"><div class="v">${esc(String(s.v))}</div><div class="l">${esc(s.l)}</div></div>`).join("")}</div>
    <div class="rp-sec"><div class="rp-sec-h">1. Danh sách đầu việc</div>
      <div class="tbl-wrap"><table><thead><tr><th>Hạng mục</th><th>Đầu việc</th><th>Phụ trách</th><th>Thực hiện</th><th>Deadline</th><th class="num">Workload</th><th>Ưu tiên</th><th>Trạng thái</th><th>Cập nhật mới nhất</th><th>Cảnh báo</th></tr></thead>
      <tbody>${pr.rows.length ? pr.rows.map(t=>`<tr>
        <td class="small muted">${esc(t.phase)}</td><td class="cell-main">${esc(t.name)}</td><td>${esc(t.owner)}</td><td>${esc(t.doers)}</td>
        <td>${t.deadline?dmy(t.deadline):"–"}</td><td class="num">${t.wl??"–"}</td><td>${t.pr?`<span class="pill info">${esc(t.pr)}</span>`:"–"}</td>
        <td>${t.status?stPill(t.status):"–"}</td><td class="small">${t.upd?esc(t.upd):"–"}</td>
        <td class="small" style="${t.warns?'color:var(--bad)':''}">${t.warns?esc(t.warns):"–"}</td></tr>`).join("") : `<tr><td colspan="10" class="muted" style="padding:14px">Dự án chưa có đầu việc nào.</td></tr>`}</tbody></table></div></div>
  </div></section>`;
  return h;
}
function viewReports(){
  /* Tạm khoá với tài khoản nhân viên — chỉ trưởng phòng dùng được ở giai đoạn này */
  if(!S.canEdit) return `<div class="head"><div><h1>Báo cáo</h1></div></div>
    <section class="panel"><div class="empty"><b>Tính năng đang phát triển</b>Trang Báo cáo hiện đang hoàn thiện, chỉ dành cho trưởng phòng.</div></section>`;
  rpInit();
  let h = `<div class="head"><div><h1>Báo cáo</h1></div></div>`;
  h += `<div class="rp-tabs" role="tablist">
    <button type="button" role="tab" data-act="rptab" data-tab="week" aria-selected="${S.rp.tab==="week"}">Báo cáo tuần</button>
    <button type="button" role="tab" data-act="rptab" data-tab="project" aria-selected="${S.rp.tab==="project"}">Báo cáo dự án</button>
    <button type="button" role="tab" data-act="rptab" data-tab="overview" aria-selected="${S.rp.tab==="overview"}">Báo cáo tổng hợp</button>
  </div>`;
  if(S.rp.tab==="project") h += rpProjectHtml();
  else if(S.rp.tab==="overview") h += rpOverviewHtml();
  else h += rpWeekHtml();
  return h;
}
ACTIONS["rptab"] = el => { S.rp.tab = el.dataset.tab; S.rp.exportOpen = false; render(); };
ACTIONS["rppjkind"] = el => { S.rp.pjKind = el.dataset.k; render(); };
ACTIONS["rppjnav"] = el => { S.rp.pjAnchor = shiftAnchor(S.rp.pjAnchor||S.week, S.rp.pjKind||"week", +el.dataset.d); render(); };
ACTIONS["rpovkind"] = el => { S.rp.ovKind = el.dataset.k; render(); };
ACTIONS["rpovnav"] = el => { S.rp.ovAnchor = shiftAnchor(S.rp.ovAnchor||S.week, S.rp.ovKind||"week", +el.dataset.d); render(); };
ACTIONS["rpexportmenu"] = () => { S.rp.exportOpen = !S.rp.exportOpen; render(); };
function rpBuildForTab(){
  if(S.rp.tab==="project") return rpBuildProjectExport();
  if(S.rp.tab==="overview") return rpBuildOverviewExport();
  return rpBuildWeek();
}
ACTIONS["rpexcel"] = async () => {
  if(S.rp.busy) return; S.rp.busy = "xlsx"; S.rp.exportOpen = false; render();
  try{ await rpEnsureExcel(); await rpExportExcel(rpBuildForTab()); toast("Đã xuất file Excel"); }
  catch(e){ console.error(e); rpExcelReady = null; toast("Không tạo được file Excel. Kiểm tra kết nối mạng rồi thử lại."); }
  finally{ S.rp.busy = ""; render(); }
};
ACTIONS["rppdf"] = async () => {
  if(S.rp.busy) return; S.rp.busy = "pdf"; S.rp.exportOpen = false; render();
  try{ await rpEnsurePdf(); rpExportPdf(rpBuildForTab()); toast("Đã xuất file PDF"); }
  catch(e){ console.error(e); rpPdfReady = null; toast("Không tạo được file PDF. Kiểm tra kết nối mạng rồi thử lại."); }
  finally{ S.rp.busy = ""; render(); }
};
main.addEventListener("change", e => {
  const el = e.target, a = el.dataset.act; if(!a) return; rpInit();
  if(a==="rpproj") S.rp.wkProject = el.value;
  else if(a==="rpstaff") S.rp.wkStaff = el.value;
  else if(a==="rppjproj") S.rp.pjProject = el.value;
  else return;
  render();
});
/* Bấm ra ngoài khung "Xuất báo cáo" thì tự đóng lại (menu nằm trong #main nên không dùng chung cơ chế
   tbCloseAll() của dropdown header – #main bị vẽ lại mỗi lần render() nên phải tự đóng bằng S.rp.exportOpen) */
document.addEventListener("click", e => {
  if(S.rp && S.rp.exportOpen && !e.target.closest(".rp-export")){ S.rp.exportOpen = false; render(); }
});
VIEW_RENDER.reports = viewReports;
ICONS.reports = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/><path d="m15 15 2 2 3-4" stroke="var(--teal)"/></svg>';
{
  const i = VIEWS.findIndex(v=>v.id==="dash");
  VIEWS.splice(i+1, 0, {id:"reports", label:"Báo cáo", icon:"reports"});
}
