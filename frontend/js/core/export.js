"use strict";
/* Sao lưu / khôi phục dữ liệu */
function download(name, blob){
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function stamp(){ return todayISO().replace(/-/g,""); }
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
