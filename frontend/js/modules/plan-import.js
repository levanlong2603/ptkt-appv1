"use strict";
/* Module mở rộng: Nhập dự án từ Excel – nút "Nhập từ Excel" ở tab Kế hoạch dự án (plan.js), tạo 1 DỰ ÁN MỚI
   từ bảng theo dõi dự án của phòng (đúng mẫu mà Báo cáo dự án đang xuất ra):
     STT | Hạng mục | Đầu việc | Chi tiết thực hiện | Deadline theo HĐ | Trạng thái thực hiện | Vướng mắc | Hướng giải quyết
   Đọc .xlsx bằng ExcelJS (tải lười, dùng chung rpEnsureExcel() với reports.js). Chỉ trưởng phòng/phó phòng/
   admin dùng được (máy chủ chỉ cho FULL_ROLES tạo dự án mới – RULES "own-project").

   Ánh xạ vào dự án:
     - 1 đầu việc trong ứng dụng = 1 ô "Đầu việc" của Excel; mọi dòng "Chi tiết thực hiện" của ô đó gộp vào
       "Nội dung chi tiết" (mỗi dòng 1 ý) vì ứng dụng chỉ có 1 hạn + 1 trạng thái cho mỗi đầu việc:
       Deadline = ngày muộn nhất trong các dòng; Trạng thái = tổng hợp các dòng (pimpStatus()).
     - Hạng mục + Đầu việc được đối chiếu với quy trình chuẩn của loại dự án (Cài đặt → Quy trình) để dùng
       đúng tên chuẩn; không khớp thì giữ nguyên tên trong Excel, đặt vào đúng hạng mục nếu nhận ra hạng mục.
     - Vướng mắc → task.init.note (vướng mắc ban đầu – model.js chỉ dùng khi đầu việc chưa có lượt nhập tuần);
       Hướng giải quyết → task.note (ghi chú của trưởng phòng).
     - Phụ trách của từng đầu việc = người phụ trách dự án chọn trong form; Quy mô/Độ phức tạp để trống như
       khi bấm "+ Dự án mới". */
