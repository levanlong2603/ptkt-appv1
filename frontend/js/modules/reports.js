"use strict";
/* Module mở rộng: Báo cáo – tạo, xem trước và xuất báo cáo ra Excel (.xlsx thật, qua ExcelJS) hoặc
   PDF (chụp đúng khối DOM #rp-print đang hiển thị bằng html2canvas rồi dán vào từng trang A4 bằng jsPDF –
   PDF luôn giống hệt bảng xem trước trên web). Không có dashboard/biểu đồ riêng ở đây –
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
/* PDF xuất bằng cách chụp đúng khối DOM đang hiển thị (html2canvas) rồi dán ảnh vào từng trang A4 (jsPDF) –
   đảm bảo PDF giống hệt bảng xem trước trên web (gộp ô, màu sắc…), không tự dựng lại bảng lần hai. */
function rpEnsurePdf(){ return rpPdfReady || (rpPdfReady = rpLoadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js").then(()=>rpLoadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js"))); }
/* 3 tab ngang hàng: Báo cáo tuần (dữ liệu Nhập theo tuần/Tải tuần) · Báo cáo dự án (1 dự án theo kỳ,
   không có phần nhân sự) · Báo cáo tổng hợp dự án (toàn bộ dự án đang chạy theo kỳ, chỉ 1 bảng "Tình hình
   các dự án" – không có bảng tải nhân sự). Không còn "mẫu báo cáo" lồng trong tab nữa – mỗi tab chỉ có
   đúng 1 nội dung. */
function rpInit(){
  if(!S.rp) S.rp = {tab:"week", busy:"", exportOpen:false,
    wkType:"", wkStaff:"__all__", wkView:"input",
    pjProject:"", pjPtype:"Tất cả", pjKind:"week", pjAnchor:S.week,
    ovKind:"week", ovAnchor:S.week, ovPtype:"Tất cả"};
}
/* Vướng mắc tại đúng thời điểm tuần w (không phải lượt nhập "mới nhất tính tới hiện tại" như t.nn/model.js):
   duyệt mọi lượt nhập của đúng đầu việc đó, theo thứ tự tuần tăng dần, tính TỚI HẾT tuần w – ghi chú nào
   nhập sau thì đè ghi chú trước ("mang sang" các tuần sau nếu tuần đó không nhập lại), hễ gặp lượt đánh dấu
   Hoàn thành/Hủy thì coi như đã giải quyết, xoá sạch về rỗng (không mang tiếp các ghi chú trước đó sang nữa)
   dù đúng lượt đó có nhập thêm ghi chú (Hoàn thành luôn thắng). Nhờ duyệt tới đúng tuần w (không phải tuần
   hiện tại) nên xem báo cáo của một tuần cũ vẫn ra đúng vướng mắc tại thời điểm tuần đó, không bị đè bởi
   các tuần sau này. */
