"use strict";
/* Xuất Excel (CSV) và sao lưu / khôi phục */
function download(name, blob){
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function excelBlob(rows){
  const txt = rows.map(r => r.map(v => { let s = v==null ? "" : String(v); s = s.replace(/[\t\r\n]+/g, " "); return s; }).join("\t")).join("\r\n");
  const buf = new Uint16Array(txt.length + 1); buf[0] = 0xFEFF;
  for(let i=0;i<txt.length;i++) buf[i+1] = txt.charCodeAt(i);
  return new Blob([buf], {type:"text/csv;charset=utf-16le"});
}
function stamp(){ return todayISO().replace(/-/g,""); }
function exportPlan(){
  const rows = [["Dự án","Loại","Đầu việc","Nội dung chi tiết","Người phụ trách","Người phối hợp","Deadline HĐ","Quy mô","Độ phức tạp","Workload","Ưu tiên","Trạng thái","Nguồn trạng thái","Cập nhật mới nhất","Ma sát","Nguyên nhân","Tuần hoàn thành","Đúng hạn","Cảnh báo","Đạt yêu cầu","Chất lượng","Tự chủ","Nhận xét"]];
  for(const p of M.projects) for(const t of p._tasks){
    const ev = t.eval || {};
    rows.push([p.name, p.type, t.dv, t.detail, t.owner, t.collab, t.deadline?dmy(t.deadline):"", t.qmE, t.ptE, t.wl, t.pr, t.status, t.src, t.upd, t.ms, t.nn,
      t.done?dmy(t.done):"", t.ontime===true?"Có":t.ontime===false?"Không":"", t.warns.map(w=>w[1]).join("; "), ev.dat, ev.cl, ev.tc, ev.nx]);
  }
  download(`Ke-hoach-du-an-${stamp()}.csv`, excelBlob(rows)); toast("Đã xuất kế hoạch dự án");
}
function exportWeeks(){
  const rows = [["Tuần","Từ ngày","Người thực hiện","Dự án","Loại","Đầu việc","Việc đã làm","Quy mô","Độ phức tạp","Workload","Trạng thái cuối tuần","Ma sát","Nguyên nhân","Vướng mắc / cần hỗ trợ"]];
  const es = [...M.entries].sort((a,b) => a.week<b.week?1:a.week>b.week?-1:a.person.localeCompare(b.person,"vi"));
  for(const e of es){ const p = M.pById.get(e.projectId);
    rows.push(["Tuần "+isoWeek(e.week), dmy(e.week), e.person, p?p.name:"", e.type, e.ref?e.ref.t.dv:"", e.work, e.qm, e.pt, e.wl, e.status, e.ms, e.nn, e.note]); }
  download(`Nhap-theo-tuan-${stamp()}.csv`, excelBlob(rows)); toast("Đã xuất dữ liệu theo tuần");
}
function exportBackup(){
  if(S.server){ window.location.href = "/api/backup"; return; }
  download(`Sao-luu-theo-doi-cong-viec-${stamp()}.json`, new Blob([JSON.stringify({app:"ptkt", version:1, exported:new Date().toISOString(), data:S.db.dump()}, null, 1)], {type:"application/json"}));
  toast("Đã xuất file sao lưu");
}
function importBackup(file){
  const r = new FileReader();
  r.onload = () => {
    try{
      const j = JSON.parse(r.result); const d = j && j.data;
      if(!d || typeof d!=="object" || !Object.keys(d).some(k=>k.startsWith("projects/"))) throw new Error();
      if(S.server){ if(!confirm("Thay TOÀN BỘ dữ liệu trên máy chủ (cho cả phòng) bằng dữ liệu trong file sao lưu?")) return;
        S.db.api("POST","/api/restore",{data:d}).then(()=>toast("Đã khôi phục dữ liệu")).catch(e=>toast(e.message||"Khôi phục không thành công")); return; }
      if(!confirm("Thay toàn bộ dữ liệu trên máy này bằng dữ liệu trong file sao lưu?")) return;
      S.db.load(d); toast("Đã nhập dữ liệu từ file sao lưu");
    }catch(e){ toast("File không đúng định dạng sao lưu của trang này."); }
  };
  r.readAsText(file);
}