const PIMP_COLS = [
  ["hm", h => h.startsWith("hang muc")],
  ["dv", h => h.startsWith("dau viec")],
  ["detail", h => h.startsWith("chi tiet")],
  ["deadline", h => h.includes("deadline") || h.startsWith("han ")],
  ["status", h => h.startsWith("trang thai")],
  ["issue", h => h.startsWith("vuong mac")],
  ["solution", h => h.startsWith("huong giai quyet") || h.startsWith("huong xu ly")]
];
function pimpNorm(s){ return String(s??"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(); }
/* Từ khoá để so tên: coi "y" như "i" ("Kí HĐ" trong Excel = "Ký HĐ" trong quy trình chuẩn) */
function pimpTokens(s){ return pimpNorm(s).replace(/y/g,"i").split(" ").filter(Boolean); }
/* Độ giống của 2 tên (0..1): trùng hết = 1; còn lại ưu tiên trường hợp tên này nằm trọn trong tên kia
   ("Chuẩn bị" ↔ "Chuẩn bị khảo sát", "Test nghiệm thu" ↔ "Test nghiệm thu (ATP)"). */
function pimpSim(a, b){
  if(!a.length || !b.length) return 0;
  const A = new Set(a), B = new Set(b); let n = 0;
  for(const x of A) if(B.has(x)) n++;
  if(n===A.size && n===B.size) return 1;
  return 0.6*n/Math.min(A.size, B.size) + 0.4*n/(A.size + B.size - n);
}
const pimpIsDate = v => Object.prototype.toString.call(v)==="[object Date]" && !isNaN(v);
const pimpIso = (y, m, d) => y+"-"+String(m).padStart(2,"0")+"-"+String(d).padStart(2,"0");
/* Giá trị thô của 1 ô: ô gộp trả giá trị của ô chủ (ExcelJS); công thức lấy kết quả; chữ định dạng lấy phần chữ */
function pimpRaw(cell){
  let v = cell ? cell.value : null;
  if(v && typeof v==="object" && !pimpIsDate(v)){
    if(Array.isArray(v.richText)) v = v.richText.map(r=>r.text||"").join("");
    else if("result" in v) v = v.result;
    else if("text" in v) v = v.text;
    else v = null;
    if(v && typeof v==="object" && !pimpIsDate(v)) v = null; // kết quả công thức bị lỗi (#N/A…)
  }
  return v==null ? "" : v;
}
function pimpText(cell){
  const v = pimpRaw(cell);
  if(pimpIsDate(v)) return dmy(pimpIso(v.getUTCFullYear(), v.getUTCMonth()+1, v.getUTCDate()));
  return String(v).replace(/\r\n?/g,"\n").split("\n").map(s=>s.trim()).join("\n").trim();
}
/* Ngày → "YYYY-MM-DD". Ô ngày thật của Excel (ExcelJS trả Date theo UTC) hoặc số sê-ri thì không mơ hồ; chữ
   thì đọc theo kiểu Việt Nam ngày/tháng/năm. Không đọc được → null. */
function pimpDate(v){
  if(pimpIsDate(v)) return pimpIso(v.getUTCFullYear(), v.getUTCMonth()+1, v.getUTCDate());
  if(typeof v==="number" && v>20000 && v<80000){ const d = new Date(Date.UTC(1899,11,30) + Math.round(v)*864e5); return pimpIso(d.getUTCFullYear(), d.getUTCMonth()+1, d.getUTCDate()); }
  const s = String(v||"").trim(); let m;
  if((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s)) && +m[1]>=1 && +m[1]<=31 && +m[2]>=1 && +m[2]<=12) return pimpIso(m[3], +m[2], +m[1]);
  if((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)) && +m[2]>=1 && +m[2]<=12 && +m[3]>=1 && +m[3]<=31) return pimpIso(m[1], +m[2], +m[3]);
  return null;
}
/* Trạng thái của 1 đầu việc từ trạng thái các dòng chi tiết của nó (chữ tự do trong Excel) */
function pimpStatus(list){
  const kinds = new Set();
  for(const raw of list){
    const s = pimpNorm(raw);
    if(!s || s==="na" || s==="n a") continue;
    kinds.add(/hoan thanh|da xong|^xong|done/.test(s) ? "done" : /^huy|da huy|cancel/.test(s) ? "cancel" : /vuong/.test(s) ? "stuck"
      : /^chua|not start/.test(s) ? "todo" : /tam dung|tam hoan|^hoan|pending/.test(s) ? "pause" : "doing");
  }
  const only = (...ks) => [...kinds].every(k=>ks.includes(k));
  if(!kinds.size) return "";
  if(kinds.has("stuck")) return "Đang vướng";
  if(kinds.has("done") && only("done","cancel")) return "Hoàn thành";
  if(only("cancel")) return "Hủy";
  if(only("todo","cancel")) return "Chưa bắt đầu";
  if(kinds.has("pause") && !kinds.has("doing") && !kinds.has("done")) return "Tạm dừng";
  return "Đang làm";
}
/* Đọc 1 sheet → {tasks:[{hm, name, details[], dates[], sts[], issues[], sols[]}], badDates} hoặc null nếu
   không có dòng tiêu đề chứa cả "Hạng mục" lẫn "Đầu việc" (tìm trong 30 dòng đầu, cột nằm ở đâu cũng được). */
function pimpParseSheet(ws){
  const maxC = Math.min(ws.columnCount||0, 40);
  let hdr = 0, col = null;
  for(let r=1; r<=Math.min(ws.rowCount, 30) && !hdr; r++){
    const c = {};
    for(let j=1; j<=maxC; j++){
      const h = pimpNorm(pimpText(ws.getRow(r).getCell(j))); if(!h) continue;
      for(const [k, test] of PIMP_COLS) if(!(k in c) && test(h)){ c[k] = j; break; }
    }
    if(c.hm && c.dv){ hdr = r; col = c; }
  }
  if(!hdr) return null;
  const tasks = []; let cur = null, hm = "", badDates = 0;
  const key = c => c.isMerged ? c.master.address : c.address;
  for(let r=hdr+1; r<=ws.rowCount; r++){
    const row = ws.getRow(r), cell = k => col[k] ? row.getCell(col[k]) : null, txt = k => col[k] ? pimpText(cell(k)) : "";
    const t = {hm:txt("hm"), dv:txt("dv"), detail:txt("detail"), status:txt("status"), issue:txt("issue"), solution:txt("solution")};
    const dlRaw = col.deadline ? pimpRaw(cell("deadline")) : "";
    if(!t.hm && !t.dv && !t.detail && !t.status && !t.issue && !t.solution && dlRaw==="") continue;
    /* Hạng mục: có chữ → hạng mục mới; ô thường để trống → vẫn thuộc hạng mục phía trên (bảng không gộp ô,
       chỉ ghi ở dòng đầu nhóm); khối ô GỘP để trống → không rõ hạng mục (đối chiếu theo tên đầu việc sau). */
    if(t.hm) hm = t.hm.replace(/\s+/g," "); else if(cell("hm").isMerged) hm = "";
    if(t.dv){
      const k = key(cell("dv"));
      if(!cur || cur.key!==k){ cur = {key:k, hm, name:t.dv.replace(/\s+/g," "), details:[], seen:new Set(), dates:[], sts:[], issues:[], sols:[]}; tasks.push(cur); }
    }
    if(!cur) continue; // nội dung nằm trước đầu việc đầu tiên
    if(t.detail){ const k = key(cell("detail")); if(!cur.seen.has(k)){ cur.seen.add(k); cur.details.push(t.detail); } }
    if(dlRaw!==""){ const d = pimpDate(dlRaw); if(d) cur.dates.push(d); else if(!/^(na|n\/a|-|–)$/i.test(String(dlRaw).trim())) badDates++; }
    if(t.status) cur.sts.push(t.status);
    if(t.issue && !cur.issues.includes(t.issue)) cur.issues.push(t.issue);
    if(t.solution && !cur.sols.includes(t.solution)) cur.sols.push(t.solution);
  }
  return {tasks, badDates};
}
/* Đối chiếu các đầu việc đã đọc với quy trình chuẩn của loại dự án, trả về danh sách đầu việc sẵn sàng lưu
   + số liệu tóm tắt để hiện trong form. Mỗi đầu việc chuẩn chỉ được dùng cho 1 dòng Excel (ghép theo điểm
   giống cao nhất trước). */