function rpIssueAt(pid, tid, w){
  const list = M.entries.filter(e=>e.projectId===pid && e.taskId===tid && e.week<=w).sort((a,b)=>a.week.localeCompare(b.week));
  let note = "";
  for(const e of list){
    if(e.status==="Hoàn thành" || e.status==="Hủy"){ note = ""; continue; }
    if(e.note) note = e.note;
  }
  return note;
}
/* ----- xây dữ liệu báo cáo: dùng chung cho cả xem trước lẫn xuất file, để luôn khớp nhau ----- */
function rpBuildWeek(){
  const w = S.week, type = S.rp.wkType, staff = S.rp.wkStaff;
  const typeLabel = type ? type : "Tất cả loại";
  const staffLabel = staff==="__all__" ? "Tất cả nhân sự" : staff;
  const showPerson = staff==="__all__";
  const es = M.entries.filter(e=>e.week===w && (!type||e.type===type) && (staff==="__all__"||e.person===staff));
  /* Phân cấp Người thực hiện (chỉ khi xem "Tất cả nhân sự") → Dự án → Hạng mục → Đầu việc, theo đúng mẫu
     bảng ở Báo cáo dự án (xem rpBuildProject()/rpProjectHtml()) – "Chi tiết thực hiện" ở đây lấy từ việc
     đã làm TRONG TUẦN (e.work), khác với Báo cáo dự án lấy "Nội dung chi tiết" tĩnh của đầu việc. */
  const rows = es.map(e => {
    const p = e.ref ? e.ref.p : M.pById.get(e.projectId);
    const t = e.ref ? e.ref.t : null;
    /* e.ref.t là task THÔ lấy từ taskMap (chưa qua derive()), không có field "phase" lưu sẵn – field này
       luôn được tính động bằng phaseOf(t.dv) (xem model.js, p._tasks) nên phải tính lại giống hệt ở đây,
       không đọc t.phase trực tiếp (lúc nào cũng rỗng → rơi về "Khác"). */
    const phaseCode = t ? phaseOf(t.dv) : "";
    const phaseName = (p && t) ? ((p._phases.find(ph=>ph.code===phaseCode)||{}).name || phaseCode || "Khác") : "Khác";
    return {
      person: e.person, projectId: e.projectId, projectName: p ? p.name : "(dự án đã xoá)",
      phaseCode, phase: phaseName,
      name: t ? planShortName(t.dv) : "(đầu việc đã xoá)",
      detail: e.work || "", deadline: t ? t.deadline : null, status: e.status || "",
      /* Vướng mắc tính TẠI ĐÚNG TUẦN w đang xem (mang sang từ tuần trước nếu tuần này chưa hoàn thành và
         không nhập lại), không chỉ lấy ghi chú của riêng lượt nhập tuần này – xem rpIssueAt() ở trên.
         Nguyên nhân (e.nn) giờ đi cùng Ma sát, không ghép chung với Vướng mắc nữa. */
      issue: rpIssueAt(e.projectId, e.taskId, w)
    };
  }).sort((a,b) => a.person.localeCompare(b.person,"vi") || a.projectName.localeCompare(b.projectName,"vi") || a.phaseCode.localeCompare(b.phaseCode,"vi"));
  const cols1 = showPerson
    ? ["Người thực hiện","Dự án","Hạng mục","Đầu việc","Chi tiết thực hiện","Deadline theo HĐ","Trạng thái thực hiện","Vướng mắc","Hướng giải quyết"]
    : ["Dự án","Hạng mục","Đầu việc","Chi tiết thực hiện","Deadline theo HĐ","Trạng thái thực hiện","Vướng mắc","Hướng giải quyết"];
  const rows1 = rows.map(r => {
    const o = {};
    if(showPerson) o["Người thực hiện"] = r.person;
    o["Dự án"] = r.projectName; o["Hạng mục"] = r.phase; o["Đầu việc"] = r.name;
    o["Chi tiết thực hiện"] = r.detail; o["Deadline theo HĐ"] = r.deadline?dmy(r.deadline):"";
    o["Trạng thái thực hiện"] = r.status; o["Vướng mắc"] = r.issue; o["Hướng giải quyết"] = "";
    return o;
  });
  const staffList = staff==="__all__" ? M.staff : M.staff.filter(s=>s.name===staff);
  const cols2 = ["Nhân sự","Số đầu việc","Workload","Capacity","Mức sử dụng","Hoàn thành","Trạng thái"];
  const rows2 = staffList.map(s => {
    const L = loadFor(s.name, w), u = s.cap ? L.wl/s.cap : null, d = ratioOf(L.es);
    const st = !L.es.length ? "Chưa nhập tuần" : L.missing ? "Thiếu quy mô" : u>1 ? "Quá tải" : u>=.8 ? "Tải cao" : "Còn khả năng";
    return {"Nhân sự": s.name, "Số đầu việc": L.es.length, "Workload": fmt1(L.wl), "Capacity": fmt1(s.cap),
      "Mức sử dụng": pct(u), "Hoàn thành": L.es.length ? pct(d.ratio) : "–", "Trạng thái": st};
  });
  /* Cột cần gộp ô (merge) khi xuất file, đúng cấp bậc đang gộp ở bảng xem trước (rpWeekRowsHtml):
     Người thực hiện → Dự án → Hạng mục (chỉ hiện cột Người thực hiện khi showPerson). rawRows dùng
     "rows" (chưa làm phẳng) để so khoá gộp, cùng thứ tự với rows1 nên chỉ số dòng khớp nhau. */
  const merges1 = showPerson
    ? [{col:0, keys:["person"]}, {col:1, keys:["person","projectId"]}, {col:2, keys:["person","projectId","phaseCode"]}]
    : [{col:0, keys:["projectId"]}, {col:1, keys:["projectId","phaseCode"]}];
  /* Tên file xuất = đúng dòng tiêu đề lớn đang hiện trên màn hình (xem rpWeekHtml()) – "BÁO CÁO TUẦN"
     hay "BÁO CÁO TẢI TUẦN" tuỳ chế độ xem, cộng với kỳ báo cáo. */
  const titleLine = (S.rp.wkView==="load" ? "Báo cáo tải tuần" : "Báo cáo tuần");
  const period = `Tuần ${isoWeek(w)} (${dm(w)} – ${dmy(addDays(w,6))})`;
  return {
    title:titleLine, scope:`${typeLabel} · ${staffLabel}`,
    period,
    filename:slug(`${titleLine} – ${period}`),
    showPerson, rows,
    sheets:[
      {name:"Chi tiết", cols:cols1.map(h=>({header:h,key:h})), rows:rows1, merges:merges1, rawRows:rows},
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
  /* Sắp theo đúng thứ tự hạng mục của quy trình (p._phases), không theo thứ tự lưu thô trong p._tasks –
     để các dòng cùng hạng mục nằm liền nhau, làm cơ sở gộp ô (rowspan) ở rpProjectHtml() bên dưới. */
  const phaseOrder = new Map(p._phases.map((ph,i)=>[ph.code,i]));
  const phaseName = new Map(p._phases.map(ph=>[ph.code,ph.name]));
  const rows = [...tasks].sort((a,b)=>(phaseOrder.get(a.phase)??999)-(phaseOrder.get(b.phase)??999)).map(t => ({
    phase: phaseName.get(t.phase) || t.phase || "Khác", name:planShortName(t.dv),
    detail: t.detail || t.upd || "", deadline:t.deadline, status:t.status,
    /* Vướng mắc chỉ lấy ghi chú (t.note) – Nguyên nhân (t.nn) giờ đi cùng Ma sát, không ghép chung nữa. */
    issue: t.note || ""
  }));
  return {empty:false, p, kind, anchor, P, stats, rows, risk};
}
function rpBuildProjectExport(){
  const pr = rpBuildProject();
  if(pr.empty) return {title:"Báo cáo dự án", scope:"Chưa chọn dự án", period:"", filename:"Bao-cao-du-an", sheets:[{name:"Đầu việc", cols:[], rows:[]}]};
  const colsSum = ["Chỉ số","Giá trị"], rowsSum = pr.stats.map(s=>({"Chỉ số":s.l, "Giá trị":String(s.v)}));
  const cols = ["Hạng mục","Đầu việc","Chi tiết thực hiện","Deadline theo HĐ","Trạng thái thực hiện","Vướng mắc","Hướng giải quyết"];
  const rows = pr.rows.map(t => ({"Hạng mục":t.phase, "Đầu việc":t.name, "Chi tiết thực hiện":t.detail,
    "Deadline theo HĐ":t.deadline?dmy(t.deadline):"", "Trạng thái thực hiện":t.status||"", "Vướng mắc":t.issue, "Hướng giải quyết":""}));
  const title = `Báo cáo dự án – ${pr.p.name} – ${pr.P.label}`;
  return {
    title, scope:`${pr.p.name} (${pr.p.type})`,
    period:rpRangeText(pr), filename:slug(title),
    sheets:[
      {name:"Tổng quan", cols:colsSum.map(h=>({header:h,key:h})), rows:rowsSum},
      {name:"Đầu việc", cols:cols.map(h=>({header:h,key:h})), rows, merges:[{col:0, keys:["phase"]}], rawRows:pr.rows}
    ]
  };
}
/* ----- Báo cáo tổng hợp dự án: tình hình toàn bộ dự án đang chạy theo kỳ (tuần/tháng) – chỉ 1 bảng,
   không có phần tải nhân sự (staffRows vẫn tính để lấy số liệu "Nhân sự quá tải" ở dải KPI, không hiện
   thành bảng riêng nữa). Quá hạn/Sắp hạn/Rủi ro tính theo tình trạng HIỆN TẠI (M.today), không truy hồi
   lại đúng thời điểm cuối kỳ đã chọn – vì hệ thống không lưu ảnh chụp tiến độ ở các mốc trước, đúng như
   dòng "Số liệu tính tại thời điểm xuất" đã nói rõ ở đầu trang. Chỉ "Xong trong kỳ" là thật sự lọc theo
   kỳ (t.done nằm trong period.weeks). */
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
    if(noted) return `[${noted.id}] ${noted.note}`;
    const lateP1 = open.filter(t=>t.pr==="P1" && t.warns.some(w=>w[1]==="Quá hạn")).sort((a,b)=>String(a.deadline||"9").localeCompare(String(b.deadline||"9")))[0];
    if(lateP1) return `[${lateP1.id}] ${planShortName(lateP1.dv)} – quá hạn ${dm(lateP1.deadline)}, ưu tiên P1`;
    return "";
  };
  const projRows = running.map(p => ({
    name:p.name, type:p.type, owner:p.owner||"–", se:p.se||"–", status:statusOf(p), prog:p._prog,
    late:p._late, soon:p._soon, done:doneInPeriod(p), assess:assessOf(p), riskText:biggestRisk(p),
    milestones:p.milestones||"", progress:p.progress||"", situation:p.situation||"", proposal:p.proposal||""
  })).sort((a,b)=>(b.assess.bad-a.assess.bad) || b.late-a.late);
  return {kind, anchor, P, ptype, stats, projRows, staffRows};
}
function rpBuildOverviewExport(){
  const ov = rpBuildOverview();
  const colsSum = ["Chỉ số","Giá trị"], rowsSum = ov.stats.map(s=>({"Chỉ số":s.l, "Giá trị":String(s.v)}));
  const colsProj = ["STT","Tên dự án","Người phụ trách","SE","Mốc HĐ","Tiến độ hiện tại","Vướng mắc","Đề xuất"];
  const rowsProj = ov.projRows.map((p,i) => ({"STT":i+1, "Tên dự án":p.name, "Người phụ trách":p.owner, "SE":p.se,
    "Mốc HĐ":p.milestones, "Tiến độ hiện tại":p.progress, "Vướng mắc":p.situation, "Đề xuất":p.proposal}));
  const title = `Báo cáo tổng hợp dự án – ${ov.P.label}`;
  return {
    title, scope:ov.ptype,
    period:rpRangeText(ov), filename:slug(title),
    sheets:[
      {name:"Tổng quan", cols:colsSum.map(h=>({header:h,key:h})), rows:rowsSum},
      {name:"Tình hình dự án", cols:colsProj.map(h=>({header:h,key:h})), rows:rowsProj}
    ]
  };
}
/* ----- xuất file ----- */
/* Kiểu lưới Excel giống hệt bảng xem trước trên web (.rp-sec-grn/.rp-sec-xl): đầu cột xanh lá nhạt
   (#D7E8C7) chữ đậm tối màu, kẻ ô đủ 4 cạnh – áp dụng cho mọi sheet để đồng bộ hình thức xuất file. */
