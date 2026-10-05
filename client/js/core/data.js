"use strict";
/* Lớp dữ liệu: ghi/xoá tài liệu lên máy chủ */
/* ================= data layer ================= */
const queues = new Map();
function write(path, body){
  if(!S.db){ toast("Chưa kết nối dữ liệu chung – không lưu được."); return Promise.reject(); }
  const prev = queues.get(path) || Promise.resolve();
  const next = prev.catch(()=>{}).then(() => S.db.doc(path).set(body)).catch(e => {
    const code = e && e.code;
    toast(code==="unauthenticated" ? "Vui lòng đăng nhập lại." : code==="invalid_argument" ? ((e&&e.message)||"Bạn không có quyền sửa phần này.") : code==="quota_exceeded" ? "Bộ nhớ dữ liệu đã đầy." : "Lưu không thành công, thử lại sau.");
    throw e;
  });
  queues.set(path, next); return next;
}
function remove(path){ if(!S.db) return Promise.reject(); return S.db.doc(path).delete().catch(e=>{ toast("Xoá không thành công."); throw e; }); }
function clean(o){ const r={}; for(const [k,v] of Object.entries(o)) if(!k.startsWith("_")) r[k]=v; return r; }
function saveProject(p){ const body = clean(p); body.tasks = (p.tasks||[]).map(t=>({...t})); return write("projects/"+p.id, body); }
function weekDocId(week, person){ return week+"__"+slug(person); }
function weekDoc(week, person){ return S.weeks.find(w=>w.week===week && w.person===person); }
function saveWeek(week, person, entries){
  const id = weekDocId(week, person);
  if(!entries.length) return remove("weeks/"+id);
  return write("weeks/"+id, {week, person, entries});
}

function setConn(){
  const d=document.getElementById("connDot"), t=document.getElementById("connTxt");
  d.className = "dot " + (S.conn==="on"?"on":S.conn==="off"?"off":"");
  t.textContent = S.conn==="reconnect" ? "Mất kết nối – đang thử lại…" : (S.conn==="on" && S.server) ? "Đã kết nối máy chủ" : S.conn==="on" ? "Dữ liệu chung đang đồng bộ" : S.conn==="off" ? "Chưa kết nối dữ liệu chung" : "Đang kết nối…";
}
let raf=0; function schedule(){ cancelAnimationFrame(raf); raf=requestAnimationFrame(render); }
