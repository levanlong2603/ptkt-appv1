"use strict";
/* Kết nối máy chủ: API, cập nhật tức thời (SSE), đăng nhập, tài khoản */
/* ================= server mode ================= */
function makeServerDb(){
  const listeners = new Map(); let es = null;
  const fire = coll => { const sets = coll==="*" ? [...listeners.values()] : [listeners.get(coll)||new Set()]; sets.forEach(s=>s.forEach(f=>f())); };
  function ensureES(){
    if(es) return;
    es = new EventSource("/api/events");
    es.addEventListener("change", ev => { try{ fire(JSON.parse(ev.data).collection); }catch(e){} });
    es.onerror = () => { if(S.conn!=="reconnect"){ S.conn="reconnect"; setConn(); } };
    es.onopen = () => { if(S.conn!=="on"){ S.conn="on"; setConn(); fire("*"); } };
  }
  async function api(method, url, body){
    let r;
    try{ r = await fetch(url, {method, credentials:"same-origin", headers: body!==undefined?{"Content-Type":"application/json"}:{}, body: body!==undefined?JSON.stringify(body):undefined}); }
    catch(e){ throw {code:"unavailable", message:"Không kết nối được máy chủ."}; }
    let j = null; try{ j = r.status===204 ? null : await r.json(); }catch(e){}
    if(r.status===401 && !url.endsWith("/api/login") && !url.endsWith("/api/me/password")){ showLogin("Phiên đăng nhập đã hết, vui lòng đăng nhập lại."); throw {code:"unauthenticated"}; }
    if(r.status===403) throw {code:"invalid_argument", message:(j&&j.error)||"Bạn không có quyền"};
    if(r.status===413) throw {code:"quota_exceeded"};
    if(!r.ok) throw {code:"failed", message:(j&&j.error)||"Lỗi máy chủ"};
    return j;
  }
  const docRef = p => { const i = p.indexOf("/"); const coll = p.slice(0,i), id = p.slice(i+1);
    return { set: b => api("PUT", `/api/doc/${coll}/${encodeURIComponent(id)}`, b), delete: () => api("DELETE", `/api/doc/${coll}/${encodeURIComponent(id)}`) }; };
  const query = (coll, filters) => ({
    where:(f,op,v) => query(coll, [...filters, [f,op,v]]),
    doc:id => docRef(coll+"/"+id),
    onSnapshot(next, onErr){
      let seq = 0;
      const run = async () => { const my = ++seq;
        try{ const f = filters[0]; const qs = f ? `?field=${encodeURIComponent(f[0])}&gte=${encodeURIComponent(f[2])}` : "";
          const rows = await api("GET", `/api/collection/${coll}${qs}`); if(my!==seq) return;
          next({docs: rows.map(r => ({id:r.id, exists:true, data:() => r.data})), size: rows.length}); }
        catch(e){ if(onErr) onErr(e); } };
      if(!listeners.has(coll)) listeners.set(coll, new Set());
      listeners.get(coll).add(run); ensureES(); run();
      return () => listeners.get(coll).delete(run);
    }
  });
  return { collection: c => query(c, []), doc: docRef, api, close(){ if(es){ es.close(); es=null; } } };
}
async function connectServer(){
  try{ const r = await fetch("/api/me", {credentials:"same-origin"}); if(r.ok){ startSession(await r.json()); return; } }
  catch(e){ S.conn="off"; setConn(); render(); return; }
  showLogin();
}
function startSession(user){
  if(S.db && S.db.close) S.db.close();
  S.user = user; S.server = true; S.canEdit = user.role==="admin"; S.users = null;
  if(user.role!=="admin"){ S.me = user.staff_name || ""; } else if(!S.me && user.staff_name){ S.me = user.staff_name; }
  const db = makeServerDb(); S.db = db; S.conn = "on"; S.loaded = false; setConn();
  const onErr = () => {};
  db.collection("config").onSnapshot(snap => {
    S.staff = []; S.catalog = [];
    for(const d of snap.docs){ const b=d.data()||{}; if(d.id==="staff") S.staff=b.list||[]; if(d.id==="catalog") S.catalog=b.list||[]; }
    S.loaded = true; schedule(); }, onErr);
  db.collection("projects").onSnapshot(snap => { S.projects = snap.docs.map(d=>({...d.data(), id:d.id})); S.loaded=true; schedule(); }, onErr);
  const cutoff = addDays(mondayOf(todayISO()), -7*156);
  db.collection("weeks").where("week", ">=", cutoff).onSnapshot(snap => { S.weeks = snap.docs.map(d=>({...d.data(), _id:d.id})); S.loaded=true; schedule(); }, onErr);
  for(const fn of ON_SESSION){ try{ fn(db); }catch(e){ console.error(e); } }
  hideLogin(); render();
}
function showLogin(msg){
  if(S.db && S.db.close) S.db.close();
  let w = document.getElementById("loginWrap");
  if(!w){ w = document.createElement("div"); w.id = "loginWrap"; w.className = "login-wrap"; document.body.appendChild(w); }
  w.innerHTML = `<form class="login" id="loginForm" autocomplete="on">
    <div class="logo">NGSI</div><h1>Phòng Kỹ thuật</h1><p>Quản trị công việc và nguồn lực</p>
    <div class="field"><label for="lgU">Tên đăng nhập</label><input class="inp" id="lgU" name="username" autocomplete="username" required></div>
    <div class="field"><label for="lgP">Mật khẩu</label><input class="inp" id="lgP" name="password" type="password" autocomplete="current-password" required></div>
    <div class="err" id="lgE" role="alert">${esc(msg||"")}</div>
    <button class="btn primary" type="submit">Đăng nhập</button></form>`;
  const f = document.getElementById("loginForm");
  f.addEventListener("submit", async e => {
    e.preventDefault(); const btn = f.querySelector("button"); btn.disabled = true;
    try{
      const r = await fetch("/api/login", {method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({username: f.username.value.trim(), password: f.password.value})});
      const j = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(j.error || "Đăng nhập không thành công");
      startSession(j);
    }catch(err){ document.getElementById("lgE").textContent = err.message || "Không kết nối được máy chủ"; btn.disabled = false; }
  });
  setTimeout(() => document.getElementById("lgU").focus(), 30);
}
function hideLogin(){ const w = document.getElementById("loginWrap"); if(w) w.remove(); }
async function logout(){
  try{ await fetch("/api/logout", {method:"POST", credentials:"same-origin"}); }catch(e){}
  S.user = null; S.staff=[]; S.catalog=[]; S.projects=[]; S.weeks=[]; S.loaded=false;
  document.getElementById("userBox").hidden = true; showLogin();
}
function passwordForm(){
  openForm({title:"Đổi mật khẩu", subtitle:S.user.display_name, values:{cur:"", n1:"", n2:""},
    fields:[{key:"cur", label:"Mật khẩu hiện tại", type:"password", required:true},
            {key:"n1", label:"Mật khẩu mới (ít nhất 8 ký tự)", type:"password", required:true},
            {key:"n2", label:"Nhập lại mật khẩu mới", type:"password", required:true}],
    saveLabel:"Đổi mật khẩu",
    onSave: async v => {
      if(v.n1 !== v.n2) throw new Error("Hai lần nhập mật khẩu mới không khớp.");
      try{ await S.db.api("POST", "/api/me/password", {current:v.cur, next:v.n1}); }catch(e){ throw new Error(e.message || "Không đổi được mật khẩu."); }
      toast("Đã đổi mật khẩu");
    }});
}
async function loadUsers(){
  if(S.usersLoading) return; S.usersLoading = true;
  try{ S.users = await S.db.api("GET", "/api/users"); }catch(e){ S.users = []; }
  S.usersLoading = false; schedule();
}
function userForm(u){
  const isNew = !u;
  const v = u ? {...u, pw:""} : {username:"", display_name:"", staff_name:"", role:"member", active:true, pw:""};
  openForm({title: isNew ? "Tạo tài khoản" : "Sửa tài khoản", subtitle: isNew ? "" : u.username, values:v,
    fields:[
      ...(isNew ? [{key:"username", label:"Tên đăng nhập (chữ không dấu, số, . _ -)", type:"text", required:true}] : []),
      {key:"display_name", label:"Tên hiển thị", type:"text", required:true},
      {key:"staff_name", label:"Gắn với nhân sự (để nhập theo tuần)", type:"select", options:[["",""],...M.staff.map(s=>[s.name,s.name])]},
      {key:"role", label:"Vai trò", type:"seg", options:[["member","Nhân viên"],["admin","Trưởng phòng"]], hint:v=>v==="admin"?"Toàn quyền: sửa mọi dự án, cài đặt, tài khoản và dữ liệu của mọi người.":"Nhập theo tuần cho chính mình; tạo dự án mới và sửa dự án do mình tạo; xem toàn bộ báo cáo."},
      ...(isNew ? [] : [{key:"active", label:"Trạng thái", type:"seg", options:[[true,"Đang hoạt động"],[false,"Khoá"]]}]),
      {key:"pw", label: isNew ? "Mật khẩu (ít nhất 8 ký tự)" : "Đặt mật khẩu mới (để trống nếu không đổi)", type:"password", required:isNew}
    ],
    saveLabel: isNew ? "Tạo tài khoản" : "Lưu",
    onSave: async x => {
      try{
        if(isNew) await S.db.api("POST", "/api/users", {username:x.username, password:x.pw, display_name:x.display_name, staff_name:x.staff_name||null, role:x.role});
        else await S.db.api("PATCH", `/api/users/${u.id}`, {display_name:x.display_name, staff_name:x.staff_name||null, role:x.role, active:x.active, ...(x.pw?{password:x.pw}:{})});
      }catch(e){ throw new Error(e.message || "Không lưu được tài khoản."); }
      toast(isNew ? "Đã tạo tài khoản" : "Đã lưu tài khoản"); S.users = null; loadUsers();
    }});
}
function usersPanel(){
  if(!(S.server && S.canEdit)) return "";
  if(S.users == null){ loadUsers(); return `<section class="panel" style="margin-bottom:18px"><div class="panel-h"><h2>Tài khoản đăng nhập</h2></div><div class="empty">Đang tải…</div></section>`; }
  return `<section class="panel" style="margin-bottom:18px"><div class="panel-h"><h2>Tài khoản đăng nhập</h2><button class="btn primary" data-act="adduser">+ Tài khoản</button></div>
    <div class="tbl-wrap"><table><thead><tr><th>Tên đăng nhập</th><th>Tên hiển thị</th><th>Gắn với nhân sự</th><th>Vai trò</th><th>Trạng thái</th></tr></thead><tbody>
    ${S.users.map(u=>`<tr class="click" data-act="edituser" data-id="${u.id}" tabindex="0"><td class="cell-main">${esc(u.username)}</td><td>${esc(u.display_name)}</td><td>${esc(u.staff_name||"–")}</td>
      <td>${u.role==="admin"?'<span class="pill info">Trưởng phòng</span>':'<span class="pill mute">Nhân viên</span>'}</td><td>${u.active?'<span class="pill ok">Hoạt động</span>':'<span class="pill bad">Khoá</span>'}</td></tr>`).join("")}
    </tbody></table></div><div class="panel-b small muted">Nhân viên cần được “gắn với nhân sự” để nhập theo tuần. Nhân viên chỉ sửa được dữ liệu tuần của chính mình và các dự án do mình tạo.</div></section>`;
}
document.getElementById("userBox").addEventListener("click", e => { const b = e.target.closest("[data-uact]"); if(!b) return; if(b.dataset.uact==="pw") passwordForm(); else logout(); });