const RP_XL_HEAD_BG = "FFD7E8C7", RP_XL_HEAD_FG = "FF1A1A1A", RP_XL_BORDER = "FFB9D6A0";
async function rpExportExcel(report){
  const wb = new ExcelJS.Workbook();
  wb.creator = "NGSI · Phòng Kỹ thuật"; wb.created = new Date();
  for(const sh of report.sheets){
    const ws = wb.addWorksheet(sh.name.slice(0,31), {views:[{state:"frozen", ySplit:1}]});
    if(!sh.cols.length) continue;
    ws.columns = sh.cols.map(c => ({header:c.header, key:c.key, width: Math.min(42, Math.max(10, c.header.length*1.3))}));
    /* Tô màu/định dạng TỪNG Ô đầu cột (không dùng row.fill/row.font trên cả Row) – ExcelJS/Excel tô cả
       dòng tới hết XFD nếu set style ở cấp Row, khiến mảng màu lan ra quá các cột đang dùng (lỗi "thừa"
       đã gặp). Cũng bỏ hẳn autoFilter (mũi tên lọc) vì không cần cho một bản báo cáo xuất tĩnh. */
    for(let i=1;i<=sh.cols.length;i++){
      const cell = ws.getRow(1).getCell(i);
      cell.font = {bold:true, color:{argb:RP_XL_HEAD_FG}};
      cell.fill = {type:"pattern", pattern:"solid", fgColor:{argb:RP_XL_HEAD_BG}};
      cell.alignment = {vertical:"middle", horizontal:"center", wrapText:true};
    }
    for(const r of sh.rows) ws.addRow(r);
    /* Kẻ ô đủ 4 cạnh + bật Wrap Text cho mọi ô dữ liệu (đầu cột đã bật riêng ở trên), đúng kiểu lưới Excel
       giấy của phòng – không bật thì Excel chỉ hiện chữ tràn ra ngoài/ cắt mất khi đóng cột, không tự
       xuống dòng dù dòng đã cao sẵn do ô gộp bên cạnh. */
    const thin = {style:"thin", color:{argb:RP_XL_BORDER}};
    for(let ri=2; ri<=1+sh.rows.length; ri++){
      const row = ws.getRow(ri);
      for(let ci=1; ci<=sh.cols.length; ci++){
        const cell = row.getCell(ci);
        cell.border = {top:thin, left:thin, bottom:thin, right:thin};
        cell.alignment = {vertical:"top", wrapText:true};
      }
    }
    for(let ci=1; ci<=sh.cols.length; ci++) ws.getRow(1).getCell(ci).border = {top:thin, left:thin, bottom:thin, right:thin};
    /* Gộp ô (merge) các cột phân cấp (Người thực hiện/Dự án/Hạng mục…) giống hệt bảng xem trước trên màn
       hình (rowspan ở rpWeekRowsHtml/rpProjectHtml) – không lặp lại giá trị ở từng dòng con khi xuất. */
    if(sh.merges && sh.rawRows){
      for(const m of sh.merges){
        const col = m.col+1;
        let i=0;
        while(i<sh.rawRows.length){
          const span = rpSpan(sh.rawRows, i, m.keys);
          if(span>1){
            ws.mergeCells(2+i, col, 1+i+span, col);
            ws.getCell(2+i, col).alignment = {vertical:"top", wrapText:true};
          }
          i += span || 1;
        }
      }
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  download(`${report.filename}.xlsx`, new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
}
/* Chụp đúng khối #rp-print đang hiển thị (tiêu đề + dải KPI + bảng, đã gộp ô sẵn bằng rowspan trên màn
   hình) thành ảnh rồi dán vào từng trang A4 – PDF luôn giống hệt bảng xem trước, không tự dựng lại bảng
   lần hai (tránh lệch bố cục như cách dựng bảng thủ công bằng pdfmake trước đây). */
async function rpExportPdf(report){
  const el = document.getElementById("rp-print");
  if(!el) return;
  const canvas = await html2canvas(el, {scale:2, useCORS:true, backgroundColor:"#ffffff"});
  const { jsPDF } = window.jspdf;
  const landscape = canvas.width > canvas.height;
  const pdf = new jsPDF(landscape ? "l" : "p", "mm", "a4");
  const pageWidth = landscape ? 297 : 210, pageHeight = landscape ? 210 : 297;
  const imgHeight = (canvas.height * pageWidth) / canvas.width;
  const imgData = canvas.toDataURL("image/png");
  let heightLeft = imgHeight, position = 0;
  pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
  heightLeft -= pageHeight;
  while(heightLeft > 0){
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
    heightLeft -= pageHeight;
  }
  pdf.save(`${report.filename}.pdf`);
}
/* ----- giao diện ----- */
function rpProjOptions(withAll, selected, ptype){
  const ph = `<option value="" ${!selected?"selected":""}>${withAll?"— Tất cả dự án —":"— chọn dự án —"}</option>`;
  const list = ptype ? M.projects.filter(p=>planMatchFilter(p, ptype)) : M.projects;
  return ph + list.map(p => `<option value="${esc(p.id)}" ${p.id===selected?"selected":""}>${esc(p.name)}</option>`).join("");
}
function rpWeekToolbarHtml(){
  /* Giữ đúng 3 trường, cùng kiểu thanh công cụ trần (không nhãn) như 2 tab Báo cáo dự án/Báo cáo tổng
     hợp dự án – ô Tuần trước, rồi 2 ô chọn lọc. */
  return `
    <div class="rp-weekbox" role="group" aria-label="Chọn tuần" style="flex:none">
      <button type="button" data-act="wk" data-d="-7" aria-label="Tuần trước">‹</button>
      <span class="rp-weekbox-lbl">Tuần ${isoWeek(S.week)} · ${dm(S.week)} – ${dmy(addDays(S.week,6))}</span>
      <button type="button" data-act="wk" data-d="7" aria-label="Tuần sau">›</button>
      <span class="rp-weekbox-ico">${ICONS.calendar}</span>
    </div>
    <select class="inp" data-act="rpwktype" style="flex:none; width:auto; min-width:160px"><option value="" ${!S.rp.wkType?"selected":""}>— Tất cả loại —</option>${TYPES.map(t=>`<option ${t===S.rp.wkType?"selected":""}>${esc(t)}</option>`).join("")}</select>
    <select class="inp" data-act="rpstaff" style="flex:none; width:auto; min-width:180px"><option value="__all__" ${S.rp.wkStaff==="__all__"?"selected":""}>— Tất cả nhân sự —</option>${M.staff.map(s=>`<option ${s.name===S.rp.wkStaff?"selected":""}>${esc(s.name)}</option>`).join("")}</select>`;
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
  const canExport = !S.rp.busy && ov.projRows.length;
  let h = `<section class="panel" style="margin-bottom:14px; overflow:visible"><div class="panel-b" style="display:flex; align-items:center; gap:14px">
    <div style="display:flex; align-items:center; gap:14px; flex:1; min-width:0; overflow-x:auto; padding:2px">
      <div class="seg-in" role="group" aria-label="Kỳ báo cáo" style="flex:none">${[["week","Theo tuần"],["month","Theo tháng"]].map(([k,l])=>`<button type="button" data-act="rpovkind" data-k="${k}" aria-pressed="${ov.kind===k}">${l}</button>`).join("")}</div>
      <div class="rp-weekbox" role="group" aria-label="${ov.kind==="week"?"Chọn tuần":"Chọn tháng"}" style="flex:none">
        <button type="button" data-act="rpovnav" data-d="-1" aria-label="Kỳ trước">‹</button>
        <span class="rp-weekbox-lbl">${esc(ov.P.label)}</span>
        <button type="button" data-act="rpovnav" data-d="1" aria-label="Kỳ sau">›</button>
        <span class="rp-weekbox-ico">${ICONS.calendar}</span>
      </div>
      <select class="inp" data-act="rpovptype" style="flex:none; width:auto; min-width:150px">${PLAN_FILTERS.map(pf=>`<option value="${esc(pf.key)}" ${pf.key===ov.ptype?"selected":""}>${esc(pf.label)}</option>`).join("")}</select>
    </div>
    <div style="flex:none">${rpExportBtnHtml(canExport)}</div>
  </div></section>`;
  h += `<section class="panel" id="rp-print"><div class="panel-b">
    <div style="text-align:center; margin-bottom:18px">
      <div style="font-size:18px; font-weight:800; letter-spacing:.01em">BÁO CÁO TỔNG HỢP DỰ ÁN – ${esc(ov.P.label.toUpperCase())}</div>
      <div class="small muted" style="margin-top:4px">${esc(rpRangeText(ov))} · lập ngày ${dmy(todayISO())}</div>
    </div>
    <div class="band" style="margin-bottom:20px">${ov.stats.map(s=>`<div class="stat ${s.bad?"bad":""}"><div class="v">${esc(String(s.v))}</div><div class="l">${esc(s.l)}</div></div>`).join("")}</div>
    <div class="rp-sec rp-sec-xl">
      <div class="tbl-wrap"><table style="table-layout:fixed"><thead><tr>
        <th style="width:4%">STT</th><th style="width:14%">Tên dự án</th><th style="width:11%">Người phụ trách</th><th style="width:9%">SE</th>
        <th style="width:15%">Mốc HĐ</th><th style="width:16%">Tiến độ hiện tại</th><th style="width:15.5%">Vướng mắc</th><th style="width:15.5%">Đề xuất</th>
      </tr></thead>
      <tbody>${ov.projRows.length ? ov.projRows.map((p,i)=>`<tr>
        <td class="small muted">${i+1}</td>
        <td class="cell-main">${esc(p.name)}</td>
        <td>${esc(p.owner)}</td><td>${esc(p.se)}</td>
        <td class="small" style="white-space:pre-wrap">${p.milestones?esc(p.milestones):'<span class="muted">–</span>'}</td>
        <td class="small" style="white-space:pre-wrap">${p.progress?esc(p.progress):'<span class="muted">–</span>'}</td>
        <td class="small" style="white-space:pre-wrap">${p.situation?esc(p.situation):'<span class="muted">–</span>'}</td>
        <td class="small" style="white-space:pre-wrap">${p.proposal?esc(p.proposal):'<span class="muted">–</span>'}</td></tr>`).join("") : `<tr><td colspan="8" class="muted" style="padding:14px">Không có dự án đang chạy phù hợp.</td></tr>`}</tbody></table></div></div>
  </div></section>`;
  return h;
}
/* Gộp ô (rowspan) nhiều cấp cho bảng kiểu Báo cáo dự án – trả về 0 nếu dòng này gộp vào dòng liền trước
   (cùng giá trị ở mọi khoá từ cấp 0 tới hết "keys"), ngược lại trả về số dòng liên tiếp cùng nhóm.
   rows PHẢI đã sắp xếp theo đúng thứ tự các khoá trong keys trước khi gọi hàm này. */
function rpSpan(rows, i, keys){
  const eq = j => keys.every(k=>rows[j][k]===rows[i][k]);
  if(i>0 && eq(i-1)) return 0;
  let n=1; while(i+n<rows.length && eq(i+n)) n++;
  return n;
}
/* Bảng "Tải tuần" (Workload/Capacity theo người) – cùng kiểu .rp-sec-grn với bảng chi tiết đầu việc,
   thay vì dùng rpPreviewHtml() chung (nền trắng, không màu, có thêm dòng chú thích "Tổng hợp theo người
   · N dòng" không cần thiết ở đây vì tiêu đề lớn phía trên đã đủ ngữ cảnh). */
function rpWeekLoadHtml(sh){
  if(!sh || !sh.rows.length) return `<div class="empty"><b>Chưa có dữ liệu</b>Không có nhân sự phù hợp với điều kiện đã chọn.</div>`;
  /* Cột 1 = Nhân sự (tên), cột cuối = Trạng thái (chữ) – các cột ở giữa (Số đầu việc/Workload/Capacity/
     Mức sử dụng/Hoàn thành) đều là số/%, đánh dấu class="num" để căn giữa theo yêu cầu chung của trang. */
  const isNum = i => i>0 && i<sh.cols.length-1;
  return `<div class="rp-sec rp-sec-grn">
    <div class="tbl-wrap"><table><thead><tr>${sh.cols.map((c,i)=>`<th${isNum(i)?' class="num"':""}>${esc(c.header)}</th>`).join("")}</tr></thead>
    <tbody>${sh.rows.map(r=>`<tr>${sh.cols.map((c,i)=>`<td class="${i===0?"cell-main":isNum(i)?"num":""}">${esc(r[c.key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
}
function rpWeekRowsHtml(report){
  const rows = report.rows;
  if(!rows.length) return `<div class="empty"><b>Chưa có dữ liệu</b>Không có dữ liệu phù hợp với điều kiện đã chọn.</div>`;
  /* Dùng biến --ok-soft/... (màu nền nhạt đã tính sẵn trong theme.css) thay vì color-mix() động: html2canvas
     (dùng để chụp #rp-print khi xuất PDF) không hiểu được computed style của color-mix() (vẫn giữ nguyên
     dạng hàm khi đọc qua getComputedStyle, không phải màu rgb cuối cùng) nên sẽ báo lỗi xuất PDF nếu dùng. */
  const td = (content, span, tone) => span===0 ? "" : `<td class="cell-main" rowspan="${span}" style="vertical-align:top${tone?`; background:var(--${tone}-soft)`:""}">${content}</td>`;
  return `<div class="rp-sec rp-sec-grn">
    <div class="tbl-wrap"><table style="table-layout:fixed"><thead><tr>
      ${report.showPerson?'<th style="width:9%">Người thực hiện</th>':""}<th style="width:${report.showPerson?13:16}%">Dự án</th><th style="width:10%">Hạng mục</th><th style="width:13%">Đầu việc</th>
      <th style="width:18%">Chi tiết thực hiện</th><th style="width:9%">Deadline theo HĐ</th><th style="width:10%">Trạng thái thực hiện</th><th style="width:9%">Vướng mắc</th><th style="width:9%">Hướng giải quyết</th>
    </tr></thead>
    <tbody>${rows.map((r,i) => {
      const spPerson = report.showPerson ? rpSpan(rows, i, ["person"]) : null;
      const spProj = rpSpan(rows, i, report.showPerson?["person","projectId"]:["projectId"]);
      const spPhase = rpSpan(rows, i, report.showPerson?["person","projectId","phaseCode"]:["projectId","phaseCode"]);
      return `<tr>
        ${report.showPerson?td(esc(r.person), spPerson):""}
        ${td(esc(r.projectName), spProj)}
        ${td(esc(r.phase), spPhase, "ok")}
        <td style="vertical-align:top">${esc(r.name)}</td>
        <td class="small" style="white-space:pre-wrap; vertical-align:top">${r.detail?esc(r.detail):'<span class="muted">–</span>'}</td>
        <td style="vertical-align:top">${r.deadline?dmy(r.deadline):"–"}</td>
        <td style="vertical-align:top">${r.status?stPill(r.status):"–"}</td>
        <td class="small" style="white-space:pre-wrap; vertical-align:top">${r.issue?esc(r.issue):'<span class="muted">–</span>'}</td>
        <td class="small muted" style="vertical-align:top">–</td></tr>`;
    }).join("")}</tbody></table></div></div>`;
}
function rpWeekHtml(){
  const report = rpBuildWeek();
  const canExport = report.sheets.some(sh=>sh.rows.length) && !S.rp.busy;
  const view = S.rp.wkView||"input";
  let h = `<section class="panel" style="margin-bottom:14px; overflow:visible"><div class="panel-b" style="display:flex; align-items:center; gap:14px">
    <div style="display:flex; align-items:center; gap:14px; flex:1; min-width:0; overflow-x:auto; padding:2px">
      <div class="seg-in" role="group" aria-label="Nội dung xem" style="flex:none">
        <button type="button" data-act="rpwkview" data-v="input" aria-pressed="${view==="input"}">Nhập theo tuần</button>
        <button type="button" data-act="rpwkview" data-v="load" aria-pressed="${view==="load"}">Tải tuần</button>
      </div>
      ${rpWeekToolbarHtml()}
    </div>
    <div style="flex:none">${rpExportBtnHtml(canExport)}</div>
  </div></section>`;
  /* Bỏ panel-h "Xem trước" + dòng data-t/scope rời – đồng bộ với kiểu Báo cáo tổng hợp dự án: tiêu đề lớn
     căn giữa + phụ đề ngay trong cùng 1 khung, rồi vào thẳng bảng, không có nhãn "Xem trước" nào nữa. */
  const titleLine = view==="load" ? "BÁO CÁO TẢI TUẦN" : "BÁO CÁO TUẦN";
  h += `<section class="panel" id="rp-print"><div class="panel-b">
    <div style="text-align:center; margin-bottom:18px">
      <div style="font-size:18px; font-weight:800; letter-spacing:.01em">${titleLine} – ${esc((report.period||"").toUpperCase())}</div>
      <div class="small muted" style="margin-top:4px">${esc(report.scope||"")} · lập ngày ${dmy(todayISO())}</div>
    </div>
    ${view==="load" ? rpWeekLoadHtml(report.sheets[1]) : rpWeekRowsHtml(report)}
  </div></section>`;
  return h;
}
function rpProjectHtml(){
  const pr = rpBuildProject();
  const canExport = !pr.empty && pr.rows.length && !S.rp.busy;
  let h = `<section class="panel" style="margin-bottom:14px; overflow:visible"><div class="panel-b" style="display:flex; align-items:center; gap:14px">
    <div style="display:flex; align-items:center; gap:14px; flex:1; min-width:0; overflow-x:auto; padding:2px">
      <div class="seg-in" role="group" aria-label="Kỳ báo cáo" style="flex:none">${[["week","Theo tuần"],["month","Theo tháng"]].map(([k,l])=>`<button type="button" data-act="rppjkind" data-k="${k}" aria-pressed="${pr.kind===k}">${l}</button>`).join("")}</div>
      <div class="rp-weekbox" role="group" aria-label="${pr.kind==="week"?"Chọn tuần":"Chọn tháng"}" style="flex:none">
        <button type="button" data-act="rppjnav" data-d="-1" aria-label="Kỳ trước">‹</button>
        <span class="rp-weekbox-lbl">${esc(pr.P.label)}</span>
        <button type="button" data-act="rppjnav" data-d="1" aria-label="Kỳ sau">›</button>
        <span class="rp-weekbox-ico">${ICONS.calendar}</span>
      </div>
      <select class="inp" data-act="rppjptype" style="flex:none; width:auto; min-width:150px">${PLAN_FILTERS.map(pf=>`<option value="${esc(pf.key)}" ${pf.key===S.rp.pjPtype?"selected":""}>${esc(pf.label)}</option>`).join("")}</select>
      <select class="inp" data-act="rppjproj" style="flex:none; width:auto; min-width:220px">${rpProjOptions(false, S.rp.pjProject, S.rp.pjPtype)}</select>
    </div>
    <div style="flex:none">${rpExportBtnHtml(canExport)}</div>
  </div></section>`;
  if(pr.empty){
    h += `<section class="panel"><div class="panel-b"><div class="empty"><b>Chưa chọn dự án</b>Chọn một dự án ở trên để xem báo cáo.</div></div></section>`;
    return h;
  }
  const riskTone = pr.risk==="Cao" ? "bad" : pr.risk==="Trung bình" ? "warn" : "ok";
  h += `<section class="panel" id="rp-print"><div class="panel-b">
    <div style="text-align:center; margin-bottom:18px">
      <div style="font-size:18px; font-weight:800; letter-spacing:.01em">BÁO CÁO DỰ ÁN – ${esc(pr.p.name.toUpperCase())} – ${esc(pr.P.label.toUpperCase())}</div>
      <div class="small muted" style="margin-top:4px">${esc(pr.p.type)}${pr.p.owner?" · TM: "+esc(pr.p.owner):""} · ${esc(rpRangeText(pr))} · lập ngày ${dmy(todayISO())}</div>
    </div>
    <div class="band" style="margin-bottom:20px">${pr.stats.map(s=>`<div class="stat ${s.bad?"bad":""}"><div class="v">${esc(String(s.v))}</div><div class="l">${esc(s.l)}</div></div>`).join("")}</div>
    <div class="rp-sec rp-sec-grn">
      <div class="tbl-wrap"><table style="table-layout:fixed"><thead><tr>
        <th style="width:11%">Hạng mục</th><th style="width:16%">Đầu việc</th><th style="width:24%">Chi tiết thực hiện</th>
        <th style="width:11%">Deadline theo HĐ</th><th style="width:12%">Trạng thái thực hiện</th><th style="width:13%">Vướng mắc</th><th style="width:13%">Hướng giải quyết</th>
      </tr></thead>
      <tbody>${pr.rows.length ? pr.rows.map((t,i)=>{
        /* Gộp ô (rowspan) cột Hạng mục cho các dòng liền nhau cùng hạng mục, giống bảng mẫu Excel –
           pr.rows đã sắp theo đúng thứ tự hạng mục ở rpBuildProject() nên chỉ cần so dòng liền trước. */
        const sameAsPrev = i>0 && pr.rows[i-1].phase===t.phase;
        let span = 0;
        if(!sameAsPrev){ span = 1; while(i+span<pr.rows.length && pr.rows[i+span].phase===t.phase) span++; }
        return `<tr>
        ${sameAsPrev ? "" : `<td class="cell-main" rowspan="${span}" style="vertical-align:top; background:var(--ok-soft)">${esc(t.phase)}</td>`}
        <td class="cell-main" style="vertical-align:top">${esc(t.name)}</td>
        <td class="small" style="white-space:pre-wrap; vertical-align:top">${t.detail?esc(t.detail):'<span class="muted">–</span>'}</td>
        <td style="vertical-align:top">${t.deadline?dmy(t.deadline):"–"}</td>
        <td style="vertical-align:top">${t.status?stPill(t.status):"–"}</td>
        <td class="small" style="white-space:pre-wrap; vertical-align:top">${t.issue?esc(t.issue):'<span class="muted">–</span>'}</td>
        <td class="small muted" style="vertical-align:top">–</td></tr>`;
      }).join("") : `<tr><td colspan="7" class="muted" style="padding:14px">Dự án chưa có đầu việc nào.</td></tr>`}</tbody></table></div></div>
  </div></section>`;
  return h;
}
function viewReports(){
  rpInit();
  let h = `<div class="head"><div><h1>Báo cáo</h1></div></div>`;
  h += `<div class="rp-tabs" role="tablist">
    <button type="button" role="tab" data-act="rptab" data-tab="week" aria-selected="${S.rp.tab==="week"}">Báo cáo tuần</button>
    <button type="button" role="tab" data-act="rptab" data-tab="project" aria-selected="${S.rp.tab==="project"}">Báo cáo dự án</button>
    <button type="button" role="tab" data-act="rptab" data-tab="overview" aria-selected="${S.rp.tab==="overview"}">Báo cáo tổng hợp dự án</button>
  </div>`;
  if(S.rp.tab==="project") h += rpProjectHtml();
  else if(S.rp.tab==="overview") h += rpOverviewHtml();
  else h += rpWeekHtml();
  return h;
}
ACTIONS["rptab"] = el => { S.rp.tab = el.dataset.tab; S.rp.exportOpen = false; render(); };
ACTIONS["rppjkind"] = el => { S.rp.pjKind = el.dataset.k; render(); };
ACTIONS["rppjnav"] = el => { S.rp.pjAnchor = shiftAnchor(S.rp.pjAnchor||S.week, S.rp.pjKind||"week", +el.dataset.d); render(); };
ACTIONS["rpwkview"] = el => { S.rp.wkView = el.dataset.v; render(); };
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
  try{ await rpEnsurePdf(); await rpExportPdf(rpBuildForTab()); toast("Đã xuất file PDF"); }
  catch(e){ console.error(e); rpPdfReady = null; toast("Không tạo được file PDF. Kiểm tra kết nối mạng rồi thử lại."); }
  finally{ S.rp.busy = ""; render(); }
};
main.addEventListener("change", e => {
  const el = e.target, a = el.dataset.act; if(!a) return; rpInit();
  if(a==="rpwktype") S.rp.wkType = el.value;
  else if(a==="rpstaff") S.rp.wkStaff = el.value;
  else if(a==="rppjproj") S.rp.pjProject = el.value;
  else if(a==="rppjptype"){
    S.rp.pjPtype = el.value;
    /* Đổi loại mà dự án đang chọn không còn khớp bộ lọc mới (đã biến mất khỏi danh sách) thì bỏ chọn,
       tránh giữ một dự án "vô hình" không khớp với lựa chọn Loại đang hiện trên màn hình. */
    const cur = S.rp.pjProject && M.pById.get(S.rp.pjProject);
    if(cur && !planMatchFilter(cur, S.rp.pjPtype)) S.rp.pjProject = "";
  }
  else if(a==="rpovptype") S.rp.ovPtype = el.value;
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