function pimpBuild(parsed, type, owner){
  const phases = phasesFor(type);
  const cat = S.catalog.filter(c=>c.type===type).map(c=>({name:c.name, code:phaseOf(c.name), tok:pimpTokens(planShortName(c.name))}));
  const phaseCache = new Map();
  const findPhase = hm => {
    if(!hm) return null;
    if(!phaseCache.has(hm)){
      const tk = pimpTokens(hm.replace(/^[0-9A-Z]{1,2}\d?\.\s*/, "")); let best = null, bs = 0;
      for(const ph of phases){ const s = pimpSim(tk, pimpTokens(ph.name)); if(s>bs){ bs = s; best = ph; } }
      phaseCache.set(hm, bs>=0.5 ? best : null);
    }
    return phaseCache.get(hm);
  };
  const items = parsed.tasks.map(t => ({t, ph:findPhase(t.hm), tok:pimpTokens(t.name), dv:null, std:false}));
  const used = new Set();
  const assign = (minScore, sameHm) => {
    const pairs = [];
    items.forEach((it, i) => { if(it.dv) return; cat.forEach((c, j) => {
      if(used.has(j) || !c.code) return;
      if(sameHm && !(it.ph && c.code===it.ph.code)) return;
      const s = pimpSim(it.tok, c.tok); if(s>=minScore(it)) pairs.push([s, i, j]);
    }); });
    pairs.sort((a,b)=>b[0]-a[0] || a[1]-b[1]);
    for(const [, i, j] of pairs){ if(items[i].dv || used.has(j)) continue; items[i].dv = cat[j].name; items[i].std = true; used.add(j); }
  };
  assign(() => 0.5, true);                  // 1) trong đúng hạng mục ghi ở Excel
  assign(it => it.ph ? 1 : 0.8, false);     // 2) hạng mục để trống/ghi lệch: tìm trên cả quy trình, phải gần như trùng tên
  for(const it of items) if(!it.dv)         // 3) ngoài quy trình chuẩn: giữ tên trong Excel
    it.dv = it.ph ? `${it.ph.code}. ${it.ph.name} – ${it.t.name}` : (it.t.hm ? `${it.t.hm} – ${it.t.name}` : it.t.name);
  const tasks = items.map((it, i) => ({
    id:"t"+String(i+1).padStart(3,"0"), dv:it.dv, detail:it.t.details.join("\n"), owner:owner||"", collab:"",
    deadline: it.t.dates.length ? it.t.dates.reduce((a,d)=>d>a?d:a) : null, qm:null, pt:null, pr:"P2",
    init:{status:pimpStatus(it.t.sts), ms:null, nn:"", note:it.t.issues.join("\n")}, note:it.t.sols.join("\n"), eval:{}
  }));
  const custom = items.filter(it=>!it.std).map(it=>it.t.name);
  return {tasks, custom, phases:new Set(tasks.map(t=>phaseOf(t.dv))).size, badDates:parsed.badDates};
}
function pimpSummary(sheet, type){
  if(!sheet) return "";
  const b = pimpBuild(sheet.parsed, type, "");
  const done = b.tasks.filter(t=>t.init.status==="Hoàn thành").length;
  return `Sẽ tạo ${b.tasks.length} đầu việc thuộc ${b.phases} hạng mục (${done} đã hoàn thành); ${b.tasks.length-b.custom.length} đầu việc khớp quy trình ${type.toLowerCase()} chuẩn.`
    + (b.custom.length ? ` ${b.custom.length} đầu việc không có trong quy trình chuẩn, giữ nguyên tên trong Excel: ${b.custom.slice(0,6).join("; ")}${b.custom.length>6?"…":""}.` : "")
    + (b.badDates ? ` ${b.badDates} ô Deadline không đọc được ngày nên bỏ qua.` : "");
}
function pimpForm(fileName, sheets){
  const byName = n => sheets.find(s=>s.name===n);
  const staffOpts = [["",""], ...M.staff.map(s=>[s.name, s.name])];
  openForm({
    title:"Nhập dự án từ Excel", subtitle:fileName,
    values:{sheet:sheets[0].name, name:"", type:"Triển khai", owner:"", se:""},
    fields:[
      {key:"sheet", label:"Sheet cần nhập", type:"select", required:true, options:sheets.map(s=>[s.name, `${s.name} (${s.parsed.tasks.length} đầu việc)`]),
        hint:()=>sheets.length>1 ? "Mỗi lần nhập tạo 1 dự án từ 1 sheet." : ""},
      {key:"name", label:"Tên dự án", type:"text", hint:(v, vals) => {
        const nm = ((v||"").trim() || vals.sheet || "").trim().toLowerCase();
        return ((v||"").trim() ? "" : `Để trống = lấy tên sheet “${vals.sheet}”. `) + (M.projects.some(p=>p.name.trim().toLowerCase()===nm) ? "Đã có dự án cùng tên – vẫn tạo thành một dự án mới riêng." : "");
      }},
      {key:"type", label:"Loại", type:"seg", options:["Triển khai","Thầu"].map(t=>[t,t]), hint:(v, vals) => pimpSummary(byName(vals.sheet), v)},
      {key:"owner", label:"Người phụ trách", type:"select", options:staffOpts, half:true, hint:()=>"Cũng là người phụ trách của từng đầu việc."},
      {key:"se", label:"SE", type:"select", options:staffOpts, half:true}
    ],
    saveLabel:"Tạo dự án",
    onSave: async x => {
      const sheet = byName(x.sheet); if(!sheet) throw new Error("Chọn sheet cần nhập.");
      const name = (x.name||"").trim() || sheet.name.trim();
      const b = pimpBuild(sheet.parsed, x.type, x.owner);
      let id = "p-"+slug(name); if(M.pById.get(id)) id += "-"+Math.random().toString(36).slice(2,5);
      const order = Math.max(0, ...M.projects.map(q=>q.order||0)) + 1;
      await saveProject({id, name, type:x.type, owner:x.owner||"", se:x.se||"", milestones:"", progress:"", situation:"", proposal:"", difficulty:1, order, tasks:b.tasks});
      S.planSel = id; S.typeFilter = "Tất cả";
      toast(`Đã tạo dự án “${name}” với ${b.tasks.length} đầu việc`);
    }
  });
}
async function pimpOpen(file){
  if(!/\.xlsx$/i.test(file.name)){ toast("Chỉ đọc được file .xlsx – mở file trong Excel rồi lưu lại dạng .xlsx."); return; }
  toast("Đang đọc file Excel…");
  try{ await rpEnsureExcel(); }
  catch(e){ console.error(e); rpExcelReady = null; toast("Không tải được thư viện đọc Excel. Kiểm tra kết nối mạng rồi thử lại."); return; }
  let sheets;
  try{
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
    sheets = wb.worksheets.map(ws=>({name:ws.name, parsed:pimpParseSheet(ws)})).filter(s=>s.parsed && s.parsed.tasks.length);
  }catch(e){ console.error(e); toast("Không đọc được file Excel này."); return; }
  if(!sheets.length){ toast("Không tìm thấy bảng nào có cột “Hạng mục” và “Đầu việc” trong file."); return; }
  pimpForm(file.name, sheets);
}
ACTIONS["planimport"] = () => {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".xlsx";
  inp.addEventListener("change", () => { if(inp.files[0]) pimpOpen(inp.files[0]); });
  inp.click();
};
