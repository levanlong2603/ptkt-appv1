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
    try{ r = await fetch(url, {method, credentials:"same-origin", ...(method==="GET"?{cache:"no-store"}:{}), headers: body!==undefined?{"Content-Type":"application/json"}:{}, body: body!==undefined?JSON.stringify(body):undefined}); }
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
      const run = async (reportError=false) => { const my = ++seq;
        try{ const f = filters[0]; const qs = f ? `?field=${encodeURIComponent(f[0])}&gte=${encodeURIComponent(f[2])}` : "";
          const rows = await api("GET", `/api/collection/${coll}${qs}`); if(my!==seq) return;
          next({docs: rows.map(r => ({id:r.id, exists:true, data:() => r.data})), size: rows.length}); }
        catch(e){ if(onErr) onErr(e); if(reportError) throw e; } };
      if(!listeners.has(coll)) listeners.set(coll, new Set());
      listeners.get(coll).add(run); ensureES(); run();
      return () => listeners.get(coll).delete(run);
    }
  });
  return { collection: c => query(c, []), doc: docRef, api,
    async refresh(){
      const results = await Promise.allSettled([...listeners.values()].flatMap(set=>[...set].map(run=>run(true))));
      const failed = results.find(r=>r.status==="rejected");
      if(failed) throw failed.reason;
    },
    close(){ if(es){ es.close(); es=null; } } };
}
async function connectServer(){
  try{ const r = await fetch("/api/me", {credentials:"same-origin"}); if(r.ok){ startSession(await r.json()); return; } }
  catch(e){ S.conn="off"; setConn(); render(); return; }
  showLogin();
}
function startSession(user){
  if(S.db && S.db.close) S.db.close();
  S.user = user; S.server = true; S.canEdit = isFullRole(user.role); S.users = null;
  if(!isFullRole(user.role)){ S.me = user.staff_name || ""; } else if(!S.me && user.staff_name){ S.me = user.staff_name; }
  const db = makeServerDb(); S.db = db; S.conn = "on"; S.loaded = false; setConn();
  const onErr = () => {};
  db.collection("config").onSnapshot(snap => {
    S.staff = []; S.catalog = []; S.help = "";
    for(const d of snap.docs){ const b=d.data()||{}; if(d.id==="staff") S.staff=b.list||[]; if(d.id==="catalog") S.catalog=b.list||[]; if(d.id==="help") S.help=b.html||""; }
    S.loaded = true; schedule(); }, onErr);
  db.collection("projects").onSnapshot(snap => { S.projects = snap.docs.map(d=>({...d.data(), id:d.id})); S.loaded=true; schedule(); }, onErr);
  const cutoff = addDays(mondayOf(todayISO()), -7*156);
  db.collection("weeks").where("week", ">=", cutoff).onSnapshot(snap => { S.weeks = snap.docs.map(d=>({...d.data(), _id:d.id})); S.loaded=true; schedule(); }, onErr);
  for(const fn of ON_SESSION){ try{ fn(db); }catch(e){ console.error(e); } }
  hideLogin(); render(); resetIdleTimer();
}
function showLogin(msg){
  if(S.db && S.db.close) S.db.close();
  stopIdleTimer();
  let w = document.getElementById("loginWrap");
  if(!w){ w = document.createElement("div"); w.id = "loginWrap"; w.className = "login-wrap"; document.body.appendChild(w); }
  w.innerHTML = `<form class="login" id="loginForm" autocomplete="on">
    <div class="login-head"><img class="login-wordmark" src="img/NextGen.png" alt="NEXT GEN · Service Integration"><div class="login-div"></div><div class="login-head-tx">Technical Department</div></div>
    <div class="login-sep"></div>
    <div class="login-intro"><h1>Phòng Kỹ thuật</h1><p>Quản trị công việc và nguồn lực</p></div>
    <div class="field"><label for="lgU">Tên đăng nhập</label><input class="inp" id="lgU" name="username" autocomplete="username" required></div>
    <div class="field"><label for="lgP">Mật khẩu</label>
      <div class="login-pwwrap"><input class="inp" id="lgP" name="password" type="password" autocomplete="current-password" required>
        <button type="button" class="login-pwtoggle" id="lgPwToggle" aria-label="Hiện mật khẩu" aria-pressed="false">${ICONS.eye}</button></div></div>
    <div class="err" id="lgE" role="alert">${esc(msg||"")}</div>
    <button class="btn primary" type="submit">Đăng nhập</button>
    <div class="login-hint">Quên mật khẩu? Liên hệ trưởng phòng để được hỗ trợ.</div></form>
    <div class="login-foot">NGSI INTERNAL WORKSPACE</div>`;
  const f = document.getElementById("loginForm");
  const pwToggle = document.getElementById("lgPwToggle"), pwInput = document.getElementById("lgP");
  pwToggle.addEventListener("click", () => {
    const show = pwInput.type==="password";
    pwInput.type = show ? "text" : "password";
    pwToggle.innerHTML = show ? ICONS.eyeOff : ICONS.eye;
    pwToggle.setAttribute("aria-label", show ? "Ẩn mật khẩu" : "Hiện mật khẩu");
    pwToggle.setAttribute("aria-pressed", show ? "true" : "false");
  });
  f.addEventListener("submit", async e => {
    e.preventDefault(); const btn = f.querySelector('button[type="submit"]'); btn.disabled = true; const label = btn.textContent; btn.textContent = "Đang đăng nhập…";
    try{
      const r = await fetch("/api/login", {method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({username: f.username.value.trim(), password: f.password.value})});
      const j = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(j.error || "Đăng nhập không thành công");
      startSession(j);
    }catch(err){ document.getElementById("lgE").textContent = err.message || "Không kết nối được máy chủ"; btn.disabled = false; btn.textContent = label; }
  });
  setTimeout(() => document.getElementById("lgU").focus(), 30);
}
function hideLogin(){ const w = document.getElementById("loginWrap"); if(w) w.remove(); }
async function logout(msg){
  stopIdleTimer();
  try{ await fetch("/api/logout", {method:"POST", credentials:"same-origin"}); }catch(e){}
  S.user = null; S.staff=[]; S.catalog=[]; S.projects=[]; S.weeks=[]; S.feedback=[]; S.fbReplies=[]; S.events=[]; S.loaded=false;
  document.getElementById("userBox").hidden = true; showLogin(msg);
}
/* ---------- tự đăng xuất khi không thao tác ---------- */
const IDLE_TIMEOUT_MIN = 15;
let idleTimer = null, idleLastReset = 0, idleLastPing = 0;
function resetIdleTimer(){
  if(!S.user) return;
  const now = Date.now(); if(idleTimer && now - idleLastReset < 5000) return; // tối đa đặt lại mỗi 5 giây, đỡ tốn
  idleLastReset = now; clearTimeout(idleTimer);
  idleTimer = setTimeout(() => logout(`Đã tự đăng xuất do không thao tác trong ${IDLE_TIMEOUT_MIN} phút.`), IDLE_TIMEOUT_MIN*60*1000);
  /* Báo cho máy chủ biết vẫn đang hoạt động thật (xem auth() trong backend/server.js) – máy chủ tự đăng
     xuất phiên nếu không có thao tác thật trong IDLE_TIMEOUT_MIN phút, kể cả khi đóng hẳn trình duyệt rồi
     mở lại sau đó (không chỉ dựa vào bộ đếm JS này, vì JS ngừng chạy khi đóng tab). Gọi thưa hơn (mỗi phút)
     để đỡ tốn mạng. */
  if(now - idleLastPing > 60000){ idleLastPing = now; fetch("/api/activity", {method:"POST", credentials:"same-origin"}).catch(()=>{}); }
}
function stopIdleTimer(){ clearTimeout(idleTimer); idleTimer = null; }
["mousemove","keydown","mousedown","touchstart","wheel","scroll"].forEach(ev => document.addEventListener(ev, resetIdleTimer, {passive:true}));
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
  /* Nhân viên chỉ mở được form này cho ĐÚNG tài khoản của chính mình (xem usersPanel() – các dòng khác
     không gắn data-act nữa); không quản lý (canManage=false) thì chỉ còn 3 trường an toàn (tên đăng
     nhập/tên hiển thị/mật khẩu) – ẩn hẳn Gắn với nhân sự/Vai trò/Trạng thái, khớp đúng những trường máy
     chủ chấp nhận cho tự sửa (xem PATCH /api/users/:id). */
  const canManage = S.canEdit;
  const v = u ? {...u, pw:""} : {username:"", display_name:"", staff_name:"", role:"member", active:true, pw:""};
  openForm({title: isNew ? "Tạo tài khoản" : "Sửa tài khoản", subtitle: isNew ? "" : u.username, values:v,
    fields:[
      {key:"username", label:"Tên đăng nhập (chữ không dấu, số, . _ -)", type:"text", required:true,
        hint:isNew?"":"Đổi tên đăng nhập sẽ buộc tài khoản này phải đăng nhập lại."},
      {key:"display_name", label:"Tên hiển thị", type:"text", required:true},
      ...(canManage ? [{key:"staff_name", label:"Gắn với nhân sự (để nhập theo tuần)", type:"select", options:[["",""],...M.staff.map(s=>[s.name,s.name])]}] : []),
      /* Vai trò "admin" (hệ thống/khởi tạo CSDL) không phải lựa chọn thường – chỉ tạo mới được bằng
         `npm run user -- create` ở máy chủ (máy chủ từ chối nếu POST role="admin" qua form này). Chỉ
         hiện thêm lựa chọn "Admin" khi đang SỬA đúng một tài khoản vốn đã là admin (và chỉ tài khoản
         admin khác mới mở được form này ra, vì S.users đã lọc theo quyền người xem ở server) – để sửa
         các trường khác (mật khẩu, trạng thái...) của nó mà không bị mất lựa chọn đang chọn dở.
         Chỉ hiện lựa chọn vai trò ≤ cấp của chính người đang thao tác (ROLE_RANK) – vd Phó phòng không
         thấy/gán được "Trưởng phòng" cho ai, tránh tự nâng quyền người khác vượt mình. */
      ...(canManage ? [{key:"role", label:"Vai trò", type:"seg",
        options:[["member","Nhân viên"],["deputy","Phó phòng"],["head","Trưởng phòng"],...(v.role==="admin"?[["admin","Admin"]]:[])]
          .filter(o=>ROLE_RANK[o[0]]<=ROLE_RANK[S.user.role]),
        hint:v=>v==="admin"?"Tài khoản hệ thống, toàn quyền – quản lý qua dòng lệnh ở máy chủ.":isFullRole(v)?"Toàn quyền: sửa mọi dự án, cài đặt, tài khoản và dữ liệu của mọi người.":"Nhập theo tuần cho chính mình; sửa dự án/đầu việc nếu là người tạo hoặc là TM/SE của dự án (gắn qua “Gắn với nhân sự” bên dưới); xem toàn bộ báo cáo."}] : []),
      ...(canManage && !isNew ? [{key:"active", label:"Trạng thái", type:"seg", options:[[true,"Đang hoạt động"],[false,"Khoá"]]}] : []),
      {key:"pw", label: isNew ? "Mật khẩu (ít nhất 8 ký tự)" : "Đặt mật khẩu mới (để trống nếu không đổi)", type:"password", required:isNew}
    ],
    saveLabel: isNew ? "Tạo tài khoản" : "Lưu",
    /* Nút Xoá: trưởng phòng/phó phòng/admin, tài khoản khác mình, cấp ≤ mình, không phải admin hệ thống – khớp
       DELETE /api/users/:id (máy chủ mới là nơi chặn thật). Trả false để giữ form mở khi bị từ chối/huỷ. */
    ...(!isNew && canManage && u.id!==S.user.id && u.role!=="admin" && ROLE_RANK[u.role]<=ROLE_RANK[S.user.role] ? {onDelete: async () => {
      if(!confirm(`Xoá tài khoản “${u.username}” (${u.display_name})?\n\nChỉ xoá tài khoản đăng nhập; dữ liệu và nhân sự của họ vẫn giữ nguyên. Nếu chỉ muốn ngăn đăng nhập, hãy chọn “Khoá” thay vì xoá.`)) return false;
      try{ await S.db.api("DELETE", `/api/users/${u.id}`); }catch(e){ toast(e.message || "Không xoá được tài khoản."); return false; }
      toast("Đã xoá tài khoản"); S.users = null; loadUsers();
    }} : {}),
    onSave: async x => {
      try{
        if(isNew) await S.db.api("POST", "/api/users", {username:x.username, password:x.pw, display_name:x.display_name, staff_name:x.staff_name||null, role:x.role});
        else await S.db.api("PATCH", `/api/users/${u.id}`, {username:x.username, display_name:x.display_name, ...(canManage?{staff_name:x.staff_name||null, role:x.role, active:x.active}:{}), ...(x.pw?{password:x.pw}:{})});
      }catch(e){ throw new Error(e.message || "Không lưu được tài khoản."); }
      toast(isNew ? "Đã tạo tài khoản" : "Đã lưu tài khoản"); S.users = null; loadUsers();
    }});
}
function usersPanel(){
  /* Danh sách hiện cho MỌI tài khoản đã đăng nhập (kể cả nhân viên) – không chỉ S.canEdit nữa. */
  if(!(S.server && S.user)) return "";
  if(S.users == null){ loadUsers(); return `<section class="panel" style="margin-bottom:18px"><div class="panel-h"><h2>Tài khoản đăng nhập</h2></div><div class="empty">Đang tải…</div></section>`; }
  return `<section class="panel" style="margin-bottom:18px"><div class="panel-h"><h2>Tài khoản đăng nhập</h2>${S.canEdit?'<button class="btn primary" data-act="adduser">+ Tài khoản</button>':""}</div>
    <div class="tbl-wrap"><table><thead><tr><th>Tên đăng nhập</th><th>Tên hiển thị</th><th>Gắn với nhân sự</th><th>Vai trò</th><th>Trạng thái</th></tr></thead><tbody>
    ${S.users.map(u=>{
      /* Trưởng phòng/phó phòng/admin (S.canEdit): sửa được tài khoản cấp ≤ mình (ROLE_RANK). Nhân viên:
         không quản lý ai, chỉ mở được ĐÚNG dòng của chính mình (để tự đổi tên đăng nhập/hiển thị/mật
         khẩu – xem userForm()). Máy chủ cũng chặn y hệt, đây chỉ ẩn thao tác cho khỏi bấm vào rồi bị từ
         chối. */
      const can = S.canEdit ? ROLE_RANK[u.role]<=ROLE_RANK[S.user.role] : u.id===S.user.id;
      return `<tr ${can?`class="click" data-act="edituser" data-id="${u.id}" tabindex="0"`:""}><td class="cell-main">${esc(u.username)}</td><td>${esc(u.display_name)}</td><td>${esc(u.staff_name||"–")}</td>
      <td>${isFullRole(u.role)?`<span class="pill info">${esc(ROLE_LABEL[u.role]||u.role)}</span>`:'<span class="pill mute">Nhân viên</span>'}</td><td>${u.active?'<span class="pill ok">Hoạt động</span>':'<span class="pill bad">Khoá</span>'}</td></tr>`;
    }).join("")}
    </tbody></table></div><div class="panel-b small muted">Nhân viên cần được “gắn với nhân sự” để nhập theo tuần. Nhân viên chỉ sửa được dữ liệu tuần của chính mình và các dự án do mình tạo.</div></section>`;
}
document.getElementById("userBox").addEventListener("click", e => { const b = e.target.closest("[data-uact]"); if(!b) return; if(b.dataset.uact==="pw") passwordForm(); else logout(); });
